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
  paramBindings?: { stepIndex: number; column: string; paramName: string }[];
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
   * Execute the full pivot chain defined in config, injecting queryParams into
   * rootConditions (or paramBindings if defined).
   * Returns { steps: [{ table, label, rows }[]] }
   */
  async runChain(
    config: EndpointConfig,
    queryParams: Record<string, string>
  ): Promise<{ steps: { table: string; label: string; rows: Record<string, any>[]; availablePivots?: any[] }[] }> {
    const steps: { table: string; label: string; rows: Record<string, any>[]; availablePivots?: any[] }[] = [];

    const isDateColumn = (colName: string): boolean => {
      const normalized = colName.toLowerCase();
      if (normalized.includes('user_reg') || normalized.includes('user_upd') || normalized.includes('userreg') || normalized.includes('userupd')) {
        return false;
      }
      return normalized.includes('date') || normalized.includes('time') || normalized.includes('crdt') || normalized === 'reg' || normalized === 'upd';
    };

    // 1. Separate query parameters into Root Filters and Downstream Filters
    // Exclude default template date filters (like reg >= '2026-05-25') unless explicitly passed in queryParams
    let rootConditions: SearchCondition[] = config.rootConditions
      ? config.rootConditions
          .map(c => ({ ...c }))
          .filter(c => {
            const clean = c.column.replace(/^s\d+_/i, "");
            const isDate = isDateColumn(clean);
            if (!isDate) return true; // Keep permanent static constraints (e.g. customer = 'Seagate:ACA')
            
            const hasParam = Object.keys(queryParams).some(
              k => k.replace(/^s\d+_/i, "").toLowerCase() === clean.toLowerCase() &&
                   queryParams[k] !== undefined && queryParams[k] !== ""
            );
            return hasParam;
          })
      : [];

    const downstreamFilters: { stepIdx: number; cleanParam: string; value: string }[] = [];

    for (const [paramName, paramValue] of Object.entries(queryParams)) {
      if (paramValue === undefined || paramValue === "") continue;

      // Normalize prefix e.g., "S3_spool1_no" -> "spool1_no"
      const cleanParam = paramName.replace(/^s\d+_/i, "");

      // Check where this parameter belongs (Step 0 is Root, Step 1..N is Hop targetTable)
      let foundStepIdx = -1;
      const rootMeta = getTableMeta(config.rootTable);
      if (rootMeta && Object.keys(rootMeta.columns).some(k => k.toLowerCase() === cleanParam.toLowerCase() || rootMeta.columns[k].dbColumn.toLowerCase() === cleanParam.toLowerCase())) {
        foundStepIdx = 0;
      } else {
        for (let j = 0; j < config.hops.length; j++) {
          const hopMeta = getTableMeta(config.hops[j].targetTable);
          if (hopMeta && Object.keys(hopMeta.columns).some(k => k.toLowerCase() === cleanParam.toLowerCase() || hopMeta.columns[k].dbColumn.toLowerCase() === cleanParam.toLowerCase())) {
            foundStepIdx = j + 1;
            break;
          }
        }
      }

      if (foundStepIdx > 0) {
        // Belongs to downstream step! Save to sweep later
        downstreamFilters.push({ stepIdx: foundStepIdx, cleanParam, value: paramValue });
      } else if (foundStepIdx === 0) {
        // Belongs to Root Table! Process immediately as root condition
        const hasMultiple = paramValue.includes("\n") || paramValue.includes(",");
        
        // Resolve exact registry key for root condition and check if searchable (supports LIKE)
        let exactRootKey = cleanParam;
        let isSearchable = true; // Default to true
        if (rootMeta) {
          const matched = Object.keys(rootMeta.columns).find(k => k.toLowerCase() === cleanParam.toLowerCase() || rootMeta.columns[k].dbColumn.toLowerCase() === cleanParam.toLowerCase());
          if (matched) {
            exactRootKey = matched;
            isSearchable = rootMeta.columns[matched].searchable !== false;
          }
        }

        const op = hasMultiple ? "in" : (isSearchable ? "like" : "eq");

        const existing = rootConditions.find(c => c.column.toLowerCase() === exactRootKey.toLowerCase());
        if (existing) {
          existing.value = paramValue;
          existing.operator = op;
          if (hasMultiple) existing.values = paramValue.split(/[\n,]+/).map(v => v.trim()).filter(Boolean);
        } else {
          rootConditions.push({
            column: exactRootKey,
            operator: op,
            value: paramValue,
            values: hasMultiple ? paramValue.split(/[\n,]+/).map(v => v.trim()).filter(Boolean) : undefined,
          });
        }
      }
    }

    // 2. PHASE 1 & 2: Perform Two-Phase Filter Sweep on each Downstream Filter
    for (const filter of downstreamFilters) {
      console.log(`🧹 [Filter Sweep] Sweeping downstream filter: ${filter.cleanParam} = ${filter.value} on Step ${filter.stepIdx}`);
      
      let sweptKeys: string[] = [];
      let currentStepIdx = filter.stepIdx;

      // Initial Sweep: Select targetColumn from Step K
      const hopIn = config.hops[currentStepIdx - 1];
      const targetResult = await searchService.search({
        table: hopIn.targetTable,
        column: filter.cleanParam,
        value: filter.value,
        operator: "eq",
        limit: 500, // Safe maximum swept keys to prevent IN overflow
      });

      // Extract target join column values using Display Label
      const childMeta = getTableMeta(hopIn.targetTable);
      let targetLabel = hopIn.targetColumn;
      if (childMeta) {
        const exactKey = Object.keys(childMeta.columns).find(
          k => k.toLowerCase() === hopIn.targetColumn.toLowerCase() ||
               childMeta.columns[k].dbColumn.toLowerCase() === hopIn.targetColumn.toLowerCase()
        );
        if (exactKey) targetLabel = childMeta.columns[exactKey].label;
      }

      sweptKeys = [...new Set(targetResult.rows.map(r => String(r[targetLabel] ?? "")).filter(Boolean))];

      if (sweptKeys.length === 0) {
        console.log(`🧹 [Filter Sweep] No keys resolved on Step ${currentStepIdx}. Bailing out chain query.`);
        return { steps: [] };
      }

      // Backward Propagation Loop from Step K-1 down to 1
      for (let j = currentStepIdx - 1; j >= 1; j--) {
        const hopCurrent = config.hops[j];     // joins Step j (parent) to Step j+1 (child)
        const hopPrev = config.hops[j - 1];    // joins Step j-1 to Step j
        
        const joinColPrev = hopPrev.targetColumn; // column on Step j joining backwards
        const joinColNext = hopCurrent.fromColumnKey; // column on Step j joining forwards

        if (joinColPrev.toLowerCase() === joinColNext.toLowerCase()) {
          // Columns are identical, propagate keys without DB query
          console.log(`🧹 [Filter Sweep] Column match (${joinColPrev}) at Step ${j}, skipping query.`);
          continue;
        }

        // Translation query needed on Step j (which is hopPrev.targetTable)
        console.log(`🧹 [Filter Sweep] Translating ${joinColNext} ➔ ${joinColPrev} on Step ${j}...`);
        const translationResult = await pivotService.pivot({
          sourceValues: sweptKeys,
          targetTable: hopPrev.targetTable,
          targetColumn: joinColNext,
          limit: 500,
        });

        // Extract backward join values using resolved Display Label
        const stepMeta = getTableMeta(hopPrev.targetTable);
        let prevLabel = joinColPrev;
        if (stepMeta) {
          const exactKey = Object.keys(stepMeta.columns).find(
            k => k.toLowerCase() === joinColPrev.toLowerCase() ||
                 stepMeta.columns[k].dbColumn.toLowerCase() === joinColPrev.toLowerCase()
          );
          if (exactKey) prevLabel = stepMeta.columns[exactKey].label;
        }

        sweptKeys = [...new Set(translationResult.rows.map(r => String(r[prevLabel] ?? "")).filter(Boolean))];
        
        if (sweptKeys.length === 0) {
          console.log(`🧹 [Filter Sweep] Propagation broke at Step ${j}. Bailing out chain query.`);
          return { steps: [] };
        }
      }

      // Final Root Injection: Inject resolved sweptKeys into Root Table's connection column!
      const rootHop = config.hops[0];
      const rootInjectCol = rootHop.fromColumnKey; // e.g. "lot_coil"
      console.log(`🧹 [Filter Sweep] PHASE 3: Injecting ${sweptKeys.length} keys into Root Table: ${rootInjectCol}`);
      
      const existing = rootConditions.find(c => c.column.toLowerCase() === rootInjectCol.toLowerCase());
      if (existing) {
        const existingValues = existing.values ?? (existing.value ? [existing.value] : []);
        const intersection = existingValues.filter(v => sweptKeys.includes(v));
        console.log(`🧹 [Filter Sweep] Intersecting keys: ${existingValues.length} AND ${sweptKeys.length} ➔ ${intersection.length}`);
        
        if (intersection.length === 0) {
          console.log("🧹 [Filter Sweep] Intersection is empty. Bailing out chain query.");
          return { steps: [] };
        }
        existing.operator = "in";
        existing.values = intersection;
        existing.value = "";
      } else {
        rootConditions.push({
          column: rootInjectCol,
          operator: "in",
          value: "",
          values: sweptKeys,
        });
      }
    }

    if (rootConditions.length === 0) {
      throw new Error("No search conditions provided. Pass query parameters matching column keys.");
    }

    const loggedConditions = rootConditions.map(c => {
      if (c.values && c.values.length > 20) {
        return {
          ...c,
          values: `[${c.values.length} items: ${JSON.stringify(c.values.slice(0, 5))}...]`
        };
      }
      return c;
    });
    console.log("🔍 [runChain] Final Root Conditions evaluated:", JSON.stringify(loggedConditions, null, 2));

    // Step 0: root search
    const rootResult = await searchService.search({
      table: config.rootTable,
      conditions: rootConditions,
      limit: 1000000,
    });
    steps.push({
      table: config.rootTable,
      label: rootResult.tableLabel,
      rows: rootResult.rows,
      availablePivots: rootResult.availablePivots,
    });

    // Subsequent hops
    for (let i = 0; i < config.hops.length; i++) {
      const hop = config.hops[i];
      const parentIdx = hop.parentStepIdx ?? i;
      const parentStep = steps[parentIdx];
      const parentRows = parentStep ? parentStep.rows : [];

      // Extract source values from parent step using resolved Display Label (since rows are mapped)
      const parentTableMeta = getTableMeta(parentStep.table);
      let fromLabel = hop.fromColumnKey;
      if (parentTableMeta) {
        const exactKey = Object.keys(parentTableMeta.columns).find(
          (k) => k.toLowerCase() === hop.fromColumnKey.toLowerCase() ||
                 parentTableMeta.columns[k].dbColumn.toLowerCase() === hop.fromColumnKey.toLowerCase() ||
                 parentTableMeta.columns[k].label.toLowerCase() === hop.fromColumnKey.toLowerCase()
        );
        if (exactKey) {
          fromLabel = parentTableMeta.columns[exactKey].label;
        }
      }

      const sourceValues = pivotService.extractValues(parentRows, fromLabel);
      if (sourceValues.length === 0) {
        steps.push({ table: hop.targetTable, label: hop.targetTable, rows: [], availablePivots: [] });
        continue;
      }

      const pivotResult = await pivotService.pivot({
        sourceValues,
        targetTable: hop.targetTable,
        targetColumn: hop.targetColumn,
        limit: 1000000,
      });
      steps.push({
        table: hop.targetTable,
        label: pivotResult.targetTableLabel,
        rows: pivotResult.rows,
        availablePivots: pivotResult.availablePivots,
      });
    }

    return { steps };
  }

  // Perform left-join of all steps programmatically on the server, exactly matching useCombinedRows.js
  combineSteps(
    steps: { table: string; label: string; rows: Record<string, any>[] }[],
    config: EndpointConfig
  ): Record<string, any>[] {
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
      return outputRows.map((row) => {
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
    }

    return outputRows;
  }
}
