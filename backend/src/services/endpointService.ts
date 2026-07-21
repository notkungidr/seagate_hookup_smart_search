import { dbSeagateDev, getRawPool } from "../db/client";
import { savedEndpoints } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { SearchService, SearchCondition } from "./searchService";
import { PivotService } from "./pivotService";
import { getTableMeta } from "../config/tableRegistry";

const searchService = new SearchService();
const pivotService = new PivotService();

export interface EndpointConfig {
  rootTable: string;
  rootColumn: string;
  rootOperator?: string;
  rootConditions?: SearchCondition[];
  hops: {
    fromColumnKey: string;
    targetTable: string;
    targetColumn: string;
    parentStepIdx?: number; // 0-based index in steps array; defaults to idx-1 if absent
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
    const now = new Date().toISOString();
    const pool = getRawPool("SeagateDev");
    const visibility = ep.visibility === "restricted" ? "restricted" : "public";
    const apiGroup = (ep.apiGroup || "General").trim() || "General";
    const createdBy = (ep.createdBy || "").trim();

    await pool.execute(
      `INSERT INTO saved_endpoints
        (id, name, description, config, created_at, updated_at, created_by, visibility, api_group)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ep.id,
        ep.name,
        ep.description || "",
        JSON.stringify(ep.config),
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
    const totalSteps = config.hops.length + 1;

    const isDateColumn = (colName: string): boolean => {
      const normalized = colName.toLowerCase();
      if (normalized.includes('user_reg') || normalized.includes('user_upd') || normalized.includes('userreg') || normalized.includes('userupd')) {
        return false;
      }
      return normalized.includes('date') || normalized.includes('time') || normalized.includes('crdt') || normalized === 'reg' || normalized === 'upd';
    };

    // ── 1. Parse params into per-step seeds (honor S<n>_ prefix) ───────────────
    const seedsByStep: Record<number, SearchCondition[]> = {};
    const addSeed = (stepIdx: number, cond: SearchCondition) => {
      if (!seedsByStep[stepIdx]) seedsByStep[stepIdx] = [];
      seedsByStep[stepIdx].push(cond);
    };

    // Fold static config.rootConditions into step 0 (drop date filters unless a matching param arrived)
    const rootConditions: SearchCondition[] = (config.rootConditions || [])
      .map(c => ({ ...c }))
      .filter(c => {
        const clean = c.column.replace(/^s\d+_/i, "");
        if (!isDateColumn(clean)) return true;
        return Object.keys(queryParams).some(
          k => k.replace(/^s\d+_/i, "").toLowerCase() === clean.toLowerCase() &&
               queryParams[k] !== undefined && queryParams[k] !== ""
        );
      });
    rootConditions.forEach(c => addSeed(0, c));

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

    const buildSeedCond = (stepIdx: number, colKey: string, paramValue: string): SearchCondition => {
      const meta = getTableMeta(this.stepTable(config, stepIdx));
      const matched = meta
        ? Object.keys(meta.columns).find(k => k.toLowerCase() === colKey.toLowerCase() || meta.columns[k].dbColumn.toLowerCase() === colKey.toLowerCase())
        : undefined;
      const exactKey = matched || colKey;
      const isSearchable = matched ? meta!.columns[matched].searchable !== false : true;
      const hasMultiple = paramValue.includes("\n") || paramValue.includes(",");
      return {
        column: exactKey,
        operator: hasMultiple ? "in" : (isSearchable ? "like" : "eq"),
        value: paramValue,
        values: hasMultiple ? paramValue.split(/[\n,]+/).map(v => v.trim()).filter(Boolean) : undefined,
      };
    };

    for (const [paramName, paramValue] of Object.entries(queryParams)) {
      if (paramValue === undefined || paramValue === "") continue;

      const prefixMatch = paramName.match(/^S(\d+)_(.+)$/i);
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
        colKey = paramName.replace(/^s\d+_/i, "");
        stepIdx = findStepWithColumn(colKey);
        if (stepIdx === -1) continue; // unknown column — skip (allowlist should have filtered)
      }

      const cond = buildSeedCond(stepIdx, colKey, paramValue);
      const existing = (seedsByStep[stepIdx] || []).find(c => c.column.toLowerCase() === cond.column.toLowerCase());
      if (existing) {
        existing.value = cond.value;
        existing.operator = cond.operator;
        if (cond.values) existing.values = cond.values;
      } else {
        addSeed(stepIdx, cond);
      }
    }

    if (Object.keys(seedsByStep).length === 0) {
      throw new Error("No search conditions provided. Pass query parameters matching column keys.");
    }

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
      parentIdx: hop.parentStepIdx ?? i,
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
    console.log(`[combineSteps] Starting with ${steps.length} steps:`, steps.map((s,i) => `${i}:${s.table}(${s.rows.length})`).join(' '));
    if (steps.length === 0) return [];
    
    // Choose master axis (step with most rows)
    let master = steps[0];
    let maxRows = master.rows.length;
    steps.forEach((s) => {
      if (s.rows.length > maxRows) {
        maxRows = s.rows.length;
        master = s;
      }
    });

    const baseIdx = steps.indexOf(master);
    const baseRows = master.rows;
    console.log(`[combineSteps] Chosen master: step ${baseIdx} (${master.table}) with ${baseRows.length} rows`);
    if (baseRows.length === 0) return [];

    const outputRows = baseRows.map((row) => ({ ...row }));
    const usedColumns = new Set(Object.keys(baseRows[0]));
    const columnAliases: Record<number, Record<string, string>> = { [baseIdx]: {} };
    Object.keys(baseRows[0]).forEach((col) => {
      columnAliases[baseIdx][col] = col;
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
            const pIdx = hop?.parentStepIdx ?? (item.idx - 1);
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
            const pIdx = hop?.parentStepIdx ?? (jIdx - 1);
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
      } else {
        // Child is joined (connectStepIdx), parent is incoming (idx)
        outputJoinCol = columnAliases[connectStepIdx]?.[rightCol] || rightCol;
        incomingJoinCol = leftCol;
      }

      const statusCol = `S${idx + 1}_Status`;
      usedColumns.add(statusCol);

      const aliases: Record<string, string> = {};
      columnAliases[idx] = aliases;

      const rowColumns = step.rows.length ? Object.keys(step.rows[0]) : [];
      rowColumns.forEach((col) => {
        const alias = col === incomingJoinCol || usedColumns.has(col) ? `S${idx + 1}_${col}` : col;
        aliases[col] = alias;
        usedColumns.add(alias);
      });

      const lookup = new Map();
      step.rows.forEach((row) => {
        const key = String(row[incomingJoinCol] ?? "").trim();
        if (key && !lookup.has(key)) lookup.set(key, row);
      });

      outputRows.forEach((outRow) => {
        const key = String(outRow[outputJoinCol] ?? "").trim();
        const match = key ? lookup.get(key) : undefined;
        if (match) {
          outRow[statusCol] = "MATCH";
          rowColumns.forEach((col) => {
            outRow[aliases[col]] = match[col];
          });
        } else {
          outRow[statusCol] = "NA (WIP)";
          rowColumns.forEach((col) => {
            outRow[aliases[col]] = null;
          });
        }
      });
    }

    // Filter by visible cols if specified (with dynamic alias fallback for consistent schema keys)
    if (config.visibleCols && config.visibleCols.length > 0) {
      const masterIdx = baseIdx;
      const filtered = outputRows.map((row) => {
        const newRow: Record<string, any> = {};
        config.visibleCols!.forEach((col) => {
          // Parse col name to find stepIdx and original column name
          const match = col.match(/^S(\d+)_(.+)$/);
          let stepIdx = 0;
          let origCol = col;
          if (match) {
            stepIdx = parseInt(match[1], 10) - 1;
            origCol = match[2];
          }

          // Determine the runtime key in combined row
          const runtimeKey = stepIdx === masterIdx ? origCol : `S${stepIdx + 1}_${origCol}`;

          if (row[runtimeKey] !== undefined) {
            newRow[col] = row[runtimeKey];
          } else {
            // Fallback: search across all step prefix variants
            let foundVal: any = undefined;
            if (row[col] !== undefined) {
              foundVal = row[col];
            } else {
              for (let i = 1; i <= steps.length; i++) {
                const prefixedKey = `S${i}_${col}`;
                if (row[prefixedKey] !== undefined) {
                  foundVal = row[prefixedKey];
                  break;
                }
              }
            }
            newRow[col] = foundVal !== undefined ? foundVal : null;
          }
        });
        return newRow;
      });
      console.log(`[combineSteps] Filtered by visibleCols, returning ${filtered.length} rows`);
      return filtered;
    }

    console.log(`[combineSteps] No visibleCols filter, returning ${outputRows.length} rows`);
    return outputRows;
  }
}
