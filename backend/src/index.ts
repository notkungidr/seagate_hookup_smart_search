import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import * as fs from "fs";
import { SearchService } from "./services/searchService";
import { PivotService } from "./services/pivotService";
import { TemplateService } from "./services/templateService";
import { EndpointService } from "./services/endpointService";
import { RegistryService } from "./services/registryService";
import { ConnectionRegistryService } from "./services/connectionRegistryService";
import { getTablesSummary } from "./config/tableRegistry";
import { BATCH_SIZE } from "./config/appConfig";

const app = new Elysia();
const searchService = new SearchService();
const pivotService = new PivotService();
const templateService = new TemplateService();
const endpointService = new EndpointService();
const registryService = new RegistryService();
const connectionRegistryService = new ConnectionRegistryService();

// Ensure the shared templates and dynamic tables exist on server startup
await templateService.ensureTableExists();
await endpointService.ensureTableExists();
await registryService.ensureTableExists();
await registryService.ensureUsersTableExists(); // 🆕 Check/create & seed user control list
await connectionRegistryService.ensureConnectionsTableExists(); // 🆕 Dynamic DB connections added from UI
try {
  // โหลดก่อน reloadDynamicRegistry เพื่อให้เห็น connection ใหม่ตั้งแต่ request แรก
  // ponytail: try/catch — SeagateDev ล่ม/ตารางยังไม่เกิด ต้องไม่ทำ server ทั้งตัว boot ไม่ขึ้น
  await connectionRegistryService.loadAndApply();
} catch (bootErr: any) {
  console.error("⚠️ loadAndApply (registry_connections) failed — รันต่อด้วย static connections:", bootErr?.message || bootErr);
}
try {
  await registryService.reloadDynamicRegistry();
} catch (bootErr: any) {
  console.error("⚠️ reloadDynamicRegistry (registry_tables) failed — รันต่อด้วย static tables:", bootErr?.message || bootErr);
}

// 🆕 Helper: Validate admin employee number (EN) against the DB
async function verifyAdmin(headers: Record<string, string | undefined>): Promise<void> {
  const en = headers["x-user-en"];
  if (!en) {
    throw new Error("401:กรุณาระบุรหัสพนักงาน (x-user-en Header) เพื่อทำรายการนี้");
  }
  const user = await registryService.verifyUserEn(en);
  if (!user || user.permission !== "admin") {
    throw new Error("401:คุณไม่มีสิทธิ์ผู้ใช้ระดับ Admin เพื่อเข้าถึงฟังก์ชันนี้");
  }
}

