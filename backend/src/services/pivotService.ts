import { db, dbBitintra, getDb, getRawPool } from "../db/client";
import { sql } from "drizzle-orm";
import { getTableMeta, TABLE_REGISTRY, getDynamicRegistry, TableMeta, buildSelectClause, mapRowToLabels } from "../config/tableRegistry";

import { BATCH_SIZE } from "../config/appConfig";

function formatParams(params: any[]): string {
  if (!params) return "[]";
  if (params.length > 20) {
    return `[${params.length} items: ${JSON.stringify(params.slice(0, 5))}...]`;
  }
  return JSON.stringify(params);
}

export interface PivotParams {
  /** ค่าที่ดึงมาจาก Result Set ก่อนหน้า (เช่น hookup values จาก scan1_map) */
  sourceValues: string[];
  /** ชื่อ Table ปลายทางที่จะ Pivot ไป */
  targetTable: string;
  /** Connection/Server ที่ targetTable อยู่ (optional, ใช้เมื่อมีตารางชื่อซ้ำข้าม server) */
  targetServer?: string;
  /** Column บน targetTable ที่จะใช้ IN query (dbColumn name จริง) */
  targetColumn: string;
  limit?: number;
}

export interface PivotResult {
  targetTable: string;
  targetTableLabel: string;
  targetColumn: string;
  sourceCount: number;
  total: number;
  rows: Record<string, any>[];
  availablePivots: {
    fromColumnKey: string;
    fromColumnLabel: string;
    fromDbColumn: string;
    linksTo: { targetTable: string; targetColumn: string; label: string }[];
  }[];
  debug?: {
    queries: { sql: string; params: any[] }[];
  };
}

