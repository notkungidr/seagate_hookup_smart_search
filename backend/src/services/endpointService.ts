import { dbSeagateDev, getRawPool } from "../db/client";
import { savedEndpoints } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { SearchService, SearchCondition } from "./searchService";
import { PivotService } from "./pivotService";
import { getTableMeta } from "../config/tableRegistry";

const searchService = new SearchService();
const pivotService = new PivotService();

export interface EndpointConfig {
  /** Template that this public API was cloned from. Required for new endpoints. */
  sourceTemplateId?: string;
  rootTable: string;
  rootColumn: string;
  rootOperator?: string;
  rootConditions?: SearchCondition[];
  hops: {
    fromColumnKey: string;
    targetTable: string;
    targetColumn: string;
    /** Canonical template field: 0-based source step index. */
    fromStepIdx?: number;
    /** Legacy endpoint field. Read-only compatibility for endpoints saved before template parity. */
    parentStepIdx?: number;
  }[];
  visibleCols?: string[];
  allowedParams?: string[];
}

export interface SavedEndpoint {
  id: string; // varchar slug identifier e.g., 'aca-laser-vmi-flow'
  name: string;
  description?: string;
  config: EndpointConfig;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  visibility?: "public" | "restricted";
  apiGroup?: string;
  allowedUsers?: string[];
}

export class EndpointService {
  /** Resolve a registry key/dbColumn/label to the canonical registry column key. */
  private resolveColumnKey(tableKey: string, column: string, context: string): string {
    const meta = getTableMeta(tableKey);
    if (!meta) {
      throw new Error(`${context}: table "${tableKey}" not found in registry.`);
    }

    const raw = String(column || "").trim();
    const match = Object.keys(meta.columns).find((key) =>
      key.toLowerCase() === raw.toLowerCase() ||
      meta.columns[key].dbColumn.toLowerCase() === raw.toLowerCase() ||
      meta.columns[key].label.toLowerCase() === raw.toLowerCase()
    );
    if (!match) {
      throw new Error(`${context}: column "${column}" not found on table "${tableKey}".`);
    }
    return match;
  }

  private hopSourceStep(hop: EndpointConfig["hops"][number], hopIdx: number): number {
    return hop.fromStepIdx ?? hop.parentStepIdx ?? hopIdx;
  }

  /** Mirror useQueryTemplates.buildApiCondition for backend/API execution. */
  private normalizeTemplateCondition(tableKey: string, condition: any, idx: number): SearchCondition {
    const column = this.resolveColumnKey(
      tableKey,
      String(condition?.column || "").replace(/^S1_/i, ""),
      `Endpoint root condition ${idx + 1}`
    );
    const operator = String(condition?.operator || "like") as SearchCondition["operator"];
    if (!["like", "eq", "in", "between", "gte", "lte"].includes(operator)) {
      throw new Error(`Endpoint root condition ${idx + 1}: unsupported operator "${operator}".`);
    }

    const meta = getTableMeta(tableKey)!;
    const colMeta = meta.columns[column];
    const isDate = colMeta.label.toLowerCase().includes("date") || column.toLowerCase().includes("date");

    if (operator === "in") {
      const values = Array.isArray(condition.values) && condition.values.length
        ? condition.values.map((value: any) => String(value).trim()).filter(Boolean)
        : String(condition.multiValue || "").split(/[\n,]+/).map(value => value.trim()).filter(Boolean);
      // ponytail: allow empty IN [] at normalize-time — runChain will populate from query params
      return { column, operator, value: "", values };
    }

    if (operator === "between") {
      const dateRange = Array.isArray(condition.dateRange) ? condition.dateRange : [];
      const value = String(isDate && dateRange.length === 2 ? dateRange[0] : (condition.value || "")).trim();
      const value2 = String(isDate && dateRange.length === 2 ? dateRange[1] : (condition.value2 || "")).trim();
      if (!value || !value2) {
        throw new Error(`Endpoint root condition ${idx + 1} (${column}) BETWEEN requires both values.`);
      }
      return { column, operator, value, value2 };
    }

    const dateRange = Array.isArray(condition.dateRange) ? condition.dateRange : [];
    const value = String(condition.value || (!condition.value && isDate ? dateRange[0] || "" : "")).trim();
    if (!value) {
      throw new Error(`Endpoint root condition ${idx + 1} (${column}) requires a value.`);
    }
    return { column, operator, value };
  }

  /**
   * Convert template/legacy endpoint shapes into one validated canonical shape.
   * The canonical hop parent field is `fromStepIdx`, exactly as stored by templates.
   */
  normalizeConfig(input: EndpointConfig): EndpointConfig {
    if (!input || !input.rootTable) throw new Error("Endpoint config is missing rootTable.");
    if (!Array.isArray(input.hops)) throw new Error("Endpoint config is missing hops[].");
    if (!getTableMeta(input.rootTable)) {
      throw new Error(`Endpoint root table "${input.rootTable}" not found in registry.`);
    }

    const normalizedHops: EndpointConfig["hops"] = [];
    const stepTables: string[] = [input.rootTable];
    input.hops.forEach((hop, hopIdx) => {
      const childStepIdx = hopIdx + 1;
      const fromStepIdx = this.hopSourceStep(hop, hopIdx);
      if (!Number.isInteger(fromStepIdx) || fromStepIdx < 0 || fromStepIdx >= childStepIdx) {
        throw new Error(`Endpoint hop ${hopIdx + 1}: fromStepIdx ${fromStepIdx} must reference an earlier step.`);
      }

      const sourceTable = stepTables[fromStepIdx];
      if (!sourceTable) {
        throw new Error(`Endpoint hop ${hopIdx + 1}: source step ${fromStepIdx + 1} has no table.`);
      }
      if (!getTableMeta(hop.targetTable)) {
        throw new Error(`Endpoint hop ${hopIdx + 1}: target table "${hop.targetTable}" not found in registry.`);
      }

      normalizedHops.push({
        fromColumnKey: this.resolveColumnKey(sourceTable, hop.fromColumnKey, `Endpoint hop ${hopIdx + 1} source`),
        fromStepIdx,
        targetTable: hop.targetTable,
        targetColumn: this.resolveColumnKey(hop.targetTable, hop.targetColumn, `Endpoint hop ${hopIdx + 1} target`),
      });
      stepTables.push(hop.targetTable);
    });

    const rootConditions = (input.rootConditions || []).map((condition, idx) =>
      this.normalizeTemplateCondition(input.rootTable, condition, idx)
    );
    const rootColumnRaw = input.rootColumn || rootConditions[0]?.column;
    if (!rootColumnRaw) throw new Error("Endpoint config is missing rootColumn/rootConditions.");

    return {
      sourceTemplateId: input.sourceTemplateId,
      rootTable: input.rootTable,
      rootColumn: this.resolveColumnKey(input.rootTable, rootColumnRaw, "Endpoint root"),
      rootOperator: input.rootOperator || rootConditions[0]?.operator || "like",
      rootConditions,
      hops: normalizedHops,
      visibleCols: Array.isArray(input.visibleCols) ? [...input.visibleCols] : [],
      allowedParams: Array.isArray(input.allowedParams) ? [...input.allowedParams] : [],
    };
  }