// 🆕 Helper: แปลงค่าเซลล์สำหรับ CSV — Date จาก mysql2 → "YYYY-MM-DD HH:mm:ss"
// (getHours() ใช้ timezone ของ server ซึ่งตรงกับ wall clock ที่เก็บใน DB)
function csvCell(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())} ${p(v.getHours())}:${p(v.getMinutes())}:${p(v.getSeconds())}`;
  }
  return String(v);
}

// 🆕 Helper: resolve viewer (any registered user) from x-user-en — returns null when header is missing/unknown
async function resolveViewer(headers: Record<string, string | undefined>): Promise<{ en: string; permission: string } | null> {
  const en = headers["x-user-en"];
  if (!en) return null;
  const user = await registryService.verifyUserEn(en);
  if (!user) return null;
  return { en: user.en, permission: user.permission };
}

/**
 * Admission check for /v1/trace params. Step prefixes are exact bindings:
 * `S2_col` cannot be substituted with `S3_col` or bare `col`. Root conditions
 * also allow bare keys (and explicit S1_ keys) for backwards compatibility.
 */
/** Reserved query keys that are never data filters. */
const TRACE_RESERVED_PARAMS = new Set(["format"]);

/**
 * Admits caller params and REJECTS unknown ones loudly. A silently-dropped typo
 * (e.g. `S4_REQ_DATE_gte` — single underscore) used to return 200 with unfiltered
 * data, which is worse than an error for an API other projects consume.
 */
// `col__empty` carries no value — keep it even when blank (bare `col: ""` is still dropped)
const isEmptyOp = (k: string) => /__empty$/i.test(k);

function admitTraceParams(
  incoming: Record<string, string>,
  rootColumns: Set<string>,
  allowedList: string[],
): Record<string, string> {
  const admitted: Record<string, string> = {};
  const rejected: string[] = [];

  for (const [paramName, paramValue] of Object.entries(incoming)) {
    if (TRACE_RESERVED_PARAMS.has(paramName.toLowerCase())) continue;
    if ((paramValue === undefined || paramValue === "") && !isEmptyOp(paramName)) continue;
    // Forward the ORIGINAL key (preserves S<n>_ prefix so runChain can pin the step)
    if (paramMatchesAllowed(paramName, rootColumns, allowedList)) {
      admitted[paramName] = paramValue;
    } else {
      rejected.push(paramName);
    }
  }

  if (rejected.length > 0) {
    const known = [...new Set([...rootColumns, ...allowedList])].sort().join(", ");
    const opTypo = rejected.find((p) => /_(eq|like|in|between|gte|lte)$/i.test(p));
    const hint = opTypo
      ? ` Operator suffix needs TWO underscores — did you mean "${opTypo.replace(/_(eq|like|in|between|gte|lte)$/i, (m) => "_" + m)}"?`
      : "";
    throw new Error(
      `Unknown parameter(s): ${rejected.join(", ")}.${hint} Allowed: ${known}. ` +
      `Optional operator suffixes: __eq __like __in __between __gte __lte __empty`,
    );
  }

  return admitted;
}

function paramMatchesAllowed(paramName: string, rootColumns: Set<string>, allowedList: string[]): boolean {
  // `__op` suffix (e.g. col__gte) inherits its base name's admission
  const { cleanName } = endpointService.parseParamOperator(paramName);
  const pLower = cleanName.toLowerCase();
  const pPrefix = cleanName.match(/^S(\d+)_(.+)$/i);
  // A step prefix is a real binding, not decoration. Never admit S3_field
  // merely because S2_field (or bare field) was allowed.
  if (!pPrefix && rootColumns.has(pLower)) return true;
  if (pPrefix && Number(pPrefix[1]) === 1 && rootColumns.has(pPrefix[2].toLowerCase())) return true;
  return allowedList.some((p) => endpointService.parseParamOperator(p).cleanName.toLowerCase() === pLower);
}

// ── CORS & Swagger ─────────────────────────────────────────────────────────
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "x-user-en"],
}));

app.use(swagger({
  path: "/swagger",
  documentation: {
    info: {
      title: "Smart Pivot Search API Documentation",
      version: "1.0.0",
      description: "Interactive Swagger UI for static and dynamic Seagate Traceability API endpoints."
    }
  }
}));

// Define all routes as a reusable Elysia sub-instance
const apiRoutes = new Elysia()
  // ── GET /tables ─────────────────────────────────────────────────────────
  .get("/tables", async () => {
    try {
      await registryService.reloadDynamicRegistry(); // Keep cache in sync across multiple server instances (e.g. Localhost vs Prod)
      await connectionRegistryService.loadAndApply(); // Sync dynamic connections too (config map only — pools rebuild lazily)
    } catch (err: any) {
      console.error("❌ Failed to reload dynamic registry on GET /tables:", err.message);
    }
    return {
      success: true,
      data: getTablesSummary(),
    };
  })

  // ── GET /config ──────────────────────────────────────────────────────────
  .get("/config", () => {
    return {
      success: true,
      config: {
        pivotBatchSize: BATCH_SIZE,
      },
    };
  })

  // ── GET /distinct ────────────────────────────────────────────────────────
  .get(
    "/distinct",
    async ({ query, set }) => {
      try {
        const result = await searchService.distinct(
          query.table,
          query.column,
          query.search,
          query.limit ? Number(query.limit) : 200
        );
        return { success: true, data: result.data, tooManyDistinct: result.tooManyDistinct };
      } catch (err: any) {
        set.status = 400;
        return { success: false, message: err.message };
      }
    },
    {
      query: t.Object({
        table: t.String({ minLength: 1 }),
        column: t.String({ minLength: 1 }),
        search: t.Optional(t.String()),
        limit: t.Optional(t.String()),
      }),
    }
  )

  // ── POST /search ─────────────────────────────────────────────────────────
  .post(
    "/search",
    async ({ body, set }) => {
      try {
        const result = await searchService.search({
          table: body.table,
          targetServer: body.targetServer,
          column: body.column,
          value: body.value ?? "",
          values: body.values,
          operator: body.operator ?? "like",
          limit: body.limit ?? 1000000,
          conditions: body.conditions,
        });
        return { success: true, data: result };
      } catch (err: any) {
        set.status = 400;
        return { success: false, message: err.message };
      }
    },
    {
      body: t.Object({
        table: t.String({ minLength: 1 }),
        targetServer: t.Optional(t.String({ minLength: 1 })),
        column: t.Optional(t.String()),
        value: t.Optional(t.String()),
        values: t.Optional(t.Array(t.String())),
        operator: t.Optional(t.Union([
          t.Literal("like"),
          t.Literal("eq"),
          t.Literal("in"),
          t.Literal("between"),
          t.Literal("gte"),
          t.Literal("lte")
        ])),
        limit: t.Optional(t.Number({ minimum: 1, maximum: 10000000 })),
        conditions: t.Optional(
          t.Array(
            t.Object({
              column: t.String({ minLength: 1 }),
              operator: t.Union([
                t.Literal("like"),
                t.Literal("eq"),
                t.Literal("in"),
                t.Literal("between"),
                t.Literal("gte"),
                t.Literal("lte")
              ]),
              value: t.Optional(t.String()),
              value2: t.Optional(t.String()),
              values: t.Optional(t.Array(t.String())),
            })
          )
        ),
      }),
    }
  )

  // ── POST /pivot ───────────────────────────────────────────────────────────
  .post(
    "/pivot",
    async ({ body, set }) => {
      try {
        const result = await pivotService.pivot({
          sourceValues: body.sourceValues,
          targetTable: body.targetTable,
          targetServer: body.targetServer,
          targetColumn: body.targetColumn,
          limit: body.limit ?? 1000000,
        });
        return { success: true, data: result };
      } catch (err: any) {
        set.status = 400;
        return { success: false, message: err.message };
      }
    },
    {
      body: t.Object({
        sourceValues: t.Array(t.String(), { minItems: 1 }),
        targetTable: t.String({ minLength: 1 }),
        targetServer: t.Optional(t.String({ minLength: 1 })),
        targetColumn: t.String({ minLength: 1 }),
        limit: t.Optional(t.Number({ minimum: 1, maximum: 10000000 })),
      }),
    }
  )
  // ── POST /registry/login ──────────────────────────────────────────────────
  .post("/registry/login", async ({ body, set }) => {
    try {
      const user = await registryService.verifyUserEn(body.en);
      if (!user) {
        set.status = 401;
        return { success: false, message: "ไม่พบสิทธิ์ผู้ใช้งานหรือรหัสพนักงานไม่ถูกต้อง" };
      }
      return { success: true, data: user };
    } catch (err: any) {
      set.status = 400;
      return { success: false, message: err.message };
    }
  }, {
    body: t.Object({
      en: t.String({ minLength: 1 }),
    })
  })

  // ── GET /registry/tables ──────────────────────────────────────────────────
  .get("/registry/tables", async () => {
    try {
      const data = await registryService.getAll();
      return { success: true, data };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  })

  // ── GET /registry/tables/:id ──────────────────────────────────────────────
  .get("/registry/tables/:id", async ({ params, set }) => {
    try {
      const data = await registryService.getById(params.id);
      if (!data) {
        set.status = 404;
        return { success: false, message: "Table not found" };
      }
      return { success: true, data };
    } catch (err: any) {
      set.status = 400;
      return { success: false, message: err.message };
    }
  })

  // ── POST /registry/tables ─────────────────────────────────────────────────
  .post("/registry/tables", async ({ body, headers, set }) => {
    try {
      await verifyAdmin(headers);
      const data = await registryService.create(body as any, true); // 🆕 allowShadow = true for admins
      return { success: true, data };
    } catch (err: any) {
      if (err.message.startsWith("401:")) {
        set.status = 401;
        return { success: false, message: err.message.substring(4) };
      }
      set.status = 400;
      return { success: false, message: err.message };
    }
  })

  // ── PUT /registry/tables/:id ──────────────────────────────────────────────
  .put("/registry/tables/:id", async ({ params, body, headers, set }) => {
    try {
      await verifyAdmin(headers);
      const data = await registryService.update(params.id, body as any, true); // 🆕 allowShadow = true for admins
      return { success: true, data };
    } catch (err: any) {
      if (err.message.startsWith("401:")) {
        set.status = 401;
        return { success: false, message: err.message.substring(4) };
      }
      set.status = 400;
      return { success: false, message: err.message };
    }
  })

  // ── DELETE /registry/tables/:id ───────────────────────────────────────────
  .delete("/registry/tables/:id", async ({ params, headers, set }) => {
    try {
      await verifyAdmin(headers);
      await registryService.delete(params.id);
      return { success: true };
    } catch (err: any) {
      if (err.message.startsWith("401:")) {
        set.status = 401;
        return { success: false, message: err.message.substring(4) };
      }
      set.status = 400;
      return { success: false, message: err.message };
    }
  })

  // ── POST /registry/preview-columns (admin-only: รับ connection key จากภายนอก) ──
  .post("/registry/preview-columns", async ({ body, headers, set }) => {
    try {
      await verifyAdmin(headers);
      const data = await registryService.previewColumns(body.connectionKey, body.tableName);
      return { success: true, data };
    } catch (err: any) {
      if (err.message.startsWith("401:")) {
        set.status = 401;
        return { success: false, message: err.message.substring(4) };
      }
      set.status = 400;
      return { success: false, message: err.message };
    }
  }, {
    body: t.Object({
      connectionKey: t.String({ minLength: 1 }),
      tableName: t.String({ minLength: 1 }),
    })
  })

  // ── POST /registry/test-query (admin-only: รับ SQL จากภายนอก) ─────────────
  .post("/registry/test-query", async ({ body, headers, set }) => {
    try {
      await verifyAdmin(headers);
      const result = await registryService.testQuery(
        body.connectionKey,
        body.sql,
        body.params ?? []
      );
      return { success: true, data: result.rows, tookMs: result.tookMs };
    } catch (err: any) {
      if (err.message.startsWith("401:")) {
        set.status = 401;
        return { success: false, message: err.message.substring(4) };
      }
      set.status = 400;
      return { success: false, message: err.message };
    }
  }, {
    body: t.Object({
      connectionKey: t.String({ minLength: 1 }),
      sql: t.String({ minLength: 1 }),
      params: t.Optional(t.Array(t.Any())),
    })
  })

  // ── POST /registry/reload ─────────────────────────────────────────────────
  .post("/registry/reload", async ({ headers, set }) => {
    try {
      await verifyAdmin(headers);
      await connectionRegistryService.loadAndApply();
      await registryService.reloadDynamicRegistry();
      return { success: true };
    } catch (err: any) {
      if (err.message.startsWith("401:")) {
        set.status = 401;
        return { success: false, message: err.message.substring(4) };
      }
      set.status = 400;
      return { success: false, message: err.message };
    }
  })

  // ── GET /registry/connections (list — password ไม่มีวันออกจาก endpoint นี้) ──
  .get("/registry/connections", async ({ headers, set }) => {
    try {
      await verifyAdmin(headers);
      const data = await connectionRegistryService.list();
      return { success: true, data };
    } catch (err: any) {
      if (err.message.startsWith("401:")) {
        set.status = 401;
        return { success: false, message: err.message.substring(4) };
      }
      set.status = 400;
      return { success: false, message: err.message };
    }
  })

  // ── POST /registry/connections ────────────────────────────────────────────
  .post("/registry/connections", async ({ body, headers, set }) => {
    try {
      await verifyAdmin(headers);
      await connectionRegistryService.create(body);
      return { success: true };
    } catch (err: any) {
      if (err.message.startsWith("401:")) {
        set.status = 401;
        return { success: false, message: err.message.substring(4) };
      }
      set.status = 400;
      return { success: false, message: err.message };
    }
  }, {
    body: t.Object({
      id: t.String({ minLength: 1 }),
      label: t.Optional(t.String()),
      host: t.String({ minLength: 1 }),
      port: t.Optional(t.Number()),
      user: t.String({ minLength: 1 }),
      password: t.String({ minLength: 1 }),
      dbName: t.Optional(t.Union([t.String(), t.Null()])),
      type: t.Optional(t.Union([t.Literal("mysql"), t.Literal("oracle")])),
      isActive: t.Optional(t.Boolean()),
    })
  })

  // ── PUT /registry/connections/:id (password ว่าง = คงรหัสเดิม) ─────────────
  .put("/registry/connections/:id", async ({ params, body, headers, set }) => {
    try {
      await verifyAdmin(headers);
      await connectionRegistryService.update(params.id, body);
      return { success: true };
    } catch (err: any) {
      if (err.message.startsWith("401:")) {
        set.status = 401;
        return { success: false, message: err.message.substring(4) };
      }
      set.status = 400;
      return { success: false, message: err.message };
    }
  }, {
    body: t.Object({
      label: t.Optional(t.String()),
      host: t.Optional(t.String({ minLength: 1 })),
      port: t.Optional(t.Number()),
      user: t.Optional(t.String({ minLength: 1 })),
      password: t.Optional(t.String()),
      dbName: t.Optional(t.Union([t.String(), t.Null()])),
      type: t.Optional(t.Union([t.Literal("mysql"), t.Literal("oracle")])),
      isActive: t.Optional(t.Boolean()),
    })
  })

  // ── DELETE /registry/connections/:id ──────────────────────────────────────
  .delete("/registry/connections/:id", async ({ params, headers, set }) => {
    try {
      await verifyAdmin(headers);
      await connectionRegistryService.delete(params.id);
      return { success: true };
    } catch (err: any) {
      if (err.message.startsWith("401:")) {
        set.status = 401;
        return { success: false, message: err.message.substring(4) };
      }
      set.status = 400;
      return { success: false, message: err.message };
    }
  })

  // ── POST /registry/connections/:id/test ───────────────────────────────────
  .post("/registry/connections/:id/test", async ({ params, headers, set }) => {
    try {
      await verifyAdmin(headers);
      const result = await connectionRegistryService.testConnection(params.id);
      return { success: true, ...result };
    } catch (err: any) {
      if (err.message.startsWith("401:")) {
        set.status = 401;
        return { success: false, message: err.message.substring(4) };
      }
      set.status = 400;
      return { success: false, message: err.message };
    }
  })

  // ── GET /registry/users ───────────────────────────────────────────────────
  .get("/registry/users", async ({ headers, set }) => {
    try {
      await verifyAdmin(headers);
      const data = await registryService.getAllUsers();
      return { success: true, data };
    } catch (err: any) {
      if (err.message.startsWith("401:")) {
        set.status = 401;
        return { success: false, message: err.message.substring(4) };
      }
      set.status = 400;
      return { success: false, message: err.message };
    }
  })

  // ── POST /registry/users ──────────────────────────────────────────────────
  .post("/registry/users", async ({ body, headers, set }) => {
    try {
      await verifyAdmin(headers);
      const data = await registryService.createUser(body);
      return { success: true, data };
    } catch (err: any) {
      if (err.message.startsWith("401:")) {
        set.status = 401;
        return { success: false, message: err.message.substring(4) };
      }
      set.status = 400;
      return { success: false, message: err.message };
    }
  }, {
    body: t.Object({
      en: t.String({ minLength: 1 }),
      name: t.String({ minLength: 1 }),
      permission: t.String({ minLength: 1 }),
    })
  })

  // ── PUT /registry/users/:en ───────────────────────────────────────────────
  .put("/registry/users/:en", async ({ params, body, headers, set }) => {
    try {
      await verifyAdmin(headers);
      const data = await registryService.updateUser(params.en, body);
      return { success: true, data };
    } catch (err: any) {
      if (err.message.startsWith("401:")) {
        set.status = 401;
        return { success: false, message: err.message.substring(4) };
      }
      set.status = 400;
      return { success: false, message: err.message };
    }
  }, {
    body: t.Object({
      name: t.Optional(t.String()),
      permission: t.Optional(t.String()),
    })
  })

  // ── DELETE /registry/users/:en ────────────────────────────────────────────
  .delete("/registry/users/:en", async ({ params, headers, set }) => {
    try {
      await verifyAdmin(headers);
      await registryService.deleteUser(params.en);
      return { success: true };
    } catch (err: any) {
      if (err.message.startsWith("401:")) {
        set.status = 401;
        return { success: false, message: err.message.substring(4) };
      }
      set.status = 400;
      return { success: false, message: err.message };
    }
  })

  // ── GET /templates ──────────────────────────────────────────────────────
  .get("/templates", async ({ headers }) => {
    try {
      const viewer = await resolveViewer(headers);
      const data = await templateService.getAll(viewer);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  })

  // ── POST /templates ─────────────────────────────────────────────────────
  .post("/templates", async ({ body, headers, set }) => {
    try {
      await verifyAdmin(headers);
      const en = headers["x-user-en"];
      const payload: any = body;
      const result = await templateService.save({
        ...payload,
        createdBy: en,
        visibility: payload.visibility === "restricted" ? "restricted" : (payload.visibility === "private" ? "private" : "public"),
        allowedUsers: Array.isArray(payload.allowedUsers) ? payload.allowedUsers : [],
      });
      return { success: true, data: result };
    } catch (err: any) {
      if (err.message.startsWith("401:")) {
        set.status = 401;
        return { success: false, message: err.message.substring(4) };
      }
      set.status = 400;
      return { success: false, message: err.message };
    }
  })

  // ── PUT /templates/:id ──────────────────────────────────────────────────
  .put("/templates/:id", async ({ params, body, headers, set }) => {
    try {
      await verifyAdmin(headers);
      const result = await templateService.update(params.id, body as any);
      return { success: true, data: result };
    } catch (err: any) {
      if (err.message.startsWith("401:")) {
        set.status = 401;
        return { success: false, message: err.message.substring(4) };
      }
      set.status = 400;
      return { success: false, message: err.message };
    }
  })

  // ── DELETE /templates/:id ───────────────────────────────────────────────
  .delete("/templates/:id", async ({ params, headers, set }) => {
    try {
      await verifyAdmin(headers);
      await templateService.delete(params.id);
      return { success: true };
    } catch (err: any) {
      if (err.message.startsWith("401:")) {
        set.status = 401;
        return { success: false, message: err.message.substring(4) };
      }
      set.status = 400;
      return { success: false, message: err.message };
    }
  })

  // ── GET /v1/endpoints ──────────────────────────────────────────────────
  .get("/v1/endpoints", async ({ headers }) => {
    try {
      const viewer = await resolveViewer(headers);
      const data = await endpointService.getAll(viewer);
      return { success: true, data, viewer };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  })

  // ── POST /v1/endpoints ─────────────────────────────────────────────────
  .post("/v1/endpoints", async ({ body, headers, set }) => {
    try {
      const en = headers["x-user-en"];
      if (!en) {
        set.status = 401;
        return { success: false, message: "กรุณาระบุรหัสพนักงาน (x-user-en Header) เพื่อสร้าง API" };
      }
      const user = await registryService.verifyUserEn(en);
      if (!user) {
        set.status = 401;
        return { success: false, message: "รหัสพนักงานไม่อยู่ในระบบ ไม่สามารถสร้าง API ได้" };
      }
      const payload: any = body;
      const templateId = String(payload.templateId || "").trim();
      if (!templateId) {
        set.status = 400;
        return {
          success: false,
          message: "Create and save a Template first, then publish that Template as an API endpoint (templateId is required).",
        };
      }
      const template = await templateService.getById(templateId);
      if (!template) {
        set.status = 404;
        return { success: false, message: `Template "${templateId}" not found.` };
      }
      const endpointId = String(payload.id || "").trim();
      const endpointName = String(payload.name || "").trim();
      if (!endpointId || !endpointName) {
        set.status = 400;
        return { success: false, message: "Endpoint id and name are required." };
      }
      const endpointConfig = endpointService.buildConfigFromTemplate(template, {
        visibleCols: Array.isArray(payload.visibleCols) ? payload.visibleCols : undefined,
        allowedParams: Array.isArray(payload.allowedParams) ? payload.allowedParams : undefined,
      });

      // Publishing the same slug again intentionally repairs/rebuilds the
      // existing API from the selected Template while preserving its URL.
      const existingEndpoint = await endpointService.getById(endpointId);
      if (existingEndpoint) {
        if (user.permission !== "admin" && existingEndpoint.createdBy !== user.en) {
          set.status = 403;
          return { success: false, message: "You cannot republish an endpoint owned by another user." };
        }
        const result = await endpointService.update(endpointId, {
          name: endpointName,
          description: payload.description || "",
          config: endpointConfig,
          visibility: payload.visibility === "restricted" ? "restricted" : "public",
          apiGroup: payload.apiGroup || "General",
          allowedUsers: Array.isArray(payload.allowedUsers) ? payload.allowedUsers : [],
        });
        return { success: true, data: result, republished: true };
      }

      const result = await endpointService.create({
        id: endpointId,
        name: endpointName,
        description: payload.description || "",
        config: endpointConfig,
        createdAt: "",
        updatedAt: "",
        createdBy: user.en,
        visibility: payload.visibility === "restricted" ? "restricted" : "public",
        apiGroup: payload.apiGroup || "General",
        allowedUsers: Array.isArray(payload.allowedUsers) ? payload.allowedUsers : [],
      });
      return { success: true, data: result };
    } catch (err: any) {
      set.status = 400;
      return { success: false, message: err.message };
    }
  })

  // ── PUT /v1/endpoints/:id ────────────────────────────────────────────
  .put("/v1/endpoints/:id", async ({ params, body, headers, set }) => {
    try {
      const viewer = await resolveViewer(headers);
      if (!viewer) {
        set.status = 401;
        return { success: false, message: "กรุณาระบุรหัสพนักงาน (x-user-en Header)" };
      }
      const existing = await endpointService.getById(params.id);
      if (!existing) {
        set.status = 404;
        return { success: false, message: "Endpoint not found" };
      }
      if (viewer.permission !== "admin" && existing.createdBy !== viewer.en) {
        set.status = 403;
        return { success: false, message: "คุณไม่ใช่ผู้สร้าง API นี้ จึงไม่สามารถแก้ไขได้" };
      }
      const requestedPatch: any = body && typeof body === "object" ? body : {};
      // Chain definitions are immutable snapshots cloned from Templates. The
      // generic metadata PUT route must not let clients reintroduce hand-built
      // table/field/hop configs.
      const { config: _ignoredConfig, id: _ignoredId, createdBy: _ignoredCreatedBy, ...safePatch } = requestedPatch;
      const result = await endpointService.update(params.id, safePatch);
      return { success: true, data: result };
    } catch (err: any) {
      set.status = 400;
      return { success: false, message: err.message };
    }
  })

  // ── DELETE /v1/endpoints/:id ─────────────────────────────────────────
  .delete("/v1/endpoints/:id", async ({ params, headers, set }) => {
    try {
      const viewer = await resolveViewer(headers);
      if (!viewer) {
        set.status = 401;
        return { success: false, message: "กรุณาระบุรหัสพนักงาน (x-user-en Header)" };
      }
      const existing = await endpointService.getById(params.id);
      if (!existing) {
        set.status = 404;
        return { success: false, message: "Endpoint not found" };
      }
      if (viewer.permission !== "admin" && existing.createdBy !== viewer.en) {
        set.status = 403;
        return { success: false, message: "คุณไม่ใช่ผู้สร้าง API นี้ จึงไม่สามารถลบได้" };
      }
      await endpointService.delete(params.id);
      return { success: true };
    } catch (err: any) {
      set.status = 400;
      return { success: false, message: err.message };
    }
  })

  // ── GET /v1/trace/:id ────────────────────────────────────────────────
  // Runs the full pivot chain for a saved endpoint (GET / Query Params)
  .get("/v1/trace/:id", async ({ params, query, headers, set }) => {
    try {
      console.error(`[TRACE] GET /v1/trace/${params.id}`, query);
      const ep = await endpointService.getById(params.id);
      if (!ep) {
        set.status = 404;
        return { success: false, message: `Endpoint "${params.id}" not found` };
      }

      const viewer = await resolveViewer(headers);
      if (!endpointService.canViewerAccess(ep, viewer)) {
        set.status = 403;
        return { success: false, message: "คุณไม่มีสิทธิ์เรียกใช้ API endpoint นี้" };
      }

      const { format, ...searchParams } = query as Record<string, string>;

      const allowedList = ep.config.allowedParams || [];
      const rootColumns = new Set<string>();
      if (ep.config.rootColumn) rootColumns.add(ep.config.rootColumn.toLowerCase());
      if (ep.config.rootConditions) {
        ep.config.rootConditions.forEach(c => {
          if (c.column) rootColumns.add(c.column.toLowerCase());
        });
      }

      const allowedSearchParams = admitTraceParams(searchParams, rootColumns, allowedList);

      // 1. Run database chains
      console.error(`[TRACE] runChain with params:`, allowedSearchParams);
      const result = await endpointService.runChain(ep.config, allowedSearchParams);
      console.error(`[TRACE] runChain returned ${result.steps.length} steps`);
      console.error(`[TRACE] Step row counts:`, result.steps.map((s, i) => `${i}:${s.rows.length}`).join(' '));

      // 2. Perform server-side left-join of all steps
      console.error(`[TRACE] combineSteps starting...`);
      const combinedRows = endpointService.combineSteps(result.steps, ep.config, result.seededSteps, result.emptyCols);
      console.error(`[TRACE] combineSteps returned ${combinedRows.length} rows`);

      // 3. Filter combined rows in-memory (bare = legacy substring; `__gte`/`__lte`/`__between`/`__in`/`__eq`/`__like` = operator)
      const filteredRows = endpointService.filterCombinedRows(ep.config, combinedRows, allowedSearchParams);
      console.error(`[TRACE] After in-memory filter: ${filteredRows.length} rows`);

      if (format === "csv") {
        if (filteredRows.length === 0) {
          set.headers["Content-Type"] = "text/csv";
          return "";
        }
        const headers = Object.keys(filteredRows[0]);
        const csvLines = [
          headers.join(","),
          ...filteredRows.map(row =>
            headers.map(h => {
              const v = csvCell(row[h]);
              return v.includes(",") || v.includes('"') || v.includes("\n")
                ? `"${v.replace(/"/g, '""')}"`
                : v;
            }).join(",")
          ),
        ];
        set.headers["Content-Type"] = "text/csv";
        set.headers["Content-Disposition"] = `attachment; filename="${params.id}.csv"`;
        return csvLines.join("\n");
      }

      return { success: true, id: params.id, name: ep.name, count: filteredRows.length, data: filteredRows };
    } catch (err: any) {
      set.status = 400;
      return { success: false, message: err.message };
    }
  })

  // ── POST /v1/trace/:id ───────────────────────────────────────────────
  // Runs the full pivot chain for a saved endpoint supporting JSON Payload (POST)
  .post("/v1/trace/:id", async ({ params, body, query, headers, set }) => {
    try {
      const ep = await endpointService.getById(params.id);
      if (!ep) {
        set.status = 404;
        return { success: false, message: `Endpoint "${params.id}" not found` };
      }

      const viewer = await resolveViewer(headers);
      if (!endpointService.canViewerAccess(ep, viewer)) {
        set.status = 403;
        return { success: false, message: "คุณไม่มีสิทธิ์เรียกใช้ API endpoint นี้" };
      }

      // Merge body parameters and query parameters
      const mergedParams: Record<string, string> = {};

      // 1. Process query params
      const { format, ...queryParams } = query as Record<string, string>;
      for (const [k, v] of Object.entries(queryParams)) {
        if ((v !== undefined && v !== "") || isEmptyOp(k)) {
          mergedParams[k] = String(v);
        }
      }

      // 2. Process POST body params (JSON style)
      // Elysia parses JSON only with Content-Type: application/json. Clients
      // that omit the header (curl -d, some HTTP tools) send form-urlencoded,
      // so a JSON payload arrives mangled as { "<whole json>": "" } and params
      // used to be silently dropped — the chain then ran with saved defaults.
      const contentType = String(headers["content-type"] || "").toLowerCase();
      const parseJsonBody = (raw: string): unknown => {
        try {
          return JSON.parse(raw.replace(/^﻿/, "").trim());
        } catch {
          return undefined;
        }
      };
      // NB: อย่าใช้ String(body) — body ที่ Elysia parse จาก form-urlencoded จะโยน
      // TypeError "No default value" ตอนแปลงเป็น primitive (quirk ของ Bun) ใช้
      // JSON.stringify แทน ซึ่งปลอดภัยกับทุกรูปแบบ
      const previewOf = (b: unknown): string => {
        try {
          return typeof b === "string" ? b.slice(0, 60) : (JSON.stringify(b) ?? "").slice(0, 60);
        } catch {
          return "(uninspectable)";
        }
      };
      const bodyDetail = `Content-Type "${contentType || "(none)"}", body type ${body === null ? "null" : typeof body}${body != null ? `, starts with: ${previewOf(body)}` : ""}`;
      let bodyParams: unknown = body;
      if (typeof bodyParams === "string") {
        if (bodyParams.trim()) {
          const parsed = parseJsonBody(bodyParams);
          if (parsed === undefined) {
            set.status = 400;
            console.error(`[TRACE] POST body not parseable: ${bodyDetail}`);
            return { success: false, message: `POST body must be valid JSON — got ${bodyDetail}. Send header "Content-Type: application/json".` };
          }
          bodyParams = parsed;
        } else {
          bodyParams = undefined;
        }
      } else if (bodyParams && typeof bodyParams === "object" && contentType && !contentType.includes("application/json")) {
        const rawEntries = Object.entries(bodyParams as Record<string, unknown>);
        const raw = Object.keys(bodyParams as Record<string, unknown>).join("&");
        const parsed = parseJsonBody(raw);
        if (parsed && typeof parsed === "object" && rawEntries.some(([, v]) => v === "" || v == null)) {
          bodyParams = parsed; // JSON payload mangled into form keys — recover it
        } else if (rawEntries.length && rawEntries.every(([, v]) => v === "" || v == null)) {
          set.status = 400;
          console.error(`[TRACE] POST body not parseable (form-mangled): ${bodyDetail}`);
          return { success: false, message: `POST body must be valid JSON — got ${bodyDetail}. Send header "Content-Type: application/json".` };
        }
        // else: real form-encoded params — keep entries as key/value params
      }
      if (bodyParams && typeof bodyParams === "object") {
        for (const [k, v] of Object.entries(bodyParams as Record<string, unknown>)) {
          if ((v !== undefined && v !== null && v !== "") || isEmptyOp(k)) {
            if (Array.isArray(v)) {
              mergedParams[k] = v.join("\n");
            } else {
              mergedParams[k] = String(v);
            }
          }
        }
      }

      const allowedList = ep.config.allowedParams || [];
      const rootColumns = new Set<string>();
      if (ep.config.rootColumn) rootColumns.add(ep.config.rootColumn.toLowerCase());
      if (ep.config.rootConditions) {
        ep.config.rootConditions.forEach(c => {
          if (c.column) rootColumns.add(c.column.toLowerCase());
        });
      }

      const allowedSearchParams = admitTraceParams(mergedParams, rootColumns, allowedList);

      // 1. Run database chains
      console.error(`[TRACE] runChain with params:`, allowedSearchParams);
      const result = await endpointService.runChain(ep.config, allowedSearchParams);
      console.error(`[TRACE] runChain returned ${result.steps.length} steps`);
      console.error(`[TRACE] Step row counts:`, result.steps.map((s, i) => `${i}:${s.rows.length}`).join(' '));

      // 2. Perform server-side left-join of all steps
      console.error(`[TRACE] combineSteps starting...`);
      const combinedRows = endpointService.combineSteps(result.steps, ep.config, result.seededSteps, result.emptyCols);
      console.error(`[TRACE] combineSteps returned ${combinedRows.length} rows`);

      // 3. Filter combined rows in-memory (bare = legacy substring; `__gte`/`__lte`/`__between`/`__in`/`__eq`/`__like` = operator)
      const filteredRows = endpointService.filterCombinedRows(ep.config, combinedRows, allowedSearchParams);

      const responseFormat = format || (body && (body as any).format) || "json";

      if (responseFormat === "csv") {
        if (filteredRows.length === 0) {
          set.headers["Content-Type"] = "text/csv";
          return "";
        }
        const headers = Object.keys(filteredRows[0]);
        const csvLines = [
          headers.join(","),
          ...filteredRows.map(row =>
            headers.map(h => {
              const v = csvCell(row[h]);
              return v.includes(",") || v.includes('"') || v.includes("\n")
                ? `"${v.replace(/"/g, '""')}"`
                : v;
            }).join(",")
          ),
        ];
        set.headers["Content-Type"] = "text/csv";
        set.headers["Content-Disposition"] = `attachment; filename="${params.id}.csv"`;
        return csvLines.join("\n");
      }

      return { success: true, id: params.id, name: ep.name, count: filteredRows.length, data: filteredRows };
    } catch (err: any) {
      console.error("[TRACE] POST error:", err?.stack || err);
      set.status = 400;
      return { success: false, message: err.message };
    }
  });;