export class PivotService {
  async pivot(params: PivotParams): Promise<PivotResult> {
    const { sourceValues, targetTable, targetServer, targetColumn, limit = 1000000 } = params;

    // 1. Validate & Lookup table meta (with targetServer if provided)
    let tableMeta = getTableMeta(targetTable);

    // If targetServer is specified and table not found, try composite key lookup
    if (!tableMeta && targetServer) {
      const compositeKey = `${targetTable}_${targetServer}`;
      tableMeta = getTableMeta(compositeKey);
    }

    // If still not found and targetServer provided, search all tables for matching tableName + connectionKey
    if (!tableMeta && targetServer) {
      const allTables = { ...TABLE_REGISTRY, ...getDynamicRegistry() };
      const matchKey = Object.keys(allTables).find(k => {
        const meta = allTables[k];
        return meta.tableName === targetTable && (meta.connectionKey === targetServer || meta.database === targetServer);
      });
      if (matchKey) {
        tableMeta = allTables[matchKey];
      }
    }

    if (!tableMeta) {
      throw new Error(`Target table "${targetTable}"${targetServer ? ` on server "${targetServer}"` : ""} not found in registry`);
    }

    // ── Generic customSql dispatcher ────────────────────────────────────────
    // ถ้า table มี customSql config → delegate ไปยัง generic handler
    // ไม่ต้องเพิ่ม if-block ใหม่เมื่อเพิ่ม chain ใหม่อีกต่อไป!
    if (tableMeta.customSql) {
      // Special case: multiQuery sentinel (เช่น WMS ที่มี 2 sub-queries + enrichment)
      if (tableMeta.customSql.multiQuery && tableMeta.customSql.multiQueryType === "wms") {
        return this._pivotWmsMulti(params, tableMeta);
      }
      // Standard case: single buildQuery function
      return this._pivotWithCustomSql(params, tableMeta);
    }

    // ── Drizzle Generic Path (สำหรับ table ปกติ) ────────────────────────────
    const exactColumnKey = Object.keys(tableMeta.columns).find(
      (k) => k.toLowerCase() === targetColumn.toLowerCase()
        || tableMeta.columns[k].dbColumn.toLowerCase() === targetColumn.toLowerCase()
    );
    if (!exactColumnKey) {
      throw new Error(`Target column "${targetColumn}" not found in table "${targetTable}"`);
    }
    const colMeta = tableMeta.columns[exactColumnKey];
    const dbCol = colMeta.dbColumn;

    const uniqueValues = [...new Set(sourceValues.filter(v => v && v.trim()))];
    if (uniqueValues.length === 0) {
      return {
        targetTable,
        targetTableLabel: tableMeta.label,
        targetColumn,
        sourceCount: 0,
        total: 0,
        rows: [],
        availablePivots: [],
      };
    }

    // 2. Batch IN queries (ป้องกัน Connection Pool เต็มและ Query ยาวเกินไป)
    const dbTable = tableMeta.tableName;
    const connKey = tableMeta.connectionKey;

    // Dynamic tables with connectionKey != seagate/ACA cannot use Drizzle (no schema hardcoded)
    // Route them to raw pool path — works for ANY new connection added to CONNECTION_CONFIGS!
    if (connKey && connKey !== "seagate" && connKey !== "ACA") {
      return this._pivotWithRawPool(params, tableMeta, connKey, dbCol, uniqueValues, limit);
    }

    const queryDb = tableMeta.database === "ACA" ? getDb("ACA") : db;
    const allRows: Record<string, any>[] = [];
    const executedQueries: { sql: string; params: any[] }[] = [];

    const selectClause = buildSelectClause(tableMeta);
    for (let i = 0; i < uniqueValues.length; i += BATCH_SIZE) {
      const batch = uniqueValues.slice(i, i + BATCH_SIZE);
      const placeholderChunks = batch.map(v => sql`${v}`);
      const joinedPlaceholders = sql.join(placeholderChunks, sql`, `);

      const query = sql`SELECT ${sql.raw(selectClause)} FROM ${sql.identifier(dbTable)} WHERE ${sql.identifier(dbCol)} IN (${joinedPlaceholders})`;

      // Get compiled query for debugging
      const compiled = queryDb.dialect.sqlToQuery(query);
      const querySql = compiled.sql;
      const queryParams = compiled.params;

      // Print SQL Debug to Console (with professional coloring)
      console.log(`\n\x1b[34m╔════════════════════════ [SQL Debug - Pivot Batch ${Math.floor(i / BATCH_SIZE) + 1}] ════════════════════════\x1b[0m`);
      console.log(`\x1b[34m║\x1b[0m \x1b[1mDatabase:\x1b[0m   ${tableMeta.database || "seagate"}`);
      console.log(`\x1b[34m║\x1b[0m \x1b[1mTable:\x1b[0m      ${dbTable}`);
      console.log(`\x1b[34m║\x1b[0m \x1b[1mColumn:\x1b[0m     ${targetColumn}`);
      console.log(`\x1b[34m║\x1b[0m \x1b[1mSQL:\x1b[0m        \x1b[36m${querySql}\x1b[0m`);
      console.log(`\x1b[34m║\x1b[0m \x1b[1mParams:\x1b[0m     \x1b[33m${formatParams(queryParams)}\x1b[0m`);
      console.log(`\x1b[34m╚═══════════════════════════════════════════════════════════════════════════════════\x1b[0m\n`);

      executedQueries.push({ sql: querySql, params: queryParams });

      const result = await queryDb.execute(query) as any;

      const batchRows = Array.isArray(result[0]) ? result[0] : result;
      const mappedRows = batchRows.map(row => mapRowToLabels(row, tableMeta));
      for (let j = 0; j < mappedRows.length; j++) {
        allRows.push(mappedRows[j]);
      }
    }

    const limited = allRows.slice(0, limit);

    // 3. สร้าง Pivot Suggestions สำหรับ Table ปลายทาง
    const availablePivots = this._buildAvailablePivots(tableMeta, targetTable);

    return {
      targetTable,
      targetTableLabel: tableMeta.label,
      targetColumn,
      sourceCount: uniqueValues.length,
      total: allRows.length,
      rows: limited,
      availablePivots,
      debug: {
        queries: executedQueries,
      },
    };
  }