  /** Clone the executable definition from a saved Template. API-only options stay separate. */
  buildConfigFromTemplate(
    template: any,
    options: { visibleCols?: string[]; allowedParams?: string[] } = {}
  ): EndpointConfig {
    if (!template?.id) throw new Error("A saved template is required before publishing an API endpoint.");
    return this.normalizeConfig({
      sourceTemplateId: template.id,
      rootTable: template.rootTable,
      rootColumn: template.rootColumn,
      rootOperator: template.rootOperator,
      rootConditions: Array.isArray(template.rootConditions)
        ? template.rootConditions.map((condition: SearchCondition) => ({ ...condition }))
        : [],
      hops: Array.isArray(template.hops)
        ? template.hops.map((hop: any) => ({
            fromColumnKey: hop.fromColumnKey,
            fromStepIdx: hop.fromStepIdx,
            targetTable: hop.targetTable,
            targetColumn: hop.targetColumn,
          }))
        : [],
      visibleCols: Array.isArray(options.visibleCols)
        ? options.visibleCols
        : (Array.isArray(template.favoriteColumns) ? template.favoriteColumns : []),
      allowedParams: Array.isArray(options.allowedParams) ? options.allowedParams : [],
    });
  }

  /** True when a URL parameter resolves to a concrete registry field on one chain step. */
  isDatabaseParameter(input: EndpointConfig, paramName: string): boolean {
    const config = this.normalizeConfig(input);
    const { cleanName } = this.parseParamOperator(paramName);
    const prefix = cleanName.match(/^S(\d+)_(.+)$/i);
    if (prefix) {
      const stepIdx = Number(prefix[1]) - 1;
      if (stepIdx < 0 || stepIdx > config.hops.length) return false;
      try {
        this.resolveColumnKey(this.stepTable(config, stepIdx), prefix[2], "API parameter");
        return true;
      } catch {
        return false;
      }
    }

    for (let stepIdx = 0; stepIdx <= config.hops.length; stepIdx++) {
      try {
        this.resolveColumnKey(this.stepTable(config, stepIdx), paramName, "API parameter");
        return true;
      } catch {
        // Continue: an unprefixed parameter binds to the first matching step.
      }
    }
    return false;
  }

  /** URL param operator suffixes — `col__gte=...`. Bare key keeps legacy auto behavior. */
  private static readonly PARAM_OPS = ["eq", "like", "in", "between", "gte", "lte"];

  /** Parse `name__op` → { cleanName, op }. Unknown/absent suffix → op null (whole name is the column). */
  parseParamOperator(paramName: string): { cleanName: string; op: string | null } {
    const idx = paramName.lastIndexOf("__");
    if (idx <= 0) return { cleanName: paramName, op: null };
    const tail = paramName.slice(idx + 2).toLowerCase();
    if (!EndpointService.PARAM_OPS.includes(tail)) return { cleanName: paramName, op: null };
    return { cleanName: paramName.slice(0, idx), op: tail };
  }

  /** gte/lte/between compare: numeric when both sides are numbers, else plain string
   *  compare (correct for "YYYY-MM-DD HH:mm:ss" — dateStrings keeps lexicographic = chronological). */
  private compareCells(a: string, b: string): number {
    const na = Number(a), nb = Number(b);
    if (a.trim() !== "" && b.trim() !== "" && !Number.isNaN(na) && !Number.isNaN(nb)) {
      return na < nb ? -1 : na > nb ? 1 : 0;
    }
    return a < b ? -1 : a > b ? 1 : 0;
  }

  /**
   * In-memory filter of the combined grid by API params that were NOT applied at
   * SQL level. Bare param = legacy bidirectional substring; `__op` suffix applies
   * eq/like/in/between/gte/lte to the matched row column.
   */
  filterCombinedRows(config: EndpointConfig, rows: Record<string, any>[], queryParams: Record<string, string>): Record<string, any>[] {
    let filtered = rows;
    for (const [paramName, paramValue] of Object.entries(queryParams)) {
      if (this.isDatabaseParameter(config, paramName)) continue;
      const { cleanName, op } = this.parseParamOperator(paramName);
      const rawString = String(paramValue ?? "").trim();
      if (!rawString) continue;
      const valList = rawString.split(/[\n,]+/).map(v => v.trim().toLowerCase()).filter(Boolean);
      if (valList.length === 0) continue;
      if (op === "between" && valList.length < 2) continue; // malformed between — ignore rather than zero out results

      filtered = filtered.filter((row) => {
        const cleanParamName = cleanName.replace(/^S\d+_/i, "");
        let cellVal = row[cleanParamName];
        if (cellVal === undefined) {
          // Case/underscore-insensitive key matching
          const normParam = cleanParamName.toLowerCase().replace(/[^a-z0-9]/g, "");
          const foundKey = Object.keys(row).find(
            (k) => k.toLowerCase().replace(/[^a-z0-9]/g, "") === normParam
          );
          if (foundKey) {
            cellVal = row[foundKey];
          }
        }

        if (cellVal == null) return false;
        const cellStr = String(cellVal).trim();
        const cellLower = cellStr.toLowerCase();

        if (!op) return valList.some(v => cellLower.includes(v) || v.includes(cellLower)); // legacy substring
        switch (op) {
          case "like": return valList.some(v => cellLower.includes(v));
          case "eq":
          case "in": return valList.includes(cellLower);
          case "gte": return this.compareCells(cellStr, valList[0]) >= 0;
          case "lte": return this.compareCells(cellStr, valList[0]) <= 0;
          case "between": return this.compareCells(cellStr, valList[0]) >= 0 && this.compareCells(cellStr, valList[1]) <= 0;
          default: return valList.some(v => cellLower.includes(v) || v.includes(cellLower));
        }
      });
    }
    return filtered;
  }

