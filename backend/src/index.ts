import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import * as fs from "fs";
import { SearchService } from "./services/searchService";
import { PivotService } from "./services/pivotService";
import { TemplateService } from "./services/templateService";
import { EndpointService } from "./services/endpointService";
import { RegistryService } from "./services/registryService";
import { getTablesSummary } from "./config/tableRegistry";
import { BATCH_SIZE } from "./config/appConfig";

const app = new Elysia();
const searchService = new SearchService();
const pivotService = new PivotService();
const templateService = new TemplateService();
const endpointService = new EndpointService();
const registryService = new RegistryService();

// Ensure the shared templates and dynamic tables exist on server startup
await templateService.ensureTableExists();
await endpointService.ensureTableExists();
await registryService.ensureTableExists();
await registryService.ensureUsersTableExists(); // 🆕 Check/create & seed user control list
await registryService.reloadDynamicRegistry();

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

// 🆕 Helper: resolve viewer (any registered user) from x-user-en — returns null when header is missing/unknown
async function resolveViewer(headers: Record<string, string | undefined>): Promise<{ en: string; permission: string } | null> {
  const en = headers["x-user-en"];
  if (!en) return null;
  const user = await registryService.verifyUserEn(en);
  if (!user) return null;
  return { en: user.en, permission: user.permission };
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

  // ── POST /registry/preview-columns ────────────────────────────────────────
  .post("/registry/preview-columns", async ({ body, set }) => {
    try {
      const data = await registryService.previewColumns(body.connectionKey, body.tableName);
      return { success: true, data };
    } catch (err: any) {
      set.status = 400;
      return { success: false, message: err.message };
    }
  }, {
    body: t.Object({
      connectionKey: t.String({ minLength: 1 }),
      tableName: t.String({ minLength: 1 }),
    })
  })

  // ── POST /registry/test-query ─────────────────────────────────────────────
  .post("/registry/test-query", async ({ body, set }) => {
    try {
      const result = await registryService.testQuery(
        body.connectionKey,
        body.sql,
        body.params ?? []
      );
      return { success: true, data: result.rows, tookMs: result.tookMs };
    } catch (err: any) {
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
      const result = await endpointService.create({
        ...payload,
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
      const result = await endpointService.update(params.id, body as any);
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

      const allowedSearchParams: Record<string, string> = {};
      const allowedList = ep.config.allowedParams || [];
      const rootColumns = new Set<string>();
      if (ep.config.rootColumn) rootColumns.add(ep.config.rootColumn.toLowerCase());
      if (ep.config.rootConditions) {
        ep.config.rootConditions.forEach(c => {
          if (c.column) rootColumns.add(c.column.toLowerCase());
        });
      }

      for (const [paramName, paramValue] of Object.entries(searchParams)) {
        if (paramValue === undefined || paramValue === "") continue;
        const isRootCol = rootColumns.has(paramName.toLowerCase());
        const isAllowed = isRootCol || allowedList.length === 0 || allowedList.some(
          (p) => p.toLowerCase() === paramName.toLowerCase()
        );

        if (isAllowed) {
          const exactKey = allowedList.find((p) => p.toLowerCase() === paramName.toLowerCase()) ||
            Array.from(rootColumns).find((p) => p.toLowerCase() === paramName.toLowerCase()) ||
            paramName;
          allowedSearchParams[exactKey] = paramValue;
        }
      }

      // 1. Run database chains
      const result = await endpointService.runChain(ep.config, allowedSearchParams);

      // 2. Perform server-side left-join of all steps
      const combinedRows = endpointService.combineSteps(result.steps, ep.config);

      // 3. Filter combined rows in-memory by query parameters (exact/substring/multi-value search with dynamic alias fallback)
      let filteredRows = combinedRows;
      for (const [paramName, paramValue] of Object.entries(allowedSearchParams)) {
        const rawString = String(paramValue).trim();
        const valList = rawString.split(/[\n,]+/).map(v => v.trim().toLowerCase()).filter(Boolean);
        if (valList.length === 0) continue;

        filteredRows = filteredRows.filter((row) => {
          let cellVal = row[paramName];
          if (cellVal === undefined) {
            // Case/underscore-insensitive key matching and prefix fallback
            const normParam = paramName.toLowerCase().replace(/[^a-z0-9]/g, "");
            const foundKey = Object.keys(row).find(
              (k) => {
                const normK = k.toLowerCase().replace(/[^a-z0-9]/g, "");
                return normK === normParam || normK.replace(/^s\d+/, "") === normParam;
              }
            );
            if (foundKey) {
              cellVal = row[foundKey];
            }
          }

          if (cellVal == null) return false;
          const cellStr = String(cellVal).trim().toLowerCase();
          return valList.some(v => cellStr.includes(v) || v.includes(cellStr));
        });
      }

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
              const v = row[h] == null ? "" : String(row[h]);
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
        if (v !== undefined && v !== "") {
          mergedParams[k] = String(v);
        }
      }

      // 2. Process POST body params (JSON style)
      if (body && typeof body === "object") {
        for (const [k, v] of Object.entries(body)) {
          if (v !== undefined && v !== null && v !== "") {
            if (Array.isArray(v)) {
              mergedParams[k] = v.join("\n");
            } else {
              mergedParams[k] = String(v);
            }
          }
        }
      }

      const allowedSearchParams: Record<string, string> = {};
      const allowedList = ep.config.allowedParams || [];
      const rootColumns = new Set<string>();
      if (ep.config.rootColumn) rootColumns.add(ep.config.rootColumn.toLowerCase());
      if (ep.config.rootConditions) {
        ep.config.rootConditions.forEach(c => {
          if (c.column) rootColumns.add(c.column.toLowerCase());
        });
      }

      for (const [paramName, paramValue] of Object.entries(mergedParams)) {
        const isRootCol = rootColumns.has(paramName.toLowerCase());
        const isAllowed = isRootCol || allowedList.length === 0 || allowedList.some(
          (p) => p.toLowerCase() === paramName.toLowerCase()
        );

        if (isAllowed) {
          const exactKey = allowedList.find((p) => p.toLowerCase() === paramName.toLowerCase()) ||
            Array.from(rootColumns).find((p) => p.toLowerCase() === paramName.toLowerCase()) ||
            paramName;
          allowedSearchParams[exactKey] = paramValue;
        }
      }

      // 1. Run database chains
      const result = await endpointService.runChain(ep.config, allowedSearchParams);

      // 2. Perform server-side left-join of all steps
      const combinedRows = endpointService.combineSteps(result.steps, ep.config);

      // 3. Filter combined rows in-memory by query parameters (exact/substring/multi-value search with dynamic alias fallback)
      let filteredRows = combinedRows;
      for (const [paramName, paramValue] of Object.entries(allowedSearchParams)) {
        const rawString = String(paramValue).trim();
        const valList = rawString.split(/[\n,]+/).map(v => v.trim().toLowerCase()).filter(Boolean);
        if (valList.length === 0) continue;

        filteredRows = filteredRows.filter((row) => {
          let cellVal = row[paramName];
          if (cellVal === undefined) {
            // Case/underscore-insensitive key matching and prefix fallback
            const normParam = paramName.toLowerCase().replace(/[^a-z0-9]/g, "");
            const foundKey = Object.keys(row).find(
              (k) => {
                const normK = k.toLowerCase().replace(/[^a-z0-9]/g, "");
                return normK === normParam || normK.replace(/^s\d+/, "") === normParam;
              }
            );
            if (foundKey) {
              cellVal = row[foundKey];
            }
          }

          if (cellVal == null) return false;
          const cellStr = String(cellVal).trim().toLowerCase();
          return valList.some(v => cellStr.includes(v) || v.includes(cellStr));
        });
      }

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
              const v = row[h] == null ? "" : String(row[h]);
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

let protocol = "http";

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