  /**
   * Helper: ดึงค่าจาก rows ตาม column ที่ระบุ (เพื่อเตรียม sourceValues สำหรับ Pivot ถัดไป)
   */
  extractValues(rows: Record<string, any>[], columnName: string): string[] {
    return [...new Set(
      rows
        .map(r => r[columnName])
        .filter(v => v != null && v !== "")
        .map(v => String(v).trim())
    )];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: Generic customSql Handler
  // รองรับ table ใหม่ที่มี customSql.buildQuery โดยไม่ต้องเพิ่ม method ใหม่
  // ═══════════════════════════════════════════════════════════════════════════
  private async _pivotWithCustomSql(params: PivotParams, tableMeta: TableMeta): Promise<PivotResult> {
    const { sourceValues, targetTable, targetColumn, limit = 1000000 } = params;
    const customSql = tableMeta.customSql!;
    const connKey = customSql.connectionKey;
    const queryDb = getDb(connKey);

    // Resolve dbColumn key
    const exactColumnKey = Object.keys(tableMeta.columns).find(
      (k) => k.toLowerCase() === targetColumn.toLowerCase()
        || tableMeta.columns[k].dbColumn.toLowerCase() === targetColumn.toLowerCase()
    );
    if (!exactColumnKey) {
      throw new Error(`Target column "${targetColumn}" not found in table "${targetTable}"`);
    }
    const dbCol = tableMeta.columns[exactColumnKey].dbColumn;

    const uniqueValues = [...new Set(sourceValues.filter(v => v && v.trim()))];
    if (uniqueValues.length === 0) {
      return {
        targetTable,
        targetTableLabel: tableMeta.label,
        targetColumn,
        sourceCount: 0,
        total: 0,
        rows: [],
        availablePivots: [],
      };
    }

    const allRows: Record<string, any>[] = [];
    const executedQueries: { sql: string; params: any[] }[] = [];
    const buildQuery = customSql.buildQuery!;

    for (let i = 0; i < uniqueValues.length; i += BATCH_SIZE) {
      const batch = uniqueValues.slice(i, i + BATCH_SIZE);
      const { sql: querySql, params: queryParams } = buildQuery(batch, dbCol);

      executedQueries.push({ sql: querySql, params: queryParams });

      console.log(`\n\x1b[35m╔════════════ [customSql Pivot - ${targetTable} Batch ${Math.floor(i / BATCH_SIZE) + 1}] ════════════\x1b[0m`);
      console.log(`\x1b[35m║\x1b[0m \x1b[1mDatabase:\x1b[0m   ${connKey}`);
      console.log(`\x1b[35m║\x1b[0m \x1b[1mTable:\x1b[0m      ${tableMeta.tableName}`);
      console.log(`\x1b[35m║\x1b[0m \x1b[1mSQL:\x1b[0m        \x1b[36m${querySql}\x1b[0m`);
      console.log(`\x1b[35m║\x1b[0m \x1b[1mParams:\x1b[0m     \x1b[33m${formatParams(queryParams)}\x1b[0m`);
      console.log(`\x1b[35m╚═══════════════════════════════════════════════════════════════\x1b[0m\n`);

      // ใช้ raw pool execute เพื่อ execute raw SQL string + params array ได้ถูกต้อง
      // (Drizzle .execute() รองรับเฉพาะ Drizzle SQL template object ไม่ใช่ raw string)
      const rawPool = getRawPool(connKey);
      const res = await rawPool.execute(querySql, queryParams) as any;
      const batchRows = Array.isArray(res[0]) ? res[0] : res;

      // Apply mapRow transformer ถ้ามี
      const transformed = customSql.mapRow ? batchRows.map(customSql.mapRow) : batchRows;
      const mappedRows = transformed.map(row => mapRowToLabels(row, tableMeta));
      for (let j = 0; j < mappedRows.length; j++) {
        allRows.push(mappedRows[j]);
      }
    }

    const limited = allRows.slice(0, limit);
    const availablePivots = this._buildAvailablePivots(tableMeta, targetTable);

    return {
      targetTable,
      targetTableLabel: tableMeta.label,
      targetColumn,
      sourceCount: uniqueValues.length,
      total: limited.length,
      rows: limited,
      availablePivots,
      debug: { queries: executedQueries },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: WMS Multi-Query Handler (Sentinel Pattern)
  // Logic เดิมจาก pivotWmsLotInfo — รวมไว้ที่นี่ที่เดียว ไม่ต้องแยก method
  // ═══════════════════════════════════════════════════════════════════════════
  private async _pivotWmsMulti(params: PivotParams, tableMeta: TableMeta): Promise<PivotResult> {
    const { sourceValues, targetTable, targetColumn, limit = 1000000 } = params;

    const uniqueValues = [...new Set(sourceValues.filter(v => v && v.trim()))];
    if (uniqueValues.length === 0) {
      return {
        targetTable,
        targetTableLabel: tableMeta.label,
        targetColumn,
        sourceCount: 0,
        total: 0,
        rows: [],
        availablePivots: [],
      };
    }

    const allRows: Record<string, any>[] = [];
    const executedQueries: { sql: string; params: any[] }[] = [];

    for (let i = 0; i < uniqueValues.length; i += BATCH_SIZE) {
      const batch = uniqueValues.slice(i, i + BATCH_SIZE);
      const placeholders = batch.map(v => sql`${v}`);
      const joinedPlaceholders = sql.join(placeholders, sql`, `);

      // 1. Query WMS.SHIPMENTPALLET_BOX_PROD (DO Shipment)
      const query1 = sql`SELECT * FROM WMS.SHIPMENTPALLET_BOX_PROD WHERE prod_lot IN (${joinedPlaceholders})`;
      const compiled1 = dbBitintra.dialect.sqlToQuery(query1);
      executedQueries.push({ sql: compiled1.sql, params: compiled1.params });

      // Print Debug SQL
      console.log(`\n\x1b[35m╔════════════ WMS Query 1 (SHIPMENTPALLET_BOX_PROD) ════════════\x1b[0m`);
      console.log(`\x1b[35m║\x1b[0m \x1b[1mSQL:\x1b[0m \x1b[36m${compiled1.sql}\x1b[0m`);
      console.log(`\x1b[35m║\x1b[0m \x1b[1mParams:\x1b[0m \x1b[33m${formatParams(compiled1.params)}\x1b[0m`);
      console.log(`\x1b[35m╚═══════════════════════════════════════════════════════════════\x1b[0m\n`);

      const res1 = await dbBitintra.execute(query1) as any;
      const rows1 = Array.isArray(res1[0]) ? res1[0] : res1;

      // 1.1 Enrich DO Shipment rows by fetching SG_FGREC_DATA for the same batch of prod_lot values
      const queryFGRec = sql`SELECT * FROM WMS.SG_FGREC_DATA WHERE prod_lot IN (${joinedPlaceholders})`;
      const compiledFGRec = dbBitintra.dialect.sqlToQuery(queryFGRec);
      executedQueries.push({ sql: compiledFGRec.sql, params: compiledFGRec.params });

      console.log(`\n\x1b[35m╔════════════ WMS Enrichment Query (SG_FGREC_DATA) ════════════\x1b[0m`);
      console.log(`\x1b[35m║\x1b[0m \x1b[1mSQL:\x1b[0m \x1b[36m${compiledFGRec.sql}\x1b[0m`);
      console.log(`\x1b[35m║\x1b[0m \x1b[1mParams:\x1b[0m \x1b[33m${formatParams(compiledFGRec.params)}\x1b[0m`);
      console.log(`\x1b[35m╚═══════════════════════════════════════════════════════════════\x1b[0m\n`);

      const resFGRec = await dbBitintra.execute(queryFGRec) as any;
      const rowsFGRec = Array.isArray(resFGRec[0]) ? resFGRec[0] : resFGRec;

      const fgRecCompoundMap = new Map<string, any>();
      const fgRecProdLotMap = new Map<string, any>();

      rowsFGRec.forEach((r: any) => {
        const pLot = String(r.prod_lot).trim();
        const sLot = String(r.store_lot).trim();
        if (pLot && sLot) {
          fgRecCompoundMap.set(`${sLot}_${pLot}`, r);
        }
        if (pLot) {
          fgRecProdLotMap.set(pLot, r);
        }
      });

      const matchedLots = new Set<string>();
      rows1.forEach((r: any) => {
        const pLot = String(r.prod_lot).trim();
        const sLot = String(r.store_lot).trim();
        matchedLots.add(pLot);

        // Get enrichment record using compound key first, then fallback to prod_lot key
        const fgRec = fgRecCompoundMap.get(`${sLot}_${pLot}`) || fgRecProdLotMap.get(pLot) || {};

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

      // 2. Identify missing lots for fallback
      const missingLots = batch.filter(lot => !matchedLots.has(lot.trim()));
      if (missingLots.length > 0) {
        const placeholders2 = missingLots.map(v => sql`${v}`);
        const joinedPlaceholders2 = sql.join(placeholders2, sql`, `);

        const query2 = sql`SELECT * FROM WMS.SG_FGREC_DATA WHERE prod_lot IN (${joinedPlaceholders2})`;
        const compiled2 = dbBitintra.dialect.sqlToQuery(query2);
        executedQueries.push({ sql: compiled2.sql, params: compiled2.params });

        console.log(`\n\x1b[35m╔════════════ WMS Query 2 Fallback (SG_FGREC_DATA) ════════════\x1b[0m`);
        console.log(`\x1b[35m║\x1b[0m \x1b[1mMissing Lots Count:\x1b[0m ${missingLots.length}`);
        console.log(`\x1b[35m║\x1b[0m \x1b[1mSQL:\x1b[0m \x1b[36m${compiled2.sql}\x1b[0m`);
        console.log(`\x1b[35m║\x1b[0m \x1b[1mParams:\x1b[0m \x1b[33m${formatParams(compiled2.params)}\x1b[0m`);
        console.log(`\x1b[35m╚══════════════════════════════════════════════════════════════\x1b[0m\n`);

        const res2 = await dbBitintra.execute(query2) as any;
        const rows2 = Array.isArray(res2[0]) ? res2[0] : res2;

        rows2.forEach((r: any) => {
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

    const mappedRows = allRows.map(row => mapRowToLabels(row, tableMeta));
    const limited = mappedRows.slice(0, limit);
    const availablePivots = this._buildAvailablePivots(tableMeta, targetTable);

    return {
      targetTable,
      targetTableLabel: tableMeta.label,
      targetColumn,
      sourceCount: uniqueValues.length,
      total: limited.length,
      rows: limited,
      availablePivots,
      debug: { queries: executedQueries },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: Shared availablePivots Builder
  // เดิม copy-paste ~15 บรรทัดซ้ำใน 4 methods → รวมไว้ที่เดียว
  // ═══════════════════════════════════════════════════════════════════════════
  private _buildAvailablePivots(tableMeta: TableMeta, targetTable: string) {
    const isDynamicTable = !!tableMeta.connectionKey;
    return Object.entries(tableMeta.columns)
      .filter(([, col]) => col.searchable)
      .filter(([, col]) => !isDynamicTable || (col.linksTo && col.linksTo.length > 0))
      .map(([colKey, col]) => {
        const links = col.linksTo ? [...col.linksTo] : [];

        if (!isDynamicTable) {
          // Auto-link to ALL other tables that share the exact same column key
          for (const [otherTableKey, otherTableMeta] of Object.entries(TABLE_REGISTRY)) {
            if (otherTableKey === targetTable) continue;
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

        // Add Self Link at the top
        links.unshift({ targetTable, targetColumn: colKey, label: `🔍 ดึงข้อมูลทั้งหมดในตารางนี้ (Self)` });

        return {
          fromColumnKey: colKey,
          fromColumnLabel: col.label,
          fromDbColumn: col.label,
          linksTo: links,
        };
      });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: Raw Pool Pivot for Dynamic tables (Bitintra/SGCOIL/dbBIT/any new server)
  // Works for ANY connectionKey in CONNECTION_CONFIGS — zero code changes needed per new server!
  // ═══════════════════════════════════════════════════════════════════════════
  private async _pivotWithRawPool(
    params: PivotParams,
    tableMeta: TableMeta,
    connKey: string,
    dbCol: string,
    uniqueValues: string[],
    limit: number,
  ): Promise<PivotResult> {
    const { targetTable, targetColumn } = params;
    const rawPool = getRawPool(connKey as any);
    const dbTable = tableMeta.tableName;
    const allRows: Record<string, any>[] = [];
    const executedQueries: { sql: string; params: any[] }[] = [];

    // Batch IN queries (1000 per batch, MySQL 5 safe)
    for (let i = 0; i < uniqueValues.length; i += BATCH_SIZE) {
      const batch = uniqueValues.slice(i, i + BATCH_SIZE);
      const placeholders = batch.map(() => "?").join(", ");
      const escapedCol = dbCol.includes(".")
        ? dbCol.split(".").map(part => `\`${part.trim()}\``).join(".")
        : `\`${dbCol}\``;
      const rawSql = `SELECT * FROM \`${dbTable}\` WHERE ${escapedCol} IN (${placeholders})`;

      console.log(`\n\x1b[36m╔══════════ [SQL Debug - RawPool Pivot (${connKey}) Batch ${Math.floor(i / BATCH_SIZE) + 1}] ══════════\x1b[0m`);
      console.log(`\x1b[36m║\x1b[0m \x1b[1mDatabase:\x1b[0m ${connKey}`);
      console.log(`\x1b[36m║\x1b[0m \x1b[1mTable:\x1b[0m    ${dbTable}`);
      console.log(`\x1b[36m║\x1b[0m \x1b[1mSQL:\x1b[0m    \x1b[33m${rawSql}\x1b[0m`);
      console.log(`\x1b[36m║\x1b[0m \x1b[1mParams:\x1b[0m \x1b[33m${formatParams(batch)}\x1b[0m`);
      console.log(`\x1b[36m╚══════════════════════════════════════════════════════════\x1b[0m\n`);

      executedQueries.push({ sql: rawSql, params: batch });
      const [rows] = await rawPool.execute(rawSql, batch) as any[];
      const batchRows: Record<string, any>[] = Array.isArray(rows) ? rows : [rows];
      const mappedRows = batchRows.map(row => mapRowToLabels(row, tableMeta));
      for (let j = 0; j < mappedRows.length; j++) {
        allRows.push(mappedRows[j]);
      }
    }

    const limited = allRows.slice(0, limit);
    const availablePivots = this._buildAvailablePivots(tableMeta, targetTable);

    return {
      targetTable,
      targetTableLabel: tableMeta.label,
      targetColumn,
      sourceCount: uniqueValues.length,
      total: allRows.length,
      rows: limited,
      availablePivots,
      debug: { queries: executedQueries },
    };
  }
}