// Mount the apiRoutes under the default '/api' prefix
app.group("/api", (grp) => grp.use(apiRoutes));

// Mount the apiRoutes under the public path '/prodline/seagate/hookup/hookup_smart_search/api' prefix
app.group("/prodline/seagate/hookup/hookup_smart_search/api", (grp) => grp.use(apiRoutes));

// ── SSL/TLS Certificate paths (production)
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || "/etc/httpd/conf/ssl.crt/beltontechnology_com.crt";
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || "/etc/httpd/conf/ssl.crt/beltontechnology_com.key";
const SSL_CA_PATH = process.env.SSL_CA_PATH || "/etc/httpd/conf/ssl.crt/beltontechnology_com.ca-bundle";

// ── START ─────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT || 9090);
const listenOptions: any = { port: PORT };

let protocol = "https";

try {
  if (fs.existsSync(SSL_CERT_PATH) && fs.existsSync(SSL_KEY_PATH)) {
    const tlsOptions: any = {
      cert: fs.readFileSync(SSL_CERT_PATH),
      key: fs.readFileSync(SSL_KEY_PATH),
      requestCert: false,
      rejectUnauthorized: false,
    };

    if (fs.existsSync(SSL_CA_PATH)) {
      tlsOptions.ca = fs.readFileSync(SSL_CA_PATH);
    }

    listenOptions.tls = tlsOptions;
    protocol = "https";
    console.log(`🔒 SSL/TLS Enabled using cert: ${SSL_CERT_PATH}`);
  } else {
    console.log("ℹ️ SSL certificates not found. Running on HTTP.");
  }
} catch (error: any) {
  console.error("⚠️ Failed to load SSL Certificates, falling back to HTTP:", error.message);
}

app.listen(listenOptions);

console.log(`🚀 Smart Pivot Search API is running at ${protocol}://localhost:${PORT}`);
console.log(`   GET  ${protocol}://localhost:${PORT}/api/tables`);
console.log(`   POST ${protocol}://localhost:${PORT}/api/search`);
console.log(`   POST ${protocol}://localhost:${PORT}/api/pivot`);
console.log(`   GET  ${protocol}://localhost:${PORT}/api/templates`);


