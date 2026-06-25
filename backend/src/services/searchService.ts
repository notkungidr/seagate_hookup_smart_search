import { db, dbACA, dbBitintra, getDb, getRawPool } from "../db/client";
import { sql } from "drizzle-orm";
import { getTableMeta, TABLE_REGISTRY, TableMeta, buildSelectClause, mapRowToLabels } from "../config/tableRegistry";

import { BATCH_SIZE } from "../config/appConfig";

function formatParams(params: any[]): string {
  if (!params) return "[]";
  if (params.length > 20) {
    return `[${params.length} items: ${JSON.stringify(params.slice(0, 5))}...]`;
  }
  return JSON.stringify(params);
}

export interface SearchCondition {
  column: string;      // key ใน TABLE_REGISTRY (camelCase)
  operator: "like" | "eq" | "in" | "between" | "gte" | "lte";
  value: string;
  value2?: string;     // สำหรับ between
  values?: string[];
}

export interface SearchParams {
  table: string;
  column?: string;      // key ใน TABLE_REGISTRY (camelCase) (optional for legacy)
  value?: string;       // สำหรับ like/eq (optional for legacy)
  value2?: string;      // (optional for legacy)
  values?: string[];   // สำหรับ IN operator (optional for legacy)
  operator?: "like" | "eq" | "in" | "between" | "gte" | "lte"; // (optional for legacy)
  limit?: number;
  conditions?: SearchCondition[]; // ค้นหาได้หลายฟิลด์พร้อมกัน
}

export interface SearchResult {
  table: string;
  tableLabel: string;
  column: string;
  columnLabel: string;
  value: string;
  operator: string;
  total: number;
  rows: Record<string, any>[];
  availablePivots: {
    fromColumnKey: string;
    fromColumnLabel: string;
    fromDbColumn: string;
    linksTo: { targetTable: string; targetColumn: string; label: string }[];
  }[];
  debug?: {
    sql: string;
    params: any[];
  };
}