  async ensureTableExists(): Promise<void> {
    try {
      await dbSeagateDev.execute(sql`
        CREATE TABLE IF NOT EXISTS saved_endpoints (
          id VARCHAR(100) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          config TEXT NOT NULL,
          created_at VARCHAR(50) NOT NULL,
          updated_at VARCHAR(50) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8
      `);
      console.log("✅ MySQL database (SeagateDev): checked/created 'saved_endpoints' table.");

      // Auto-migrate: add RBAC columns if missing (MySQL 5.0 has no IF NOT EXISTS on ADD COLUMN, so swallow duplicate errors)
      const addCol = async (col: string, ddl: string) => {
        try {
          await dbSeagateDev.execute(sql.raw(`ALTER TABLE saved_endpoints ADD COLUMN ${col} ${ddl}`));
          console.log(`🛠️  saved_endpoints: added column '${col}'.`);
        } catch (e: any) {
          if (!/duplicate column|Duplicate column/i.test(e?.message || "")) {
            console.warn(`⚠️ ALTER saved_endpoints ADD ${col} failed:`, e?.message || e);
          }
        }
      };
      await addCol("created_by", "VARCHAR(50) DEFAULT ''");
      await addCol("visibility", "VARCHAR(50) DEFAULT 'public'");
      await addCol("api_group", "VARCHAR(100) DEFAULT 'General'");

      await dbSeagateDev.execute(sql`
        CREATE TABLE IF NOT EXISTS endpoint_permissions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          endpoint_id VARCHAR(100) NOT NULL,
          user_en VARCHAR(50) NOT NULL,
          assigned_at VARCHAR(50) NOT NULL,
          INDEX idx_endpoint_id (endpoint_id),
          INDEX idx_user_en (user_en)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8
      `);
      console.log("✅ MySQL database (SeagateDev): checked/created 'endpoint_permissions' table.");
    } catch (err) {
      console.error("❌ Failed to verify/create 'saved_endpoints' table:", err);
    }
  }

  private async fetchAllowedUsers(endpointId: string): Promise<string[]> {
    const pool = getRawPool("SeagateDev");
    const [rows] = await pool.execute(
      "SELECT user_en FROM endpoint_permissions WHERE endpoint_id = ?",
      [endpointId]
    ) as [Array<{ user_en: string }>, any];
    return rows.map(r => r.user_en);
  }

  private async syncAllowedUsers(endpointId: string, allowedUsers: string[]): Promise<void> {
    const pool = getRawPool("SeagateDev");
    await pool.execute("DELETE FROM endpoint_permissions WHERE endpoint_id = ?", [endpointId]);
    const now = new Date().toISOString();
    const unique = [...new Set((allowedUsers || []).map(e => String(e).trim()).filter(Boolean))];
    for (const en of unique) {
      await pool.execute(
        "INSERT INTO endpoint_permissions (endpoint_id, user_en, assigned_at) VALUES (?, ?, ?)",
        [endpointId, en, now]
      );
    }
  }

  private async fetchEndpointsRaw(): Promise<any[]> {
    const pool = getRawPool("SeagateDev");
    const [rows] = await pool.execute(
      "SELECT id, name, description, config, created_at, updated_at, created_by, visibility, api_group FROM saved_endpoints"
    ) as [any[], any];
    return rows;
  }

  private mapRowToEndpoint(r: any, allowedUsers: string[] = []): SavedEndpoint {
    return {
      id: r.id,
      name: r.name,
      description: r.description || "",
      config: JSON.parse(r.config),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      createdBy: r.created_by || "",
      visibility: (r.visibility === "restricted" ? "restricted" : "public"),
      apiGroup: r.api_group || "General",
      allowedUsers,
    };
  }

  /**
   * Return all endpoints. Optional viewer scopes the list:
   *   - admin (or undefined viewer): all endpoints
   *   - user: public OR created by viewer OR explicitly granted via endpoint_permissions
   */
  async getAll(viewer?: { en: string; permission: string } | null): Promise<SavedEndpoint[]> {
    const rawRows = await this.fetchEndpointsRaw();

    // Bulk-load permissions to avoid N+1
    const pool = getRawPool("SeagateDev");
    const [permRows] = await pool.execute(
      "SELECT endpoint_id, user_en FROM endpoint_permissions"
    ) as [Array<{ endpoint_id: string; user_en: string }>, any];
    const permMap = new Map<string, string[]>();
    permRows.forEach(p => {
      if (!permMap.has(p.endpoint_id)) permMap.set(p.endpoint_id, []);
      permMap.get(p.endpoint_id)!.push(p.user_en);
    });

    const all = rawRows.map(r => this.mapRowToEndpoint(r, permMap.get(r.id) || []));

    if (viewer && viewer.permission === "admin") return all;

    if (!viewer) {
      // Guest: see ONLY public endpoints
      return all.filter(ep => ep.visibility === "public");
    }

    const en = String(viewer.en || "").trim();
    return all.filter(ep =>
      ep.visibility === "public" ||
      ep.createdBy === en ||
      (ep.allowedUsers || []).includes(en)
    );
  }

  async getById(id: string): Promise<SavedEndpoint | null> {
    const pool = getRawPool("SeagateDev");
    const [rows] = await pool.execute(
      "SELECT id, name, description, config, created_at, updated_at, created_by, visibility, api_group FROM saved_endpoints WHERE id = ? LIMIT 1",
      [id]
    ) as [any[], any];
    if (rows.length === 0) return null;
    const allowedUsers = await this.fetchAllowedUsers(id);
    return this.mapRowToEndpoint(rows[0], allowedUsers);
  }