export class SearchService {
  async search(params: SearchParams): Promise<SearchResult> {
    const { table, column, value, values, operator = "like", limit = 1000000, conditions } = params;

    const tableMeta = getTableMeta(table);
    if (!tableMeta) throw new Error(`Table "${table}" not found in registry`);

    // 1. Normalize to conditions list first so all paths benefit from validation & normalization
    const conditionsList: SearchCondition[] = conditions && conditions.length > 0
      ? conditions
      : [{ column: column!, operator: operator ?? "like", value: value ?? "", values }];

    if (conditionsList.length === 0 || !conditionsList[0].column) {
      throw new Error("กรุณาระบุอย่างน้อย 1 เงื่อนไขสำหรับการค้นหา");
    }

    // 2. Validate and Normalize Columns in conditions (supports camelCase key, physical dbColumn, and display labels)
    for (const cond of conditionsList) {
      const exactKey = Object.keys(tableMeta.columns).find(
        (k) => k.toLowerCase() === cond.column.toLowerCase() ||
               tableMeta.columns[k].dbColumn.toLowerCase() === cond.column.toLowerCase() ||
               tableMeta.columns[k].label.toLowerCase() === cond.column.toLowerCase()
      );
      const colMeta = exactKey ? tableMeta.columns[exactKey] : undefined;

      if (!colMeta) throw new Error(`Column "${cond.column}" not found in table "${table}"`);
      if (!colMeta.searchable) throw new Error(`Column "${cond.column}" is not searchable`);
      
      // Override with exact camelCase key for downstream Drizzle/mapping DB logic
      if (exactKey) {
        cond.column = exactKey;
      }
    }

    // 3. Generic Custom SQL / Sentinel Dispatcher (mirrors pivotService)
    if (tableMeta.customSql) {
      if (tableMeta.customSql.multiQuery && tableMeta.customSql.multiQueryType === "wms") {
        return this._searchWmsMulti(params, tableMeta, conditionsList);
      }
      return this._searchWithCustomSql(params, tableMeta, conditionsList);
    }

    const dbTable = tableMeta.tableName;
    const connKey = tableMeta.connectionKey;

    // Dynamic tables with connectionKey other than seagate/ACA cannot use Drizzle ORM
    // (Drizzle only has seagate & ACA schemas hardcoded). Route them to raw pool instead.
    const isDynamicNonDrizzle = !!connKey && connKey !== "seagate" && connKey !== "ACA";
    if (isDynamicNonDrizzle) {
      return this._searchWithRawPool(params, tableMeta, connKey!, conditionsList, limit);
    }

    const queryDb = tableMeta.database === "ACA" ? dbACA : db;

    // ── 3. Build Query ───────────────────────────────────────────────────────
    let resultRows: Record<string, any>[] = [];
    let debugSql = "";
    let debugParams: any[] = [];

    // ค้นหาว่ามีเงื่อนไขแบบ IN หรือไม่ (เนื่องจากต้องการ 1000-batching เพื่อความปลอดภัยของ DB)
    const inCondition = conditionsList.find(c => c.operator === "in");

    const selectClause = buildSelectClause(tableMeta);
    if (inCondition) {
      // Parse values สำหรับฟิลด์ที่เป็น IN
      const rawValues = inCondition.values && inCondition.values.length > 0
        ? inCondition.values
        : (inCondition.value ?? "").split(/[\n,]+/).map(v => v.trim()).filter(v => v.length > 0);

      const uniqueValues = [...new Set(rawValues)];
      if (uniqueValues.length === 0) throw new Error("ไม่มีค่าสำหรับ IN query");

      // Batch IN queries (1000 ต่อ batch — MySQL 5 safe)
      const allRows: Record<string, any>[] = [];
      const colMetaIn = tableMeta.columns[inCondition.column];
      const dbColIn = colMetaIn.dbColumn;

      for (let i = 0; i < uniqueValues.length; i += BATCH_SIZE) {
        const batch = uniqueValues.slice(i, i + BATCH_SIZE);
        const fragments: any[] = [];

        // 1. เพิ่ม IN clause สำหรับเงื่อนไข IN หลัก
        const chunks = batch.map(v => sql`${v}`);
        const joined = sql.join(chunks, sql`, `);
        fragments.push(sql`${sql.identifier(dbColIn)} IN (${joined})`);

        // 2. เพิ่มเงื่อนไขอื่นๆ เข้ามาร่วมด้วย (LIKE, EQ หรือ IN อื่นๆ)
        for (const cond of conditionsList) {
          if (cond === inCondition) continue;
          const colMeta = tableMeta.columns[cond.column];
          const dbCol = colMeta.dbColumn;

          if (cond.operator === "like" && cond.value) {
            fragments.push(sql`${sql.identifier(dbCol)} LIKE ${`%${cond.value}%`}`);
          } else if (cond.operator === "eq" && cond.value) {
            fragments.push(sql`${sql.identifier(dbCol)} = ${cond.value}`);
          } else if (cond.operator === "gte" && cond.value) {
            fragments.push(sql`${sql.identifier(dbCol)} >= ${cond.value}`);
          } else if (cond.operator === "lte" && cond.value) {
            fragments.push(sql`${sql.identifier(dbCol)} <= ${cond.value}`);
          } else if (cond.operator === "between" && cond.value && cond.value2) {
            fragments.push(sql`${sql.identifier(dbCol)} BETWEEN ${cond.value} AND ${cond.value2}`);
          } else if (cond.operator === "in") {
            const otherRaw = cond.values && cond.values.length > 0
              ? cond.values
              : (cond.value ?? "").split(/[\n,]+/).map(v => v.trim()).filter(v => v.length > 0);
            const otherUnique = [...new Set(otherRaw)];
            if (otherUnique.length > 0) {
              const otherChunks = otherUnique.map(v => sql`${v}`);
              const otherJoined = sql.join(otherChunks, sql`, `);
              fragments.push(sql`${sql.identifier(dbCol)} IN (${otherJoined})`);
            }
          }
        }

        const whereClause = sql.join(fragments, sql` AND `);
        const query = sql`SELECT ${sql.raw(selectClause)} FROM ${sql.identifier(dbTable)} WHERE ${whereClause}`;
        const compiled = queryDb.dialect.sqlToQuery(query);

        // Store first batch debug info
        if (i === 0) { debugSql = compiled.sql; debugParams = compiled.params; }

        console.log(`\n\x1b[35m╔══════════ [SQL Debug - Search IN Batch ${Math.floor(i / BATCH_SIZE) + 1}] ══════════\x1b[0m`);
        console.log(`\x1b[35m║\x1b[0m \x1b[1mDatabase:\x1b[0m ${tableMeta.database || "seagate"}`);
        console.log(`\x1b[35m║\x1b[0m \x1b[1mTable:\x1b[0m    ${dbTable}`);
        console.log(`\x1b[35m║\x1b[0m \x1b[1mSQL:\x1b[0m    \x1b[36m${compiled.sql}\x1b[0m`);
        console.log(`\x1b[35m║\x1b[0m \x1b[1mParams:\x1b[0m \x1b[33m${formatParams(compiled.params)}\x1b[0m`);
        console.log(`\x1b[35m╚══════════════════════════════════════════════════════════\x1b[0m\n`);

        const rows = await queryDb.execute(query) as any;
        const batch_rows: Record<string, any>[] = Array.isArray(rows[0]) ? rows[0] : rows;
        for (let j = 0; j < batch_rows.length; j++) {
          allRows.push(batch_rows[j]);
        }
      }
      resultRows = allRows;

    } else {
      // ไม่มี IN operator เลย (มีแค่ LIKE และ EQ)
      const fragments: any[] = [];
      for (const cond of conditionsList) {
        const colMeta = tableMeta.columns[cond.column];
        const dbCol = colMeta.dbColumn;

        if (cond.operator === "like" && cond.value) {
          fragments.push(sql`${sql.identifier(dbCol)} LIKE ${`%${cond.value}%`}`);
        } else if (cond.operator === "eq" && cond.value) {
          fragments.push(sql`${sql.identifier(dbCol)} = ${cond.value}`);
        } else if (cond.operator === "gte" && cond.value) {
          fragments.push(sql`${sql.identifier(dbCol)} >= ${cond.value}`);
        } else if (cond.operator === "lte" && cond.value) {
          fragments.push(sql`${sql.identifier(dbCol)} <= ${cond.value}`);
        } else if (cond.operator === "between" && cond.value && cond.value2) {
          fragments.push(sql`${sql.identifier(dbCol)} BETWEEN ${cond.value} AND ${cond.value2}`);
        }
      }

      const whereClause = fragments.length > 0 ? sql.join(fragments, sql` AND `) : sql`1=1`;
      const query = sql`SELECT ${sql.raw(selectClause)} FROM ${sql.identifier(dbTable)} WHERE ${whereClause}`;

      const compiled = queryDb.dialect.sqlToQuery(query);
      debugSql = compiled.sql;
      debugParams = compiled.params;

      console.log(`\n\x1b[35m╔════════════════════════ [SQL Debug - Search] ══════════════════════════════\x1b[0m`);
      console.log(`\x1b[35m║\x1b[0m \x1b[1mDatabase:\x1b[0m   ${tableMeta.database || "seagate"}`);
      console.log(`\x1b[35m║\x1b[0m \x1b[1mTable:\x1b[0m      ${dbTable}`);
      console.log(`\x1b[35m║\x1b[0m \x1b[1mSQL:\x1b[0m        \x1b[36m${debugSql}\x1b[0m`);
      console.log(`\x1b[35m║\x1b[0m \x1b[1mParams:\x1b[0m     \x1b[33m${formatParams(debugParams)}\x1b[0m`);
      console.log(`\x1b[35m╚═════════════════════════════════════════════════════════════════════════════\x1b[0m\n`);

      const rows = await queryDb.execute(query) as any;
      resultRows = Array.isArray(rows[0]) ? rows[0] : rows;
    }

    const mappedRows = resultRows.map(r => mapRowToLabels(r, tableMeta));
    const limited = mappedRows.slice(0, limit);

    // 4. Pivot Suggestions
    const isDynamicTable = !!tableMeta.connectionKey;
    const availablePivots = Object.entries(tableMeta.columns)
      .filter(([, col]) => col.searchable)
      .filter(([, col]) => !isDynamicTable || (col.linksTo && col.linksTo.length > 0))
      .map(([colKey, col]) => {
        const links = col.linksTo ? [...col.linksTo] : [];

        // 1. Auto-link to ALL other tables that share the exact same column key
        if (!isDynamicTable) {
          for (const [otherTableKey, otherTableMeta] of Object.entries(TABLE_REGISTRY)) {
            if (otherTableKey === table) continue;
            if (otherTableMeta.columns[colKey] && otherTableMeta.columns[colKey].searchable) {
              const alreadyLinked = links.some(l => l.targetTable === otherTableKey);
              if (!alreadyLinked) {
                links.push({
                  targetTable: otherTableKey,
                  targetColumn: colKey,
                  label: `→ ${otherTableMeta.label}`
                });
              }
            }
          }
        }

        // 2. Add Self Link at the top
        links.unshift({ targetTable: table, targetColumn: colKey, label: `🔍 ดึงข้อมูลทั้งหมดในตารางนี้ (Self)` });

        return {
          fromColumnKey: colKey,
          fromColumnLabel: col.label,
          fromDbColumn: col.label,
          linksTo: links,
        };
      });

    const descCol = conditionsList.map(c => tableMeta.columns[c.column]?.label ?? c.column).join(" + ");
    const descVal = conditionsList.map(c => {
      if (c.operator === "in") return `IN (${resultRows.length} values)`;
      if (c.operator === "between") return `${c.value} ~ ${c.value2}`;
      return c.value;
    }).join(" & ");
    const descOp = conditionsList.length > 1 ? "multi" : conditionsList[0].operator;

    return {
      table,
      tableLabel: tableMeta.label,
      column: conditionsList[0].column,
      columnLabel: descCol,
      value: descVal,
      operator: descOp,
      total: limited.length,
      rows: limited,
      availablePivots,
      debug: { sql: debugSql, params: debugParams },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: Generic customSql Search Handler
  // ═══════════════════════════════════════════════════════════════════════════
  private async _searchWithCustomSql(
    params: SearchParams,
    tableMeta: TableMeta,
    conditionsList: SearchCondition[]
  ): Promise<SearchResult> {
    const { table, limit = 1000000 } = params;
    const customSql = tableMeta.customSql!;
    const connKey = customSql.connectionKey;
    const rawPool = getRawPool(connKey);

    const executedQueries: { sql: string; params: any[] }[] = [];
    const allRows: Record<string, any>[] = [];

    let baseSql = "";
    const selectClause = buildSelectClause(tableMeta);

    if (table === "ACA_BONDING_DATA" || table === "ACA_BONDING_DATA_2") {
      baseSql = `SELECT ${selectClause} FROM BIT.${tableMeta.tableName} WHERE customer = 'Seagate:ACA'`;
    } else if (table === "tl_info") {
      baseSql = `SELECT tl.lot AS 'Lot', tl.tl AS 'TL (SN)', tl.date AS 'Date', tl.time AS 'Time', tl.en AS 'EN', tl.lot_size AS 'Lot Size', tl.flex AS 'Flex', tl.pivot AS 'Pivot', tl.remark AS 'Remark', tl.internal_remark AS 'Internal Remark', tl.sbr_no AS 'SBR No', tl.re_fg AS 'Re FG', tl.rtv AS 'RTV', tl.pn_BIT AS 'PN BIT', tl.preamp_name AS 'Preamp Name', tl.cus_type AS 'Customer Type', tl.product_code AS 'Product Code', tl.digit5 AS 'Digit5', tl.prefix AS 'Prefix', tl.pcca_part_no_rev AS 'PCCA Part No Rev', tl.dp460_lot AS 'DP460 Lot', tl.stx_sbr AS 'STX SBR', tl.arm AS 'Arm', tl.eblock AS 'Eblock', tl.coil AS 'Coil', tl.pccarev AS 'PCCA Rev', pc.detail AS 'PC Detail', pc.model AS 'PC Model', pc.product_code AS 'PC Product Code' FROM tl INNER JOIN pc ON pc.pn_BIT = tl.pn_BIT WHERE 1=1`;
    } else if (tableMeta.customSql && (tableMeta.customSql as any).customSql) {
      let template = (tableMeta.customSql as any).customSql;
      // Strip off any custom projection and replace with buildSelectClause aliased columns
      if (template.toLowerCase().startsWith("select ")) {
        const fromIdx = template.toLowerCase().indexOf("from ");
        if (fromIdx !== -1) {
          template = `SELECT ${selectClause} ${template.substring(fromIdx)}`;
        }
      }
      // Strip column IN (?) logic at the end
      baseSql = template.replace(/\s+AND\s+`?\??col`?\s+IN\s*\(\s*\?\s*\)/gi, "");
      baseSql = baseSql.replace(/\s+AND\s+`?\??col`?\s+IN\s*\?\s*/gi, "");
      baseSql = baseSql.trim();
      if (baseSql.endsWith(";")) {
        baseSql = baseSql.slice(0, -1);
      }
    } else {
      baseSql = `SELECT ${selectClause} FROM \`${tableMeta.tableName}\` WHERE 1=1`;
    }

    const queryParams: any[] = [];
    const inCondition = conditionsList.find(c => c.operator === "in");

    const getDbColName = (condColumn: string) => {
      const dbCol = tableMeta.columns[condColumn].dbColumn;
      if (table === "tl_info") {
        const pcCols = new Set(["pc_detail", "pc_model", "pc_product_code"]);
        if (pcCols.has(dbCol)) {
          const pcCol = dbCol === "pc_detail" ? "detail" : dbCol === "pc_model" ? "model" : "product_code";
          return `pc.\`${pcCol}\``;
        }
        return `tl.\`${dbCol}\``;
      }
      if (dbCol.includes(".")) {
        return dbCol.split(".").map(part => `\`${part.trim()}\``).join(".");
      }
      return `\`${dbCol}\``;
    };

    if (inCondition) {
      const rawValues = inCondition.values && inCondition.values.length > 0
        ? inCondition.values
        : (inCondition.value ?? "").split(/[\n,]+/).map(v => v.trim()).filter(v => v.length > 0);
      const uniqueValues = [...new Set(rawValues)];

      if (uniqueValues.length === 0) throw new Error("ไม่มีค่าสำหรับ IN query");

      const inDbCol = getDbColName(inCondition.column);

      for (let i = 0; i < uniqueValues.length; i += BATCH_SIZE) {
        const batch = uniqueValues.slice(i, i + BATCH_SIZE);
        const batchParams: any[] = [];
        let batchWhere = "";

        batchWhere += ` AND ${inDbCol} IN (${batch.map(v => { batchParams.push(v); return "?"; }).join(",")})`;

        for (const cond of conditionsList) {
          if (cond === inCondition) continue;
          const dbCol = getDbColName(cond.column);
          if (cond.operator === "like" && cond.value) {
            batchWhere += ` AND ${dbCol} LIKE ?`;
            batchParams.push(`%${cond.value}%`);
          } else if (cond.operator === "eq" && cond.value) {
            batchWhere += ` AND ${dbCol} = ?`;
            batchParams.push(cond.value);
          } else if (cond.operator === "gte" && cond.value) {
            batchWhere += ` AND ${dbCol} >= ?`;
            batchParams.push(cond.value);
          } else if (cond.operator === "lte" && cond.value) {
            batchWhere += ` AND ${dbCol} <= ?`;
            batchParams.push(cond.value);
          } else if (cond.operator === "between" && cond.value && cond.value2) {
            batchWhere += ` AND ${dbCol} BETWEEN ? AND ?`;
            batchParams.push(cond.value, cond.value2);
          } else if (cond.operator === "in") {
            const otherRaw = cond.values && cond.values.length > 0
              ? cond.values
              : (cond.value ?? "").split(/[\n,]+/).map(v => v.trim()).filter(v => v.length > 0);
            const otherUnique = [...new Set(otherRaw)];
            if (otherUnique.length > 0) {
              batchWhere += ` AND ${dbCol} IN (${otherUnique.map(v => { batchParams.push(v); return "?"; }).join(",")})`;
            }
          }
        }

        const fullSql = `${baseSql}${batchWhere} LIMIT ${limit}`;
        if (i === 0) {
          executedQueries.push({ sql: fullSql, params: batchParams });
        }

        console.log(`\n\x1b[35m╔════════════ [customSql Search - Batch ${Math.floor(i / BATCH_SIZE) + 1}] ════════════\x1b[0m`);
        console.log(`\x1b[35m║\x1b[0m \x1b[1mDatabase:\x1b[0m   ${connKey}`);
        console.log(`\x1b[35m║\x1b[0m \x1b[1mTable:\x1b[0m      ${tableMeta.tableName}`);
        console.log(`\x1b[35m║\x1b[0m \x1b[1mSQL:\x1b[0m \x1b[36m${fullSql}\x1b[0m`);
        console.log(`\x1b[35m║\x1b[0m \x1b[1mParams:\x1b[0m \x1b[33m${formatParams(batchParams)}\x1b[0m`);
        console.log(`\x1b[35m╚═══════════════════════════════════════════════════════════════\x1b[0m\n`);

        const res = await rawPool.execute(fullSql, batchParams) as any;
        const batchRows = Array.isArray(res[0]) ? res[0] : res;
        for (let j = 0; j < batchRows.length; j++) {
          allRows.push(batchRows[j]);
        }
      }
    } else {
      let additionalWhere = "";
      const batchParams: any[] = [];

      for (const cond of conditionsList) {
        const dbCol = getDbColName(cond.column);
        if (cond.operator === "like" && cond.value) {
          additionalWhere += ` AND ${dbCol} LIKE ?`;
          batchParams.push(`%${cond.value}%`);
        } else if (cond.operator === "eq" && cond.value) {
          additionalWhere += ` AND ${dbCol} = ?`;
          batchParams.push(cond.value);
        } else if (cond.operator === "gte" && cond.value) {
          additionalWhere += ` AND ${dbCol} >= ?`;
          batchParams.push(cond.value);
        } else if (cond.operator === "lte" && cond.value) {
          additionalWhere += ` AND ${dbCol} <= ?`;
          batchParams.push(cond.value);
        } else if (cond.operator === "between" && cond.value && cond.value2) {
          additionalWhere += ` AND ${dbCol} BETWEEN ? AND ?`;
          batchParams.push(cond.value, cond.value2);
        }
      }

      const fullSql = `${baseSql}${additionalWhere} LIMIT ${limit}`;
      executedQueries.push({ sql: fullSql, params: batchParams });

      console.log(`\n\x1b[35m╔════════════ [customSql Search] ════════════\x1b[0m`);
      console.log(`\x1b[35m║\x1b[0m \x1b[1mDatabase:\x1b[0m   ${connKey}`);
      console.log(`\x1b[35m║\x1b[0m \x1b[1mTable:\x1b[0m      ${tableMeta.tableName}`);
      console.log(`\x1b[35m║\x1b[0m \x1b[1mSQL:\x1b[0m        \x1b[36m${fullSql}\x1b[0m`);
      console.log(`\x1b[35m║\x1b[0m \x1b[1mParams:\x1b[0m     \x1b[33m${formatParams(batchParams)}\x1b[0m`);
      console.log(`\x1b[35m╚════════════════════════════════════════════\x1b[0m\n`);

      const res = await rawPool.execute(fullSql, batchParams) as any;
      const batchRows = Array.isArray(res[0]) ? res[0] : res;
      for (let j = 0; j < batchRows.length; j++) {
        allRows.push(batchRows[j]);
      }
    }

    const mappedRows = allRows.map(row => mapRowToLabels(row, tableMeta));
    const limited = mappedRows.slice(0, limit);

    const isDynamicTable = !!tableMeta.connectionKey;
    const availablePivots = Object.entries(tableMeta.columns)
      .filter(([, col]) => col.searchable)
      .filter(([, col]) => !isDynamicTable || (col.linksTo && col.linksTo.length > 0))
      .map(([colKey, col]) => {
        const links = col.linksTo ? [...col.linksTo] : [];

        if (!isDynamicTable) {
          for (const [otherTableKey, otherTableMeta] of Object.entries(TABLE_REGISTRY)) {
            if (otherTableKey === table) continue;
            if (otherTableMeta.columns[colKey] && otherTableMeta.columns[colKey].searchable) {
              const alreadyLinked = links.some(l => l.targetTable === otherTableKey);
              if (!alreadyLinked) {
                links.push({
                  targetTable: otherTableKey,
                  targetColumn: colKey,
                  label: `→ ${otherTableMeta.label}`
                });
              }
            }
          }
        }

        links.unshift({ targetTable: table, targetColumn: colKey, label: `🔍 ดึงข้อมูลทั้งหมดในตารางนี้ (Self)` });

        return {
          fromColumnKey: colKey,
          fromColumnLabel: col.label,
          fromDbColumn: col.label,
          linksTo: links,
        };
      });

    const descCol = conditionsList.map(c => tableMeta.columns[c.column]?.label ?? c.column).join(" + ");
    const descVal = conditionsList.map(c => {
      if (c.operator === "in") return `IN (${limited.length} values)`;
      if (c.operator === "between") return `${c.value} ~ ${c.value2}`;
      return c.value;
    }).join(" & ");
    const descOp = conditionsList.length > 1 ? "multi" : conditionsList[0].operator;

    return {
      table,
      tableLabel: tableMeta.label,
      column: conditionsList[0].column,
      columnLabel: descCol,
      value: descVal,
      operator: descOp,
      total: limited.length,
      rows: limited,
      availablePivots,
      debug: executedQueries.length > 0 ? executedQueries[0] : { sql: "", params: [] },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: WMS Sentinel Search Handler
  // ═══════════════════════════════════════════════════════════════════════════
  private async _searchWmsMulti(
    params: SearchParams,
    tableMeta: TableMeta,
    conditionsList: SearchCondition[]
  ): Promise<SearchResult> {
    const { table, limit = 1000000 } = params;

    const WMS_COL_MAP: Record<string, { shipment: string | null; fgrec: string | null }> = {
      prod_lot: { shipment: "prod_lot", fgrec: "prod_lot" },
      wms_source: { shipment: null, fgrec: null },
      store_lot: { shipment: "store_lot", fgrec: "store_lot" },
      qty: { shipment: "qty", fgrec: "lot_size" },
      do_no: { shipment: "do_no", fgrec: null },
      plan_id: { shipment: "plan_id", fgrec: null },
      product_name: { shipment: null, fgrec: "product_name" },
      customer: { shipment: null, fgrec: "customer" },
      receive_date: { shipment: "receive_date", fgrec: "receive_date" },
      lot_status: { shipment: null, fgrec: "lot_status" },
      item_no: { shipment: null, fgrec: "item_no" },
      cust_pn: { shipment: null, fgrec: "cust_pn" },
      mt_no: { shipment: null, fgrec: "mt_no" },
    };

    let queryShipment = true;
    let queryFgrec = true;

    for (const cond of conditionsList) {
      const mapping = WMS_COL_MAP[cond.column];
      if (!mapping) continue;
      if (mapping.shipment === null && mapping.fgrec !== null) queryShipment = false;
      if (mapping.fgrec === null && mapping.shipment !== null) queryFgrec = false;
    }

    const executedQueries: { sql: string; params: any[] }[] = [];
    const allRows: Record<string, any>[] = [];

    const buildWhereFragments = (tableType: 'shipment' | 'fgrec', customConditionsList: SearchCondition[]) => {
      const fragments: any[] = [];
      for (const cond of customConditionsList) {
        const mapping = WMS_COL_MAP[cond.column];
        if (!mapping) continue;
        const dbCol = tableType === 'shipment' ? mapping.shipment : mapping.fgrec;
        if (!dbCol) continue;

        if (cond.operator === "like" && cond.value) {
          fragments.push(sql`${sql.identifier(dbCol)} LIKE ${`%${cond.value}%`}`);
        } else if (cond.operator === "eq" && cond.value) {
          fragments.push(sql`${sql.identifier(dbCol)} = ${cond.value}`);
        } else if (cond.operator === "gte" && cond.value) {
          fragments.push(sql`${sql.identifier(dbCol)} >= ${cond.value}`);
        } else if (cond.operator === "lte" && cond.value) {
          fragments.push(sql`${sql.identifier(dbCol)} <= ${cond.value}`);
        } else if (cond.operator === "between" && cond.value && cond.value2) {
          fragments.push(sql`${sql.identifier(dbCol)} BETWEEN ${cond.value} AND ${cond.value2}`);
        } else if (cond.operator === "in") {
          const rawVals = cond.values && cond.values.length > 0
            ? cond.values
            : (cond.value ?? "").split(/[\n,]+/).map(v => v.trim()).filter(v => v.length > 0);
          const unique = [...new Set(rawVals)];
          if (unique.length > 0) {
            const chunks = unique.map(v => sql`${v}`);
            const joined = sql.join(chunks, sql`, `);
            fragments.push(sql`${sql.identifier(dbCol)} IN (${joined})`);
          }
        }
      }
      return fragments;
    };

    const inCondition = conditionsList.find(c => c.operator === "in");
    let uniqueValues: string[] = [];
    if (inCondition) {
      const rawVals = inCondition.values && inCondition.values.length > 0
        ? inCondition.values
        : (inCondition.value ?? "").split(/[\n,]+/).map(v => v.trim()).filter(v => v.length > 0);
      uniqueValues = [...new Set(rawVals)];
    }

    if (inCondition && uniqueValues.length > 0) {
      if (queryShipment) {
        const shipmentRows: any[] = [];
        for (let i = 0; i < uniqueValues.length; i += BATCH_SIZE) {
          const batch = uniqueValues.slice(i, i + BATCH_SIZE);
          const batchConditions = conditionsList.map(c => {
            if (c === inCondition) {
              return { ...c, values: batch };
            }
            return c;
          });

          const fragments = buildWhereFragments('shipment', batchConditions);
          if (fragments.length > 0) {
            const whereClause = sql.join(fragments, sql` AND `);
            const query = sql`SELECT * FROM WMS.SHIPMENTPALLET_BOX_PROD WHERE ${whereClause} LIMIT ${limit}`;
            const compiled = dbBitintra.dialect.sqlToQuery(query);
            if (i === 0) {
              executedQueries.push({ sql: compiled.sql, params: compiled.params });
            }

            console.log(`\n\x1b[35m╔════════════ WMS Search (SHIPMENTPALLET_BOX_PROD) Batch ${Math.floor(i / BATCH_SIZE) + 1} ════════════\x1b[0m`);
            console.log(`\x1b[35m║\x1b[0m \x1b[1mSQL:\x1b[0m \x1b[36m${compiled.sql}\x1b[0m`);
            console.log(`\x1b[35m║\x1b[0m \x1b[1mParams:\x1b[0m \x1b[33m${formatParams(compiled.params)}\x1b[0m`);
            console.log(`\x1b[35m╚═══════════════════════════════════════════════════════════════\x1b[0m\n`);

            const res = await dbBitintra.execute(query) as any;
            const rows = Array.isArray(res[0]) ? res[0] : res;
            for (let j = 0; j < rows.length; j++) {
              shipmentRows.push(rows[j]);
            }
          }
        }

        const prodLots = [...new Set(shipmentRows.map((r: any) => String(r.prod_lot).trim()).filter(Boolean))];
        let fgRecMap = new Map<string, any>();
        if (prodLots.length > 0) {
          for (let i = 0; i < prodLots.length; i += BATCH_SIZE) {
            const batch = prodLots.slice(i, i + BATCH_SIZE);
            const placeholders = batch.map(v => sql`${v}`);
            const joined = sql.join(placeholders, sql`, `);
            const fgQuery = sql`SELECT * FROM WMS.SG_FGREC_DATA WHERE prod_lot IN (${joined})`;
            const fgRes = await dbBitintra.execute(fgQuery) as any;
            const fgRows = Array.isArray(fgRes[0]) ? fgRes[0] : fgRes;
            fgRows.forEach((r: any) => {
              const key = String(r.prod_lot).trim();
              if (key) fgRecMap.set(key, r);
            });
          }
        }

        shipmentRows.forEach((r: any) => {
          const pLot = String(r.prod_lot).trim();
          const fgRec = fgRecMap.get(pLot) || {};
          allRows.push({
            wms_source: "DO Shipment",
            prod_lot: r.prod_lot,
            store_lot: r.store_lot,
            qty: r.qty,
            do_no: r.do_no,
            plan_id: r.plan_id,
            product_name: fgRec.product_name || "",
            customer: fgRec.customer || "",
            receive_date: r.receive_date ? String(r.receive_date) : (fgRec.receive_date ? String(fgRec.receive_date) : ""),
            lot_status: fgRec.lot_status || "",
            item_no: fgRec.item_no || "",
            cust_pn: fgRec.cust_pn || "",
            mt_no: fgRec.mt_no || "",
          });
        });
      }

      if (queryFgrec) {
        const fgrecRows: any[] = [];
        for (let i = 0; i < uniqueValues.length; i += BATCH_SIZE) {
          const batch = uniqueValues.slice(i, i + BATCH_SIZE);
          const batchConditions = conditionsList.map(c => {
            if (c === inCondition) {
              return { ...c, values: batch };
            }
            return c;
          });

          const fragments = buildWhereFragments('fgrec', batchConditions);
          if (fragments.length > 0) {
            const whereClause = sql.join(fragments, sql` AND `);
            const query = sql`SELECT * FROM WMS.SG_FGREC_DATA WHERE ${whereClause} LIMIT ${limit}`;
            const compiled = dbBitintra.dialect.sqlToQuery(query);
            if (i === 0 && executedQueries.length === 0) {
              executedQueries.push({ sql: compiled.sql, params: compiled.params });
            }

            console.log(`\n\x1b[35m╔════════════ WMS Search (SG_FGREC_DATA) Batch ${Math.floor(i / BATCH_SIZE) + 1} ════════════\x1b[0m`);
            console.log(`\x1b[35m║\x1b[0m \x1b[1mSQL:\x1b[0m \x1b[36m${compiled.sql}\x1b[0m`);
            console.log(`\x1b[35m║\x1b[0m \x1b[1mParams:\x1b[0m \x1b[33m${formatParams(compiled.params)}\x1b[0m`);
            console.log(`\x1b[35m╚═══════════════════════════════════════════════════════════════\x1b[0m\n`);

            const res = await dbBitintra.execute(query) as any;
            const rows = Array.isArray(res[0]) ? res[0] : res;
            for (let j = 0; j < rows.length; j++) {
              fgrecRows.push(rows[j]);
            }
          }
        }

        const existingLots = new Set(allRows.map(r => String(r.prod_lot).trim()));
        fgrecRows.forEach((r: any) => {
          const pLot = String(r.prod_lot).trim();
          if (existingLots.has(pLot)) return;
          allRows.push({
            wms_source: "FG Receive Store",
            prod_lot: r.prod_lot,
            store_lot: r.store_lot,
            qty: r.lot_size,
            do_no: "",
            plan_id: null,
            product_name: r.product_name,
            customer: r.customer,
            receive_date: r.receive_date ? String(r.receive_date) : "",
            lot_status: r.lot_status,
            item_no: r.item_no,
            cust_pn: r.cust_pn,
            mt_no: r.mt_no,
          });
        });
      }
    } else {
      if (queryShipment) {
        const fragments = buildWhereFragments('shipment', conditionsList);
        if (fragments.length > 0) {
          const whereClause = sql.join(fragments, sql` AND `);
          const query = sql`SELECT * FROM WMS.SHIPMENTPALLET_BOX_PROD WHERE ${whereClause} LIMIT ${limit}`;
          const compiled = dbBitintra.dialect.sqlToQuery(query);
          executedQueries.push({ sql: compiled.sql, params: compiled.params });

          console.log(`\n\x1b[35m╔════════════ WMS Search (SHIPMENTPALLET_BOX_PROD) ════════════\x1b[0m`);
          console.log(`\x1b[35m║\x1b[0m \x1b[1mSQL:\x1b[0m \x1b[36m${compiled.sql}\x1b[0m`);
          console.log(`\x1b[35m║\x1b[0m \x1b[1mParams:\x1b[0m \x1b[33m${formatParams(compiled.params)}\x1b[0m`);
          console.log(`\x1b[35m╚═══════════════════════════════════════════════════════════════\x1b[0m\n`);

          const res = await dbBitintra.execute(query) as any;
          const rows = Array.isArray(res[0]) ? res[0] : res;

          const prodLots = [...new Set(rows.map((r: any) => String(r.prod_lot).trim()).filter(Boolean))];
          let fgRecMap = new Map<string, any>();
          if (prodLots.length > 0) {
            for (let i = 0; i < prodLots.length; i += BATCH_SIZE) {
              const batch = prodLots.slice(i, i + BATCH_SIZE);
              const placeholders = batch.map(v => sql`${v}`);
              const joined = sql.join(placeholders, sql`, `);
              const fgQuery = sql`SELECT * FROM WMS.SG_FGREC_DATA WHERE prod_lot IN (${joined})`;
              const fgRes = await dbBitintra.execute(fgQuery) as any;
              const fgRows = Array.isArray(fgRes[0]) ? fgRes[0] : fgRes;
              fgRows.forEach((r: any) => {
                const key = String(r.prod_lot).trim();
                if (key) fgRecMap.set(key, r);
              });
            }
          }

          rows.forEach((r: any) => {
            const pLot = String(r.prod_lot).trim();
            const fgRec = fgRecMap.get(pLot) || {};
            allRows.push({
              wms_source: "DO Shipment",
              prod_lot: r.prod_lot,
              store_lot: r.store_lot,
              qty: r.qty,
              do_no: r.do_no,
              plan_id: r.plan_id,
              product_name: fgRec.product_name || "",
              customer: fgRec.customer || "",
              receive_date: r.receive_date ? String(r.receive_date) : (fgRec.receive_date ? String(fgRec.receive_date) : ""),
              lot_status: fgRec.lot_status || "",
              item_no: fgRec.item_no || "",
              cust_pn: fgRec.cust_pn || "",
              mt_no: fgRec.mt_no || "",
            });
          });
        }
      }

      if (queryFgrec) {
        const fragments = buildWhereFragments('fgrec', conditionsList);
        if (fragments.length > 0) {
          const whereClause = sql.join(fragments, sql` AND `);
          const query = sql`SELECT * FROM WMS.SG_FGREC_DATA WHERE ${whereClause} LIMIT ${limit}`;
          const compiled = dbBitintra.dialect.sqlToQuery(query);
          executedQueries.push({ sql: compiled.sql, params: compiled.params });

          console.log(`\n\x1b[35m╔════════════ WMS Search (SG_FGREC_DATA) ════════════\x1b[0m`);
          console.log(`\x1b[35m║\x1b[0m \x1b[1mSQL:\x1b[0m \x1b[36m${compiled.sql}\x1b[0m`);
          console.log(`\x1b[35m║\x1b[0m \x1b[1mParams:\x1b[0m \x1b[33m${formatParams(compiled.params)}\x1b[0m`);
          console.log(`\x1b[35m╚═══════════════════════════════════════════════════════════════\x1b[0m\n`);

          const res = await dbBitintra.execute(query) as any;
          const rows = Array.isArray(res[0]) ? res[0] : res;

          const existingLots = new Set(allRows.map(r => String(r.prod_lot).trim()));

          rows.forEach((r: any) => {
            const pLot = String(r.prod_lot).trim();
            if (existingLots.has(pLot)) return;
            allRows.push({
              wms_source: "FG Receive Store",
              prod_lot: r.prod_lot,
              store_lot: r.store_lot,
              qty: r.lot_size,
              do_no: "",
              plan_id: null,
              product_name: r.product_name,
              customer: r.customer,
              receive_date: r.receive_date ? String(r.receive_date) : "",
              lot_status: r.lot_status,
              item_no: r.item_no,
              cust_pn: r.cust_pn,
              mt_no: r.mt_no,
            });
          });
        }
      }
    }

    const mappedRows = allRows.map(row => mapRowToLabels(row, tableMeta));
    const limited = mappedRows.slice(0, limit);

    const isDynamicTable = !!tableMeta.connectionKey;
    const availablePivots = Object.entries(tableMeta.columns)
      .filter(([, col]) => col.searchable)
      .filter(([, col]) => !isDynamicTable || (col.linksTo && col.linksTo.length > 0))
      .map(([colKey, col]) => {
        const links = col.linksTo ? [...col.linksTo] : [];
        if (!isDynamicTable) {
          for (const [otherTableKey, otherTableMeta] of Object.entries(TABLE_REGISTRY)) {
            if (otherTableKey === table) continue;
            if (otherTableMeta.columns[colKey] && otherTableMeta.columns[colKey].searchable) {
              const alreadyLinked = links.some(l => l.targetTable === otherTableKey);
              if (!alreadyLinked) {
                links.push({ targetTable: otherTableKey, targetColumn: colKey, label: `→ ${otherTableMeta.label}` });
              }
            }
          }
        }
        links.unshift({ targetTable: table, targetColumn: colKey, label: `🔍 ดึงข้อมูลทั้งหมดในตารางนี้ (Self)` });
        return {
          fromColumnKey: colKey,
          fromColumnLabel: col.label,
          fromDbColumn: col.label,
          linksTo: links
        };
      });

    const descCol = conditionsList.map(c => tableMeta.columns[c.column]?.label ?? c.column).join(" + ");
    const descVal = conditionsList.map(c => {
      if (c.operator === "in") return `IN (${limited.length} values)`;
      if (c.operator === "between") return `${c.value} ~ ${c.value2}`;
      return c.value;
    }).join(" & ");
    const descOp = conditionsList.length > 1 ? "multi" : conditionsList[0].operator;

    return {
      table,
      tableLabel: tableMeta.label,
      column: conditionsList[0].column,
      columnLabel: descCol,
      value: descVal,
      operator: descOp,
      total: limited.length,
      rows: limited,
      availablePivots,
      debug: executedQueries.length > 0 ? executedQueries[0] : { sql: "", params: [] },
    };
  }



  async distinct(table: string, column: string, search?: string, limit: number = 200): Promise<{ tooManyDistinct: boolean; data: string[] }> {
    const tableMeta = getTableMeta(table);
    if (!tableMeta) throw new Error(`Table "${table}" not found in registry`);

    // Case-insensitive check supporting camelCase keys, physical dbColumn, and display labels
    const exactKey = Object.keys(tableMeta.columns).find(
      (k) => k.toLowerCase() === column.toLowerCase() ||
             tableMeta.columns[k].dbColumn.toLowerCase() === column.toLowerCase() ||
             tableMeta.columns[k].label.toLowerCase() === column.toLowerCase()
    );
    if (!exactKey) throw new Error(`Column "${column}" not found in table "${table}"`);

    const colMeta = tableMeta.columns[exactKey];
    const dbTable = tableMeta.tableName;
    const dbCol = colMeta.dbColumn;
    const queryDb = tableMeta.database === "ACA" ? dbACA : db;
    column = exactKey; // use the exact resolved key downstream

    let checkQuery;
    let checkRes;

    // Handle virtual WMS table
    if (table === "wms_lot_info") {
      const WMS_COL_MAP: Record<string, string> = {
        prod_lot: "prod_lot",
        store_lot: "store_lot",
        product_name: "product_name",
        customer: "customer",
        lot_status: "lot_status",
        item_no: "item_no",
        cust_pn: "cust_pn",
        mt_no: "mt_no",
      };
      const wmsCol = WMS_COL_MAP[column];
      if (!wmsCol) return { tooManyDistinct: false, data: [] };

      checkQuery = sql`SELECT DISTINCT ${sql.identifier(wmsCol)} AS val FROM WMS.SG_FGREC_DATA WHERE ${sql.identifier(wmsCol)} IS NOT NULL AND ${sql.identifier(wmsCol)} != '' LIMIT 1001`;
      checkRes = await dbBitintra.execute(checkQuery) as any;
    }
    // Handle virtual ACA Bonding tables
    else if (table === "ACA_BONDING_DATA" || table === "ACA_BONDING_DATA_2") {
      const bitTable = table === "ACA_BONDING_DATA" ? "BIT.ACA_BONDING_DATA" : "BIT.ACA_BONDING_DATA_2";
      checkQuery = sql`SELECT DISTINCT ${sql.identifier(dbCol)} AS val FROM ${sql.raw(bitTable)} WHERE customer = 'Seagate:ACA' AND ${sql.identifier(dbCol)} IS NOT NULL AND ${sql.identifier(dbCol)} != '' LIMIT 1001`;
      checkRes = await dbBitintra.execute(checkQuery) as any;
    }
    // Handle tl_info virtual join table
    else if (table === "tl_info") {
      const pcCols = new Set(["pc_detail", "pc_model", "pc_product_code"]);
      if (pcCols.has(dbCol)) {
        const pcCol = dbCol === "pc_detail" ? "detail" : dbCol === "pc_model" ? "model" : "product_code";
        checkQuery = sql`SELECT DISTINCT ${sql.identifier(pcCol)} AS val FROM pc WHERE ${sql.identifier(pcCol)} IS NOT NULL AND ${sql.identifier(pcCol)} != '' LIMIT 1001`;
      } else {
        checkQuery = sql`SELECT DISTINCT ${sql.identifier(dbCol)} AS val FROM tl WHERE ${sql.identifier(dbCol)} IS NOT NULL AND ${sql.identifier(dbCol)} != '' LIMIT 1001`;
      }
      checkRes = await db.execute(checkQuery) as any;
    }
    // General tables
    else {
      if (tableMeta.customSql && (tableMeta.customSql as any).customSql) {
        const rawPool = getRawPool(tableMeta.connectionKey || tableMeta.database || "seagate");
        let template = (tableMeta.customSql as any).customSql;
        let baseSql = template.replace(/\s+AND\s+`?\??col`?\s+IN\s*\(\s*\?\s*\)/gi, "");
        baseSql = baseSql.replace(/\s+AND\s+`?\??col`?\s+IN\s*\?\s*/gi, "");
        baseSql = baseSql.trim();
        if (baseSql.endsWith(";")) {
          baseSql = baseSql.slice(0, -1);
        }
        
        const colFieldName = dbCol.includes('.') ? dbCol.split('.').pop()! : dbCol;
        const distinctSql = `SELECT DISTINCT \`${colFieldName}\` AS val FROM (${baseSql}) AS distinct_subquery WHERE \`${colFieldName}\` IS NOT NULL AND \`${colFieldName}\` != '' LIMIT 1001`;
        
        console.log(`\n\x1b[35m╔════════════ [Custom SQL Distinct] ════════════\x1b[0m`);
        console.log(`\x1b[35m║\x1b[0m \x1b[1mSQL:\x1b[0m \x1b[36m${distinctSql}\x1b[0m`);
        console.log(`\x1b[35m╚═══════════════════════════════════════════════\x1b[0m\n`);
        
        const [rows] = await rawPool.execute(distinctSql) as any[];
        checkRes = rows;
      } else {
        checkQuery = sql`SELECT DISTINCT ${sql.identifier(dbCol)} AS val FROM ${sql.identifier(dbTable)} WHERE ${sql.identifier(dbCol)} IS NOT NULL AND ${sql.identifier(dbCol)} != '' LIMIT 1001`;
        checkRes = await queryDb.execute(checkQuery) as any;
      }
    }

    const checkRows = Array.isArray(checkRes[0]) ? checkRes[0] : checkRes;
    if (checkRows.length > 1000) {
      return { tooManyDistinct: true, data: [] };
    }

    const allVals = checkRows.map((r: any) => String(r.val ?? "")).filter(Boolean);
    if (!search) {
      return { tooManyDistinct: false, data: allVals.slice(0, limit) };
    } else {
      const searchLower = search.toLowerCase();
      const filtered = allVals.filter(v => v.toLowerCase().includes(searchLower));
      return { tooManyDistinct: false, data: filtered.slice(0, limit) };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: Raw Pool Search for Dynamic tables (Bitintra, SGCOIL, etc.)
  // Used when connectionKey is NOT seagate/ACA (no Drizzle schema available)
  // ═══════════════════════════════════════════════════════════════════════════
  private async _searchWithRawPool(
    params: SearchParams,
    tableMeta: TableMeta,
    connKey: string,
    conditionsList: SearchCondition[],
    limit: number,
  ): Promise<SearchResult> {
    const { table } = params;
    const rawPool = getRawPool(connKey as any);
    const dbTable = tableMeta.tableName; // e.g. "ACA_BONDING_DATA"

    // Build WHERE clause from conditionsList using plain SQL string (no Drizzle)
    let resultRows: Record<string, any>[] = [];
    const executedQueries: { sql: string; params: any[] }[] = [];
    const inCondition = conditionsList.find(c => c.operator === "in");

    if (inCondition) {
      const rawValues = inCondition.values && inCondition.values.length > 0
        ? inCondition.values
        : (inCondition.value ?? "").split(/[\n,]+/).map(v => v.trim()).filter(v => v.length > 0);
      const uniqueValues = [...new Set(rawValues)];

      if (uniqueValues.length === 0) throw new Error("ไม่มีค่าสำหรับ IN query");

      const colMetaIn = tableMeta.columns[inCondition.column];
      const dbColIn = colMetaIn.dbColumn.includes(".")
        ? colMetaIn.dbColumn.split(".").map(part => `\`${part.trim()}\``).join(".")
        : `\`${colMetaIn.dbColumn}\``;

      for (let i = 0; i < uniqueValues.length; i += BATCH_SIZE) {
        const batch = uniqueValues.slice(i, i + BATCH_SIZE);
        const whereParts: string[] = [];
        const sqlParams: any[] = [];

        // 1. Add IN clause for the main IN condition
        const placeholders = batch.map(() => "?").join(", ");
        whereParts.push(`${dbColIn} IN (${placeholders})`);
        sqlParams.push(...batch);

        // 2. Add other conditions
        for (const cond of conditionsList) {
          if (cond === inCondition) continue;
          const colMeta = tableMeta.columns[cond.column];
          if (!colMeta) continue;
          const dbCol = colMeta.dbColumn.includes(".")
            ? colMeta.dbColumn.split(".").map(part => `\`${part.trim()}\``).join(".")
            : `\`${colMeta.dbColumn}\``;

          if (cond.operator === "like" && cond.value) {
            whereParts.push(`${dbCol} LIKE ?`);
            sqlParams.push(`%${cond.value}%`);
          } else if (cond.operator === "eq" && cond.value) {
            whereParts.push(`${dbCol} = ?`);
            sqlParams.push(cond.value);
          } else if (cond.operator === "gte" && cond.value) {
            whereParts.push(`${dbCol} >= ?`);
            sqlParams.push(cond.value);
          } else if (cond.operator === "lte" && cond.value) {
            whereParts.push(`${dbCol} <= ?`);
            sqlParams.push(cond.value);
          } else if (cond.operator === "between" && cond.value && cond.value2) {
            whereParts.push(`${dbCol} BETWEEN ? AND ?`);
            sqlParams.push(cond.value, cond.value2);
          } else if (cond.operator === "in") {
            const otherRaw = cond.values && cond.values.length > 0
              ? cond.values
              : (cond.value ?? "").split(/[\n,]+/).map(v => v.trim()).filter(v => v.length > 0);
            const otherUnique = [...new Set(otherRaw)];
            if (otherUnique.length > 0) {
              const otherPlaceholders = otherUnique.map(() => "?").join(", ");
              whereParts.push(`${dbCol} IN (${otherPlaceholders})`);
              sqlParams.push(...otherUnique);
            }
          }
        }

        const whereClause = whereParts.join(" AND ");
        const rawSql = `SELECT * FROM \`${dbTable}\` WHERE ${whereClause} LIMIT ${limit}`;

        if (i === 0) {
          executedQueries.push({ sql: rawSql, params: sqlParams });
        }

        console.log(`\n\x1b[36m╔══════════ [SQL Debug - RawPool Search (${connKey}) Batch ${Math.floor(i / BATCH_SIZE) + 1}] ══════════\x1b[0m`);
        console.log(`\x1b[36m║\x1b[0m \x1b[1mDatabase:\x1b[0m ${connKey}`);
        console.log(`\x1b[36m║\x1b[0m \x1b[1mTable:\x1b[0m    ${dbTable}`);
        console.log(`\x1b[36m║\x1b[0m \x1b[1mSQL:\x1b[0m    \x1b[33m${rawSql}\x1b[0m`);
        console.log(`\x1b[36m║\x1b[0m \x1b[1mParams:\x1b[0m \x1b[33m${formatParams(sqlParams)}\x1b[0m`);
        console.log(`\x1b[36m╚══════════════════════════════════════════════════════════\x1b[0m\n`);

        const [rows] = await rawPool.execute(rawSql, sqlParams) as any[];
        const batchRows: Record<string, any>[] = Array.isArray(rows) ? rows : [rows];
        for (let j = 0; j < batchRows.length; j++) {
          resultRows.push(batchRows[j]);
        }
      }
    } else {
      const whereParts: string[] = [];
      const sqlParams: any[] = [];

      for (const cond of conditionsList) {
        const colMeta = tableMeta.columns[cond.column];
        if (!colMeta) continue;
        const dbCol = colMeta.dbColumn.includes(".")
          ? colMeta.dbColumn.split(".").map(part => `\`${part.trim()}\``).join(".")
          : `\`${colMeta.dbColumn}\``;

        if (cond.operator === "like" && cond.value) {
          whereParts.push(`${dbCol} LIKE ?`);
          sqlParams.push(`%${cond.value}%`);
        } else if (cond.operator === "eq" && cond.value) {
          whereParts.push(`${dbCol} = ?`);
          sqlParams.push(cond.value);
        } else if (cond.operator === "gte" && cond.value) {
          whereParts.push(`${dbCol} >= ?`);
          sqlParams.push(cond.value);
        } else if (cond.operator === "lte" && cond.value) {
          whereParts.push(`${dbCol} <= ?`);
          sqlParams.push(cond.value);
        } else if (cond.operator === "between" && cond.value && cond.value2) {
          whereParts.push(`${dbCol} BETWEEN ? AND ?`);
          sqlParams.push(cond.value, cond.value2);
        }
      }

      const whereClause = whereParts.length > 0 ? whereParts.join(" AND ") : "1=1";
      const rawSql = `SELECT * FROM \`${dbTable}\` WHERE ${whereClause} LIMIT ${limit}`;

      console.log(`\n\x1b[36m╔══════════ [SQL Debug - RawPool Search (${connKey})] ══════════\x1b[0m`);
      console.log(`\x1b[36m║\x1b[0m \x1b[1mDatabase:\x1b[0m ${connKey}`);
      console.log(`\x1b[36m║\x1b[0m \x1b[1mTable:\x1b[0m    ${dbTable}`);
      console.log(`\x1b[36m║\x1b[0m \x1b[1mSQL:\x1b[0m    \x1b[33m${rawSql}\x1b[0m`);
      console.log(`\x1b[36m║\x1b[0m \x1b[1mParams:\x1b[0m \x1b[33m${formatParams(sqlParams)}\x1b[0m`);
      console.log(`\x1b[36m╚══════════════════════════════════════════════════════════\x1b[0m\n`);

      executedQueries.push({ sql: rawSql, params: sqlParams });
      const [rows] = await rawPool.execute(rawSql, sqlParams) as any[];
      resultRows = Array.isArray(rows) ? rows : [rows];
    }

    const mappedRows = resultRows.map(r => mapRowToLabels(r, tableMeta));
    const limited = mappedRows.slice(0, limit);

    // Pivot suggestions (same logic as main path)
    const isDynamicTable = !!tableMeta.connectionKey;
    const availablePivots = Object.entries(tableMeta.columns)
      .filter(([, col]) => col.searchable)
      .filter(([, col]) => !isDynamicTable || (col.linksTo && col.linksTo.length > 0))
      .map(([colKey, col]) => {
        const links = col.linksTo ? [...col.linksTo] : [];
        if (!isDynamicTable) {
          for (const [otherTableKey, otherTableMeta] of Object.entries(TABLE_REGISTRY)) {
            if (otherTableKey === table) continue;
            if (otherTableMeta.columns[colKey]?.searchable) {
              if (!links.some(l => l.targetTable === otherTableKey)) {
                links.push({ targetTable: otherTableKey, targetColumn: colKey, label: `→ ${otherTableMeta.label}` });
              }
            }
          }
        }
        links.unshift({ targetTable: table, targetColumn: colKey, label: `🔍 ดึงข้อมูลทั้งหมดในตารางนี้ (Self)` });
        return { fromColumnKey: colKey, fromColumnLabel: col.label, fromDbColumn: col.dbColumn, linksTo: links };
      });

    const descCol = conditionsList.map(c => tableMeta.columns[c.column]?.label ?? c.column).join(" + ");
    const descVal = conditionsList.map(c => c.operator === "in" ? `IN (${resultRows.length} values)` : c.value).join(" & ");
    const descOp = conditionsList.length > 1 ? "multi" : conditionsList[0].operator;

    return {
      table,
      tableLabel: tableMeta.label,
      column: conditionsList[0].column,
      columnLabel: descCol,
      value: descVal,
      operator: descOp,
      total: limited.length,
      rows: limited,
      availablePivots,
      debug: executedQueries.length > 0 ? executedQueries[0] : { sql: "", params: [] },
    };
  }
}