  async create(ep: SavedEndpoint): Promise<SavedEndpoint> {
    if (!ep.config?.sourceTemplateId) {
      throw new Error("A saved Template is required before creating an API endpoint.");
    }
    const now = new Date().toISOString();
    const pool = getRawPool("SeagateDev");
    const visibility = ep.visibility === "restricted" ? "restricted" : "public";
    const apiGroup = (ep.apiGroup || "General").trim() || "General";
    const createdBy = (ep.createdBy || "").trim();

    const normalizedConfig = this.normalizeConfig(ep.config);

    await pool.execute(
      `INSERT INTO saved_endpoints
        (id, name, description, config, created_at, updated_at, created_by, visibility, api_group)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ep.id,
        ep.name,
        ep.description || "",
        JSON.stringify(normalizedConfig),
        now,
        now,
        createdBy,
        visibility,
        apiGroup,
      ]
    );

    if (visibility === "restricted") {
      await this.syncAllowedUsers(ep.id, ep.allowedUsers || []);
    } else {
      await this.syncAllowedUsers(ep.id, []);
    }

    return {
      ...ep,
      config: normalizedConfig,
      createdAt: now,
      updatedAt: now,
      createdBy,
      visibility,
      apiGroup,
      allowedUsers: visibility === "restricted" ? (ep.allowedUsers || []) : [],
    };
  }

  async update(id: string, patch: Partial<Omit<SavedEndpoint, "id" | "createdAt">>): Promise<SavedEndpoint> {
    const existing = await this.getById(id);
    if (!existing) throw new Error(`Endpoint not found: ${id}`);
    const now = new Date().toISOString();
    const pool = getRawPool("SeagateDev");

    const next: SavedEndpoint = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: now,
    };
    next.config = this.normalizeConfig(next.config);
    const visibility = next.visibility === "restricted" ? "restricted" : "public";
    const apiGroup = (next.apiGroup || "General").trim() || "General";

    await pool.execute(
      `UPDATE saved_endpoints SET
         name = ?, description = ?, config = ?, updated_at = ?,
         visibility = ?, api_group = ?
       WHERE id = ?`,
      [
        next.name,
        next.description || "",
        JSON.stringify(next.config),
        now,
        visibility,
        apiGroup,
        id,
      ]
    );

    if (patch.allowedUsers !== undefined || patch.visibility !== undefined) {
      await this.syncAllowedUsers(id, visibility === "restricted" ? (next.allowedUsers || []) : []);
    }

    return { ...next, visibility, apiGroup };
  }

  async delete(id: string): Promise<void> {
    const pool = getRawPool("SeagateDev");
    await pool.execute("DELETE FROM endpoint_permissions WHERE endpoint_id = ?", [id]);
    await pool.execute("DELETE FROM saved_endpoints WHERE id = ?", [id]);
  }

  /**
   * Check whether the given viewer is allowed to invoke this endpoint (used by /v1/trace/:id).
   */
  canViewerAccess(ep: SavedEndpoint, viewer: { en: string; permission: string } | null): boolean {
    if (!viewer) return ep.visibility !== "restricted";
    if (viewer.permission === "admin") return true;
    const en = String(viewer.en || "").trim();
    
    // Dynamic Autocomplete Bypass: allow any authenticated registered developer/creator (viewer is not null)
    // to query the designated employee autocomplete endpoint for access control lookups.
    if (ep.id === "api-hr-autocompleted" && viewer) return true;
    
    if (ep.visibility !== "restricted") return true;
    return ep.createdBy === en || (ep.allowedUsers || []).includes(en);
  }

  /**
   * Execute the pivot chain as a BFS graph (template-style): each hop is an edge,
   * and any edge whose parent OR child is resolved can fire — forward OR backward.
   * Runtime params seed one or more steps; a `S<n>_col` param pins step n-1.
   * Returns { steps: [{ table, label, rows, availablePivots? }] } (dense, index-ordered
   * so combineSteps can look up hops positionally).
   */
  async runChain(
    config: EndpointConfig,
    queryParams: Record<string, string>
  ): Promise<{ steps: { table: string; label: string; rows: Record<string, any>[]; availablePivots?: any[] }[] }> {
    // Every invocation, including legacy saved endpoints, enters the exact same
    // canonical template shape before any table/field resolution occurs.
    config = this.normalizeConfig(config);
    const totalSteps = config.hops.length + 1;

    // ── 1. Parse params into per-step seeds (honor S<n>_ prefix) ───────────────
    const seedsByStep: Record<number, SearchCondition[]> = {};
    const addSeed = (stepIdx: number, cond: SearchCondition) => {
      if (!seedsByStep[stepIdx]) seedsByStep[stepIdx] = [];
      seedsByStep[stepIdx].push(cond);
    };

    // Start with the Template's complete condition snapshot. API params will
    // override matching column values before seeding.
    const rootConditions: SearchCondition[] = (config.rootConditions || [])
      .map(c => ({ ...c, values: c.values ? [...c.values] : undefined }));

    // ponytail: Detect if caller provided ANY non-empty query param
    const hasNonEmptyQueryParams = Object.entries(queryParams).some(([k, v]) => v && v.trim() !== "");

    // ponytail: Override rootConditions values from query params BEFORE seeding
    // so API callers can override template defaults without creating duplicate AND clauses
    const rootMeta = getTableMeta(config.rootTable);
    const overriddenColumns = new Set<string>();
    // Columns that already received an explicit `__op` param — a second one on the
    // same column (e.g. `?d__gte=..&d__lte=..`) must AND, not overwrite.
    const explicitOpColumns = new Set<string>();

    if (hasNonEmptyQueryParams) {
      for (const [paramName, paramValue] of Object.entries(queryParams)) {
        if (!paramValue || paramValue.trim() === "") continue;

        // `__op` suffix (e.g. create_dt__gte) sets the operator explicitly;
        // bare key keeps the Template operator (legacy behavior)
        const { cleanName: cleanBase, op } = this.parseParamOperator(paramName);

        // Strip S1_ prefix if present (root step is always 0)
        const cleanParam = cleanBase.replace(/^S1_/i, "");

        // Find matching root condition by column (case-insensitive, supports camelCase/dbColumn/label)
        let matchedCond = rootConditions.find(c => {
          if (!rootMeta) return c.column.toLowerCase() === cleanParam.toLowerCase();
          const colMeta = rootMeta.columns[c.column];
          if (!colMeta) return c.column.toLowerCase() === cleanParam.toLowerCase();
          return c.column.toLowerCase() === cleanParam.toLowerCase() ||
                 colMeta.dbColumn.toLowerCase() === cleanParam.toLowerCase() ||
                 colMeta.label.toLowerCase() === cleanParam.toLowerCase();
        });

        if (matchedCond) {
          // Override value/values based on param format (multi-line/comma = IN, single = eq/like)
          const hasMultiple = paramValue.includes("\n") || paramValue.includes(",");
          const colLower = matchedCond.column.toLowerCase();

          // 2nd explicit `__op` on the same column → append an AND condition
          // instead of overwriting the 1st (makes `?d__gte=..&d__lte=..` a range)
          if (op && explicitOpColumns.has(colLower)) {
            const extra: SearchCondition = { column: matchedCond.column, operator: "eq", value: "" };
            rootConditions.push(extra);
            matchedCond = extra;
          }
          if (op) explicitOpColumns.add(colLower);

          if (op === "between") {
            const parts = paramValue.split(/[\n,]+/).map(v => v.trim()).filter(Boolean);
            if (parts.length !== 2) {
              throw new Error(`Parameter "${paramName}": __between requires exactly 2 comma-separated values (from,to).`);
            }
            matchedCond.operator = "between";
            matchedCond.value = parts[0];
            matchedCond.value2 = parts[1];
            matchedCond.values = undefined;
          } else if (op === "in") {
            matchedCond.operator = "in";
            matchedCond.values = paramValue.split(/[\n,]+/).map(v => v.trim()).filter(Boolean);
            matchedCond.value = "";
          } else if (op) {
            matchedCond.operator = op as SearchCondition["operator"];
            matchedCond.value = paramValue.trim();
            matchedCond.values = undefined;
          } else if (hasMultiple) {
            matchedCond.operator = "in";
            matchedCond.values = paramValue.split(/[\n,]+/).map(v => v.trim()).filter(Boolean);
            matchedCond.value = "";
          } else {
            // Keep original operator (like/eq/between) but override value
            if (matchedCond.operator !== "between") {
              matchedCond.value = paramValue.trim();
            }
          }
          overriddenColumns.add(matchedCond.column.toLowerCase());
        }
      }
    }

    // ponytail: only seed root if conditions have values — else skip and let BFS pivot backward
    rootConditions.forEach(c => {
      // Skip conditions that were overridden with empty/different column query params
      if (hasNonEmptyQueryParams && !overriddenColumns.has(c.column.toLowerCase())) {
        // User provided query params but this rootCondition column wasn't touched
        // → skip it to avoid AND-ing with unrelated query param
        return;
      }

      if (c.operator === "in" && (!c.values || c.values.length === 0)) return; // skip empty IN
      if (c.operator === "between" && (!c.value || !c.value2)) return; // skip empty BETWEEN
      if (!c.operator || c.operator === "like" || c.operator === "eq") {
        if (!c.value || c.value.trim() === "" || c.value === "%") return; // skip wildcard/empty
      }
      addSeed(0, c);
    });

    // Step columns that already received an explicit `__op` (see explicitOpColumns)
    const explicitOpStepCols = new Set<string>();

    // No-prefix param → detect step by scanning columns (root first). -1 if unknown.
    const findStepWithColumn = (cleanCol: string): number => {
      const rootMeta = getTableMeta(config.rootTable);
      if (rootMeta && Object.keys(rootMeta.columns).some(k => k.toLowerCase() === cleanCol.toLowerCase() || rootMeta.columns[k].dbColumn.toLowerCase() === cleanCol.toLowerCase())) {
        return 0;
      }
      for (let j = 0; j < config.hops.length; j++) {
        const hopMeta = getTableMeta(config.hops[j].targetTable);
        if (hopMeta && Object.keys(hopMeta.columns).some(k => k.toLowerCase() === cleanCol.toLowerCase() || hopMeta.columns[k].dbColumn.toLowerCase() === cleanCol.toLowerCase())) {
          return j + 1;
        }
      }
      return -1;
    };

    const buildSeedCond = (stepIdx: number, colKey: string, paramValue: string, explicitOp: string | null = null): SearchCondition => {
      const meta = getTableMeta(this.stepTable(config, stepIdx));
      const matched = meta
        ? Object.keys(meta.columns).find(k => k.toLowerCase() === colKey.toLowerCase() || meta.columns[k].dbColumn.toLowerCase() === colKey.toLowerCase())
        : undefined;
      const exactKey = matched || colKey;

      // `__op` suffix → operator fixed by the caller (URL-driven, not guessed)
      if (explicitOp === "between") {
        const parts = paramValue.split(/[\n,]+/).map(v => v.trim()).filter(Boolean);
        if (parts.length !== 2) {
          throw new Error(`Parameter "${colKey}__between" requires exactly 2 comma-separated values (from,to).`);
        }
        return { column: exactKey, operator: "between", value: parts[0], value2: parts[1] };
      }
      if (explicitOp === "in") {
        return { column: exactKey, operator: "in", value: "", values: paramValue.split(/[\n,]+/).map(v => v.trim()).filter(Boolean) };
      }
      if (explicitOp) {
        return { column: exactKey, operator: explicitOp as SearchCondition["operator"], value: paramValue };
      }

      const hasMultiple = paramValue.includes("\n") || paramValue.includes(",");

      // ponytail: exact-match patterns (SN, codes, IDs) default to "eq", not "like"
      const needsExactMatch = /_(no|sn|id|code|dcm|lot|en)$|^(pt|job|part|mc|hookup|aca|bracket|coil|box|store|pallet|magnet)/i.test(colKey);
      const operator = hasMultiple ? "in" : (needsExactMatch ? "eq" : "like");

      return {
        column: exactKey,
        operator,
        value: paramValue,
        values: hasMultiple ? paramValue.split(/[\n,]+/).map(v => v.trim()).filter(Boolean) : undefined,
      };
    };

    for (const [paramName, paramValue] of Object.entries(queryParams)) {
      if (paramValue === undefined || paramValue === "") continue;

      const { cleanName: cleanParamKey, op: paramOp } = this.parseParamOperator(paramName);
      const prefixMatch = cleanParamKey.match(/^S(\d+)_(.+)$/i);
      let stepIdx: number;
      let colKey: string;

      if (prefixMatch) {
        stepIdx = Number(prefixMatch[1]) - 1;
        colKey = prefixMatch[2];
        if (stepIdx < 0 || stepIdx >= totalSteps) {
          throw new Error(`Parameter "${paramName}" targets nonexistent step ${stepIdx + 1} (chain has ${totalSteps} step(s)).`);
        }
        const meta = getTableMeta(this.stepTable(config, stepIdx));
        if (!meta || !Object.keys(meta.columns).some(k => k.toLowerCase() === colKey.toLowerCase() || meta.columns[k].dbColumn.toLowerCase() === colKey.toLowerCase() || meta.columns[k].label.toLowerCase() === colKey.toLowerCase())) {
          throw new Error(`Parameter "${paramName}": column "${colKey}" not found on step ${stepIdx + 1} table.`);
        }
      } else {
        colKey = cleanParamKey.replace(/^s\d+_/i, "");
        stepIdx = findStepWithColumn(colKey);
        if (stepIdx === -1) continue; // unknown column — skip (allowlist should have filtered)
      }

      // ponytail: skip if this param already overrode a rootCondition above (step 0 only)
      if (stepIdx === 0) {
        const alreadyOverridden = rootConditions.some(c => {
          if (!rootMeta) return c.column.toLowerCase() === colKey.toLowerCase();
          const colMeta = rootMeta.columns[c.column];
          if (!colMeta) return c.column.toLowerCase() === colKey.toLowerCase();
          return c.column.toLowerCase() === colKey.toLowerCase() ||
                 colMeta.dbColumn.toLowerCase() === colKey.toLowerCase() ||
                 colMeta.label.toLowerCase() === colKey.toLowerCase();
        });
        if (alreadyOverridden) continue; // already seeded via override loop above
      }

      const cond = buildSeedCond(stepIdx, colKey, paramValue, paramOp);
      const stepColKey = `${stepIdx}|${cond.column.toLowerCase()}`;
      const existing = (seedsByStep[stepIdx] || []).find(c => c.column.toLowerCase() === cond.column.toLowerCase());
      if (existing) {
        if (paramOp && explicitOpStepCols.has(stepColKey)) {
          // 2nd explicit `__op` on the same step column → AND (range), don't overwrite
          addSeed(stepIdx, cond);
        } else if (paramOp) {
          // Explicit `__op` replaces the seed wholesale (operator + value shape)
          Object.assign(existing, cond);
        } else {
          existing.value = cond.value;
          existing.value2 = cond.value2;
          if (cond.values) {
            existing.operator = "in";
            existing.values = cond.values;
          } else if (existing.operator === "in") {
            existing.values = [cond.value];
          } else {
            // Preserve the Template operator (eq/like/gte/lte/between) when a
            // caller replaces only its value.
            existing.values = undefined;
          }
        }
      } else {
        addSeed(stepIdx, cond);
      }
      if (paramOp) explicitOpStepCols.add(stepColKey);
    }

    if (Object.keys(seedsByStep).length === 0) {
      throw new Error("Template has no search conditions. Add a condition to the Template before publishing/running its API.");
    }

    // ponytail: no longer require root params — user can seed at any step (S2, S3, etc.)
    // BFS will pivot backward + forward to complete the chain

    // ── 2. Seed each step that has params ──────────────────────────────────────
    const stepRows: Record<number, Record<string, any>[]> = {};
    const stepInfo: Record<number, { table: string; label: string; availablePivots?: any[] }> = {};
    const resolved = new Set<number>();

    for (const stepIdx of Object.keys(seedsByStep).map(Number)) {
      const table = this.stepTable(config, stepIdx);
      const result = await searchService.search({ table, conditions: seedsByStep[stepIdx], limit: 1000000 });
      stepRows[stepIdx] = result.rows;
      stepInfo[stepIdx] = { table, label: result.tableLabel, availablePivots: result.availablePivots };
      resolved.add(stepIdx);
    }

    // ── 3. BFS over hop edges (forward + backward) ─────────────────────────────
    const edges = config.hops.map((hop, i) => ({
      parentIdx: this.hopSourceStep(hop, i),
      childIdx: i + 1,
      hop,
    }));

    const resolveStep = async (fromIdx: number, fromColKey: string, toTable: string, toColKey: string, intoIdx: number) => {
      const fromLabel = this.resolveColumnLabel(this.stepTable(config, fromIdx), fromColKey);
      const sourceValues = pivotService.extractValues(stepRows[fromIdx] || [], fromLabel);
      console.error(`[BFS] resolveStep: from step ${fromIdx} (${this.stepTable(config, fromIdx)}) col "${fromColKey}" → "${fromLabel}" → step ${intoIdx} (${toTable}), found ${sourceValues.length} values`);
      if (sourceValues.length === 0) {
        stepRows[intoIdx] = [];
        stepInfo[intoIdx] = { table: toTable, label: toTable, availablePivots: [] };
        resolved.add(intoIdx);
        return;
      }
      const pr = await pivotService.pivot({ sourceValues, targetTable: toTable, targetColumn: toColKey, limit: 1000000 });
      console.error(`[BFS] pivot result: ${pr.rows.length} rows`);
      stepRows[intoIdx] = pr.rows;
      stepInfo[intoIdx] = { table: toTable, label: pr.targetTableLabel, availablePivots: pr.availablePivots };
      resolved.add(intoIdx);
    };

    let progress = true;
    let guard = 0;
    while (progress && guard++ <= config.hops.length + 1) {
      progress = false;
      console.error(`[BFS] iteration ${guard}, resolved: [${Array.from(resolved).join(",")}]`);
      for (const edge of edges) {
        const { parentIdx, childIdx, hop } = edge;
        const pRes = resolved.has(parentIdx);
        const cRes = resolved.has(childIdx);
        if (pRes === cRes) continue; // both done or neither ready

        if (pRes) {
          // Forward: parent → child
          await resolveStep(parentIdx, hop.fromColumnKey, hop.targetTable, hop.targetColumn, childIdx);
        } else {
          // Backward: child → parent
          await resolveStep(childIdx, hop.targetColumn, this.stepTable(config, parentIdx), hop.fromColumnKey, parentIdx);
        }
        progress = true;
        break; // restart outer loop so edges fire as soon as endpoints resolve
      }
    }

    // ── 3.5 Close seeded-but-unconnected steps ─────────────────────────────────
    // A step seeded directly by its own param (e.g. ?S4_AREA_CODE=FFHC) resolves
    // from its bare WHERE — BFS skips edges whose both endpoints are already
    // resolved, so the hop (FORM_ID IN parent's values) never constrains it and
    // it returns every row matching the param across all history. Re-filter each
    // fully-resolved edge so every step stays connected to the chain. (Rows that
    // arrived via pivot on this same edge already satisfy it — filter is a no-op.)
    for (const { parentIdx, childIdx, hop } of edges) {
      if (!resolved.has(parentIdx) || !resolved.has(childIdx)) continue;
      const parentValues = new Set(
        pivotService.extractValues(
          stepRows[parentIdx] || [],
          this.resolveColumnLabel(this.stepTable(config, parentIdx), hop.fromColumnKey)
        )
      );
      const childLabel = this.resolveColumnLabel(this.stepTable(config, childIdx), hop.targetColumn);
      stepRows[childIdx] = (stepRows[childIdx] || []).filter((r) => {
        const v = r[childLabel];
        if (v === undefined || v === null || String(v).trim() === "") return false;
        return parentValues.has(String(v).trim());
      });
    }

    // ── 4. Assemble dense steps[] by index ─────────────────────────────────────
    const steps: { table: string; label: string; rows: Record<string, any>[]; availablePivots?: any[] }[] = [];
    for (let i = 0; i < totalSteps; i++) {
      if (resolved.has(i) && stepInfo[i]) {
        steps.push({ table: stepInfo[i].table, label: stepInfo[i].label, rows: stepRows[i] || [], availablePivots: stepInfo[i].availablePivots });
      } else {
        const table = this.stepTable(config, i);
        steps.push({ table, label: table, rows: [], availablePivots: [] });
      }
    }

    const logSeeds = Object.entries(seedsByStep).map(([idx, conds]) => ({
      step: Number(idx),
      conditions: conds.map(c => (c.values && c.values.length > 20 ? { ...c, values: `[${c.values.length} items: ${JSON.stringify(c.values.slice(0, 5))}...]` } : c)),
    }));
    console.log("🔍 [runChain BFS] Seeds:", JSON.stringify(logSeeds, null, 2));

    return { steps };
  }

  /** Table key for a step index: 0 = rootTable, n>0 = hops[n-1].targetTable */
  private stepTable(config: EndpointConfig, idx: number): string {
    if (idx <= 0) return config.rootTable;
    return config.hops[idx - 1]?.targetTable ?? config.rootTable;
  }

  /** Resolve a column key/dbColumn/label (case-insensitive) to the row-key display label. */
  private resolveColumnLabel(tableKey: string, colKey: string): string {
    const meta = getTableMeta(tableKey);
    if (!meta) return colKey;
    const exactKey = Object.keys(meta.columns).find(
      (k) => k.toLowerCase() === colKey.toLowerCase() ||
             meta.columns[k].dbColumn.toLowerCase() === colKey.toLowerCase() ||
             meta.columns[k].label.toLowerCase() === colKey.toLowerCase()
    );
    return exactKey ? meta.columns[exactKey].label : colKey;
  }

  // Perform left-join of all steps programmatically on the server, exactly matching useCombinedRows.js
  combineSteps(
    steps: { table: string; label: string; rows: Record<string, any>[] }[],
    config: EndpointConfig
  ): Record<string, any>[] {
    config = this.normalizeConfig(config);
    console.log(`[combineSteps] Starting with ${steps.length} steps:`, steps.map((s,i) => `${i}:${s.table}(${s.rows.length})`).join(' '));
    if (steps.length === 0) return [];

    // ponytail: choose master that maximizes output rows (fan-out semantics)
    // Root columns will be LEFT JOINed back via backward pivot if needed
    const MAX_SEED_THRESHOLD = 100_000;
    let master = steps[0];
    let maxRows = master.rows.length;

    steps.forEach((s) => {
      if (s.rows.length > maxRows && s.rows.length <= MAX_SEED_THRESHOLD) {
        maxRows = s.rows.length;
        master = s;
      }
    });

    if (maxRows === 0 || maxRows > MAX_SEED_THRESHOLD) {
      master = steps.reduce((min, s) => s.rows.length < min.rows.length ? s : min, steps[0]);
      maxRows = master.rows.length;
    }

    const baseIdx = steps.indexOf(master);
    const baseRows = master.rows;
    console.log(`[combineSteps] Chosen master: step ${baseIdx} (${master.table}) with ${baseRows.length} rows`);
    if (baseRows.length === 0) return [];

    const outputRows = baseRows.map((row) => ({ ...row }));
    const usedColumns = new Set(Object.keys(baseRows[0]));
    const usedColumnsLower = new Set(Object.keys(baseRows[0]).map(c => c.toLowerCase()));
    const columnAliases: Record<number, Record<string, string>> = { [baseIdx]: {} };

    // ponytail: alias master step columns with S{N}_ prefix so visibleCols filter can match them
    const masterAliases: Record<string, string> = {};
    Object.keys(baseRows[0]).forEach((col) => {
      const alias = `S${baseIdx + 1}_${col}`;
      masterAliases[col] = alias;
      columnAliases[baseIdx][col] = alias;
      usedColumns.add(alias);
      usedColumnsLower.add(alias.toLowerCase());
    });

    // Rename master row keys to use aliases
    outputRows.forEach((row) => {
      Object.keys(row).forEach((col) => {
        if (masterAliases[col]) {
          row[masterAliases[col]] = row[col];
          delete row[col];
        }
      });
    });

    const joined = new Set([baseIdx]);
    const pending = steps.map((s, idx) => ({ s, idx })).filter((item) => item.idx !== baseIdx);

    while (pending.length > 0) {
      let connectedHop: any = null;
      let isParentJoined = true;
      let connectStepIdx = -1;

      const pendingIdx = pending.findIndex((item) => {
        return Array.from(joined).some((jIdx) => {
          // Case A: item.idx is child, jIdx is parent
          if (item.idx > 0) {
            const hop = config.hops[item.idx - 1];
            const pIdx = hop ? this.hopSourceStep(hop, item.idx - 1) : (item.idx - 1);
            if (pIdx === jIdx) {
              connectedHop = hop;
              isParentJoined = true;
              connectStepIdx = jIdx;
              return true;
            }
          }
          // Case B: jIdx is child, item.idx is parent
          if (jIdx > 0) {
            const hop = config.hops[jIdx - 1];
            const pIdx = hop ? this.hopSourceStep(hop, jIdx - 1) : (jIdx - 1);
            if (pIdx === item.idx) {
              connectedHop = hop;
              isParentJoined = false;
              connectStepIdx = jIdx;
              return true;
            }
          }
          return false;
        });
      });

      if (pendingIdx === -1) break;

      const { s: step, idx } = pending.splice(pendingIdx, 1)[0];
      joined.add(idx);
      console.log(`[combineSteps] === Processing step ${idx} (${step.targetTable || step.rootTable}), ${step.rows.length} rows, outputRows currently has ${outputRows.length} rows ===`);

      let parentStepIdx = -1;
      let childStepIdx = -1;
      if (isParentJoined) {
        parentStepIdx = connectStepIdx;
        childStepIdx = idx;
      } else {
        parentStepIdx = idx;
        childStepIdx = connectStepIdx;
      }

      let leftCol = connectedHop.fromColumnKey; // parent side
      let rightCol = connectedHop.targetColumn; // child side

      // Resolve Display Labels for parent and child side join columns
      const parentTable = steps[parentStepIdx]?.table;
      const parentMeta = parentTable ? getTableMeta(parentTable) : null;
      if (parentMeta) {
        const exactKey = Object.keys(parentMeta.columns).find(
          (k) => k.toLowerCase() === leftCol.toLowerCase() ||
                 parentMeta.columns[k].dbColumn.toLowerCase() === leftCol.toLowerCase() ||
                 parentMeta.columns[k].label.toLowerCase() === leftCol.toLowerCase()
        );
        if (exactKey) {
          leftCol = parentMeta.columns[exactKey].label;
        }
      }

      const childTable = steps[childStepIdx]?.table;
      const childMeta = childTable ? getTableMeta(childTable) : null;
      if (childMeta) {
        const exactKey = Object.keys(childMeta.columns).find(
          (k) => k.toLowerCase() === rightCol.toLowerCase() ||
                 childMeta.columns[k].dbColumn.toLowerCase() === rightCol.toLowerCase() ||
                 childMeta.columns[k].label.toLowerCase() === rightCol.toLowerCase()
        );
        if (exactKey) {
          rightCol = childMeta.columns[exactKey].label;
        }
      }

      let outputJoinCol: string;
      let incomingJoinCol: string;

      if (isParentJoined) {
        // Parent is joined (connectStepIdx), child is incoming (idx)
        outputJoinCol = columnAliases[connectStepIdx]?.[leftCol] || leftCol;
        incomingJoinCol = rightCol;
        console.log(`[combineSteps] Forward join: S${connectStepIdx + 1}[${outputJoinCol}] ← S${idx + 1}[${incomingJoinCol}]`);
      } else {
        // Child is joined (connectStepIdx), parent is incoming (idx)
        outputJoinCol = columnAliases[connectStepIdx]?.[rightCol] || rightCol;
        incomingJoinCol = leftCol;
        console.log(`[combineSteps] Backward join: S${connectStepIdx + 1}[${outputJoinCol}] → S${idx + 1}[${incomingJoinCol}]`);
      }

      const statusCol = `S${idx + 1}_Status`;
      usedColumns.add(statusCol);

      const aliases: Record<string, string> = {};
      columnAliases[idx] = aliases;

      const rowColumns = step.rows.length ? Object.keys(step.rows[0]) : [];
      rowColumns.forEach((col) => {
        // ponytail: always prefix non-master steps (S2_, S3_) to show origin, not just duplicates
        const alias = idx === baseIdx ? col : `S${idx + 1}_${col}`;
        aliases[col] = alias;
        usedColumns.add(alias);
        usedColumnsLower.add(alias.toLowerCase());
      });

      const lookup = new Map<string, any[]>(); // ponytail: one-to-many — each key maps to ARRAY of rows
      step.rows.forEach((row) => {
        // ponytail: incomingJoinCol is a label — find the actual physical column in row keys (exact match first, then case-insensitive)
        const physicalCol = rowColumns.find(c => c === incomingJoinCol)
                         || rowColumns.find(c => c.toLowerCase() === incomingJoinCol.toLowerCase())
                         || incomingJoinCol;
        const key = String(row[physicalCol] ?? "").trim();
        if (key) {
          if (!lookup.has(key)) lookup.set(key, []);
          lookup.get(key)!.push(row);
        }
      });

      // ponytail: fan-out join — when incoming step has multiple rows per key, expand outputRows
      const expandedRows: any[] = [];
      outputRows.forEach((outRow) => {
        // ponytail: outputJoinCol may be aliased or original — check outputRow keys (exact first, then case-insensitive)
        const outRowKeys = Object.keys(outRow);
        const outputPhysicalCol = outRowKeys.find(c => c === outputJoinCol)
                                || outRowKeys.find(c => c.toLowerCase() === outputJoinCol.toLowerCase())
                                || outputJoinCol;
        const key = String(outRow[outputPhysicalCol] ?? "").trim();
        const matches = key ? lookup.get(key) : undefined;

        if (matches && matches.length > 0) {
          // Fan-out: create one output row per match
          matches.forEach((match) => {
            const newRow = { ...outRow }; // clone current row
            newRow[statusCol] = "MATCH";
            rowColumns.forEach((col) => {
              newRow[aliases[col]] = match[col];
            });
            expandedRows.push(newRow);
          });
        } else {
          // No match: keep original row with null columns
          outRow[statusCol] = "NA (WIP)";
          rowColumns.forEach((col) => {
            outRow[aliases[col]] = null;
          });
          expandedRows.push(outRow);
        }
      });

      // Replace outputRows with expanded version
      console.log(`[combineSteps] After join step ${idx}: outputRows.length before=${outputRows.length}, expandedRows.length=${expandedRows.length}`);
      console.log(`[combineSteps]   expandedRows[0] S3_pt_no=${expandedRows[0]?.['S3_pt_no']}, expandedRows[1] S3_pt_no=${expandedRows[1]?.['S3_pt_no']}, expandedRows[2] S3_pt_no=${expandedRows[2]?.['S3_pt_no']}`);

      // Debug: check all expanded rows
      if (expandedRows.length > 1) {
        const debugInfo = expandedRows.map((r, i) => ({
          rowIdx: i,
          hasS3_pt_no: !!r['S3_pt_no'],
          S3_pt_no: r['S3_pt_no'],
          keys: Object.keys(r).filter(k => k.startsWith('S3_')).slice(0, 3)
        }));
        console.log(`[combineSteps] Debug expandedRows:`, JSON.stringify(debugInfo, null, 2));
      }

      outputRows.splice(0, outputRows.length, ...expandedRows);
    }

    // Filter by visible cols if specified
    console.log(`[combineSteps] Before visibleCols filter: outputRows.length=${outputRows.length}, row[0] has S3_pt_no=${!!outputRows[0]?.['S3_pt_no']}, row[1] has S3_pt_no=${!!outputRows[1]?.['S3_pt_no']}, row[2] has S3_pt_no=${!!outputRows[2]?.['S3_pt_no']}`);

    if (config.visibleCols && config.visibleCols.length > 0) {
      const filtered = outputRows.map((row, rowIdx) => {
        const newRow: Record<string, any> = {};

        config.visibleCols!.forEach((col) => {
          // Debug first 3 rows for S3_pt_no
          const debugThis = rowIdx < 3 && col === 'S3_pt_no';
          if (debugThis) {
            console.log(`[filter] row ${rowIdx}, looking for '${col}' in keys:`, Object.keys(row).filter(k => k.includes('pt_no')));
          }
          // Try exact match first (handles physical names like "pt_no" or "S2_store_lot")
          if (row[col] !== undefined) {
            if (debugThis) console.log(`[filter]   → found exact match: row['${col}'] = ${row[col]}`);
            newRow[col] = row[col];
            return;
          } else if (debugThis) {
            console.log(`[filter]   → row['${col}'] is undefined`);
          }

          // Parse step prefix if present (e.g., "S2_storeLot" → stepIdx=1, origCol="storeLot")
          const prefixMatch = col.match(/^S(\d+)_(.+)$/);
          if (prefixMatch) {
            const stepIdx = parseInt(prefixMatch[1], 10) - 1;
            const origCol = prefixMatch[2];

            // Try with prefix first
            const withPrefix = `S${stepIdx + 1}_${origCol}`;
            if (row[withPrefix] !== undefined) {
              newRow[col] = row[withPrefix];
              return;
            }

            // If this column is from master step, try unprefixed
            if (stepIdx === baseIdx && row[origCol] !== undefined) {
              newRow[col] = row[origCol];
              return;
            }
          }

          // Fallback: search all possible runtime keys for this column
          // (handles registry keys like "ptNo" that may exist as "pt_no" or "S2_pt_no")
          let found = false;

          // 1. Try unprefixed (master step columns)
          if (row[col] !== undefined) {
            newRow[col] = row[col];
            found = true;
          }

          // 2. Try all step prefixes
          if (!found) {
            for (let i = 0; i <= steps.length; i++) {
              const prefixed = `S${i + 1}_${col}`;
              if (row[prefixed] !== undefined) {
                newRow[col] = row[prefixed];
                found = true;
                break;
              }
            }
          }

          // 3. Not found → null
          if (!found) {
            newRow[col] = null;
          }
        });

        return newRow;
      });

      console.log(`[combineSteps] Filtered to ${config.visibleCols.length} cols, returning ${filtered.length} rows`);
      return filtered;
    }

    console.log(`[combineSteps] No visibleCols filter, returning ${outputRows.length} rows`);
    return outputRows;
  }
}
