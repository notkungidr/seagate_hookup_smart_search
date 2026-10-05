import { dbSeagateDev, getRawPool, resolveConnConfig, isOracleConn } from "../db/client";
import { registryTables, registryUsers } from "../db/schema";
import { eq, sql, inArray } from "drizzle-orm";
import { TABLE_REGISTRY, TableMeta, ColumnMeta, CustomSqlConfig, setDynamicRegistry, quoteTableRef, limitSql } from "../config/tableRegistry";

export interface DynamicTableRow {
  id: string;
  tableName: string;
  /** ชื่อตารางฟิสิคัลใน MySQL (รองรับ DB.TABLE สำหรับ connection ที่ไม่มี Default Database) — ไม่ระบุ = ใช้ tableName */
  dbTable?: string | null;
  label: string;
  connectionKey: string;
  customSql: CustomSqlConfig | null;
  columns: Record<string, ColumnMeta>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export class RegistryService {
  /**
   * Run a DDL statement to verify or create the table on startup.
   */
  async ensureTableExists(): Promise<void> {
    try {
      await dbSeagateDev.execute(sql`
        CREATE TABLE IF NOT EXISTS registry_tables (
          id VARCHAR(64) PRIMARY KEY,
          table_name VARCHAR(100) NOT NULL,
          db_table VARCHAR(200) NULL,
          label VARCHAR(200) NOT NULL,
          connection_key VARCHAR(50) NOT NULL DEFAULT 'seagate',
          custom_sql TEXT NULL,
          columns LONGTEXT NOT NULL,
          is_active TINYINT NOT NULL DEFAULT 1,
          created_at VARCHAR(50) NOT NULL,
          updated_at VARCHAR(50) NOT NULL,
          UNIQUE KEY unique_table_connection (table_name, connection_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8
      `);
      console.log("✅ MySQL database (SeagateDev): checked/created 'registry_tables' table.");

      // Migration: เพิ่มคอลัมน์ db_table (ชื่อฟิสิคัลรองรับ DB.TABLE) สำหรับเครื่องที่สร้างตารางไว้ก่อนแล้ว
      try {
        await dbSeagateDev.execute(sql.raw(`ALTER TABLE registry_tables ADD COLUMN db_table VARCHAR(200) NULL`));
        console.log("🔧 Added 'db_table' column to registry_tables (physical DB.TABLE support).");
      } catch (alterErr: any) {
        // ข้ามถ้าคอลัมน์มีอยู่แล้ว (MySQL error 1060: Duplicate column name)
        if (!/duplicate column|1060/i.test(alterErr?.message || "")) {
          console.warn("⚠️ Could not add 'db_table' column:", alterErr?.message || alterErr);
        }
      }

      // Migration: Drop old UNIQUE constraint on table_name if it exists
      try {
        await dbSeagateDev.execute(sql.raw(`ALTER TABLE registry_tables DROP INDEX table_name`));
        console.log("🔧 Dropped legacy UNIQUE constraint on 'table_name' (migrated to composite key).");
      } catch (dropErr: any) {
        // Ignore if index doesn't exist (MySQL error 1091: "Can't DROP 'table_name'; check that column/key exists")
        if (!/can't drop|doesn't exist/i.test(dropErr?.message || "")) {
          console.warn("⚠️ Could not drop legacy UNIQUE index 'table_name':", dropErr?.message || dropErr);
        }
      }

      // Seed 'wms_lot_info' dynamic table if missing
      const wmsCheck = await dbSeagateDev
        .select()
        .from(registryTables)
        .where(eq(registryTables.id, "wms_lot_info"))
        .limit(1);
      if (wmsCheck.length === 0) {
        const isoString = new Date().toISOString();
        await dbSeagateDev.insert(registryTables).values({
          id: "wms_lot_info",
          tableName: "wms_lot_info",
          label: "📦 WMS Lot Info (Shipment / FGRec)",
          connectionKey: "Bitintra",
          customSql: JSON.stringify({
            connectionKey: "Bitintra",
            multiQuery: true,
            multiQueryType: "wms"
          }),
          columns: JSON.stringify({
            prod_lot: { dbColumn: "prod_lot", label: "Prod Lot", searchable: true, linksTo: [{ targetTable: "scan21", targetColumn: "lot", label: "🔙 → Scan 2.1 (ย้อนกลับเข้า Line)" }] },
            wms_source: { dbColumn: "wms_source", label: "WMS Source", searchable: true },
            store_lot: { dbColumn: "store_lot", label: "Store Lot", searchable: true },
            qty: { dbColumn: "qty", label: "Qty / Size", searchable: true },
            do_no: { dbColumn: "do_no", label: "DO No", searchable: true },
            plan_id: { dbColumn: "plan_id", label: "Plan ID", searchable: true },
            product_name: { dbColumn: "product_name", label: "Product Name", searchable: true },
            customer: { dbColumn: "customer", label: "Customer", searchable: true },
            receive_date: { dbColumn: "receive_date", label: "Receive Date", searchable: true },
            lot_status: { dbColumn: "lot_status", label: "Lot Status", searchable: true },
            item_no: { dbColumn: "item_no", label: "Item No", searchable: true },
            cust_pn: { dbColumn: "cust_pn", label: "Customer P/N", searchable: true },
            mt_no: { dbColumn: "mt_no", label: "Material No", searchable: true }
          }),
          isActive: 1,
          createdAt: isoString,
          updatedAt: isoString
        } as any);
        console.log("🌱 Auto-seeded missing 'wms_lot_info' registry table.");
      }
    } catch (err) {
      console.error("❌ Failed to verify/create 'registry_tables' table on SeagateDev:", err);
    }
  }

  /**
   * Validate user inputs for table schema.
   */
  private validateInput(input: any, isUpdate = false, existingId?: string, allowShadow = false): void {
    // รองรับทั้ง "TABLE" และ "DB.TABLE" (connection ที่ไม่มี Default Database)
    const tableReg = /^[A-Za-z0-9_]{1,100}(\.[A-Za-z0-9_]{1,100})?$/;

    // 1. tableName validation
    if (input.tableName !== undefined) {
      if (!tableReg.test(input.tableName)) {
        throw new Error("ชื่อตารางต้องเป็น A-Z, a-z, 0-9, _ (หรือรูปแบบ DB.TABLE) ยาวแต่ละส่วนไม่เกิน 100 ตัวอักษร");
      }

      // Check collision with static registry (only if allowShadow is false)
      if (!allowShadow && TABLE_REGISTRY[input.tableName]) {
        throw new Error(`ชื่อตาราง "${input.tableName}" ชนกับ Static Registry หลักของระบบ ซึ่งเป็นตาราง Read-only`);
      }
    }

    // 1.5 dbTable (ชื่อฟิสิคัล) — optional, รองรับ DB.TABLE
    if (input.dbTable !== undefined && input.dbTable !== null && input.dbTable !== "") {
      if (!tableReg.test(input.dbTable)) {
        throw new Error("Physical DB Table Name ต้องเป็น A-Z, a-z, 0-9, _ หรือรูปแบบ DB.TABLE เท่านั้น");
      }
    }

    // 2. connectionKey validation (static + dynamic จาก registry_connections)
    if (input.connectionKey !== undefined) {
      if (!resolveConnConfig(input.connectionKey)) {
        throw new Error(`ไม่พบ Connection Key "${input.connectionKey}" ในระบบ (เพิ่มได้ที่แท็บ Connections)`);
      }
    }

    const colReg = /^[A-Za-z0-9_\.`]{1,150}$/;

    // 3. columns validation
    if (input.columns !== undefined) {
      if (typeof input.columns !== "object" || Object.keys(input.columns).length === 0) {
        throw new Error("กรุณาระบุอย่างน้อย 1 คอลัมน์สำหรับตารางนี้");
      }
      for (const [colKey, col] of Object.entries(input.columns) as [string, any]) {
        if (!colReg.test(col.dbColumn)) {
          throw new Error(`ชื่อฟิลด์จริง "${col.dbColumn}" ในฐานข้อมูลไม่ถูกต้อง`);
        }
        if (!col.label || col.label.trim().length === 0 || col.label.length > 200) {
          throw new Error(`ชื่อแสดงผลคอลัมน์ "${colKey}" ต้องอยู่ระหว่าง 1 ถึง 200 ตัวอักษร`);
        }
      }
    }

    // 4. customSql validation
    if (input.customSql !== undefined && input.customSql !== null) {
      if (input.customSql.multiQueryType !== undefined && input.customSql.multiQueryType !== null) {
        const allowedSentinels = ["wms"];
        if (!allowedSentinels.includes(input.customSql.multiQueryType)) {
          throw new Error(`ไม่รองรับ multiQueryType "${input.customSql.multiQueryType}" (รองรับเฉพาะ 'wms')`);
        }
      }
    }
  }

  /**
   * Fetch all dynamic registry tables from DB.
   */
  async getAll(): Promise<DynamicTableRow[]> {
    const rows = await dbSeagateDev.select().from(registryTables);
    return rows.map(r => ({
      id: r.id,
      tableName: r.tableName,
      dbTable: r.dbTable ?? null,
      label: r.label,
      connectionKey: r.connectionKey,
      customSql: r.customSql ? JSON.parse(r.customSql) : null,
      columns: JSON.parse(r.columns),
      isActive: r.isActive === 1,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  /**
   * Fetch a single dynamic registry table by ID.
   */
  async getById(id: string): Promise<DynamicTableRow | null> {
    const rows = await dbSeagateDev
      .select()
      .from(registryTables)
      .where(eq(registryTables.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      tableName: r.tableName,
      dbTable: r.dbTable ?? null,
      label: r.label,
      connectionKey: r.connectionKey,
      customSql: r.customSql ? JSON.parse(r.customSql) : null,
      columns: JSON.parse(r.columns),
      isActive: r.isActive === 1,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async create(input: Omit<DynamicTableRow, "id" | "createdAt" | "updatedAt">, allowShadow = false): Promise<DynamicTableRow> {
    this.validateInput(input, false, undefined, allowShadow);

    // Check unique constraint on (table_name + connection_key) combination
    const pool = getRawPool("SeagateDev");
    const [existingRows] = await pool.execute(
      "SELECT id FROM registry_tables WHERE table_name = ? AND connection_key = ? LIMIT 1",
      [input.tableName, input.connectionKey]
    ) as [Array<{ id: string }>, any];

    if (existingRows.length > 0) {
      throw new Error(`ชื่อตาราง "${input.tableName}" บน Server "${input.connectionKey}" ถูกลงทะเบียนในระบบเรียบร้อยแล้ว`);
    }

    const id = `table_${Date.now()}`;
    const isoString = new Date().toISOString();

    const record = {
      id,
      tableName: input.tableName,
      dbTable: input.dbTable || null,
      label: input.label,
      connectionKey: input.connectionKey,
      customSql: input.customSql ? JSON.stringify(input.customSql) : null,
      columns: JSON.stringify(input.columns),
      isActive: input.isActive ? 1 : 0,
      createdAt: isoString,
      updatedAt: isoString,
    };

    await dbSeagateDev.insert(registryTables).values(record as any);
    await this.reloadDynamicRegistry();

    return {
      ...input,
      id,
      createdAt: isoString,
      updatedAt: isoString,
    };
  }

  async update(id: string, input: Partial<DynamicTableRow>, allowShadow = false): Promise<DynamicTableRow> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`ไม่พบตารางรหัส "${id}" ในฐานข้อมูล`);
    }

    this.validateInput(input, true, id, allowShadow);

    // If tableName or connectionKey changes, check unique constraint on (tableName + connectionKey)
    const newTableName = input.tableName ?? existing.tableName;
    const newConnectionKey = input.connectionKey ?? existing.connectionKey;

    if ((input.tableName && input.tableName !== existing.tableName) ||
        (input.connectionKey && input.connectionKey !== existing.connectionKey)) {
      const pool = getRawPool("SeagateDev");
      const [collides] = await pool.execute(
        "SELECT id FROM registry_tables WHERE table_name = ? AND connection_key = ? AND id != ? LIMIT 1",
        [newTableName, newConnectionKey, id]
      ) as [Array<{ id: string }>, any];

      if (collides.length > 0) {
        throw new Error(`ชื่อตาราง "${newTableName}" บน Server "${newConnectionKey}" ถูกใช้งานโดยตารางอื่นเรียบร้อยแล้ว`);
      }
    }

    const isoString = new Date().toISOString();
    const patch: any = {
      updatedAt: isoString,
    };
    if (input.tableName !== undefined) patch.tableName = input.tableName;
    if (input.dbTable !== undefined) patch.dbTable = input.dbTable || null;
    if (input.label !== undefined) patch.label = input.label;
    if (input.connectionKey !== undefined) patch.connectionKey = input.connectionKey;
    if (input.customSql !== undefined) patch.customSql = input.customSql ? JSON.stringify(input.customSql) : null;
    if (input.columns !== undefined) patch.columns = JSON.stringify(input.columns);
    if (input.isActive !== undefined) patch.isActive = input.isActive ? 1 : 0;

    await dbSeagateDev.update(registryTables).set(patch).where(eq(registryTables.id, id));
    await this.reloadDynamicRegistry();

    return {
      ...existing,
      ...input,
      updatedAt: isoString,
    } as DynamicTableRow;
  }

  /**
   * Delete a dynamic table registry.
   */
  async delete(id: string): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`ไม่พบตารางรหัส "${id}" สำหรับทำการลบ`);
    }

    await dbSeagateDev.delete(registryTables).where(eq(registryTables.id, id));
    await this.reloadDynamicRegistry();
  }

  /**
   * Materialise DB rows into Record<string, TableMeta>
   */
  async loadAsTableMeta(): Promise<Record<string, TableMeta>> {
    const all = await this.getAll();
    const map: Record<string, TableMeta> = {};
    for (const r of all) {
      if (!r.isActive) continue;
      // A qualified physical name (e.g. ACA.PACK_DATA_SERIAL) is authoritative
      // for the database route. Some legacy registry rows were saved with a
      // host-like dynamic connection id (sghudb02thbeltoncorp), which can send
      // an ACA table to the wrong server. Prefer the matching static database
      // connection when the DB prefix is known.
      const dbPrefix = (r.dbTable || "").split(".")[0]?.trim();
      const effectiveConnectionKey = dbPrefix === "ACA" || dbPrefix === "seagate"
        ? dbPrefix
        : r.connectionKey;
      const meta: TableMeta = {
        tableName: r.tableName,
        dbTable: r.dbTable || r.tableName, // ชื่อฟิสิคัลที่ใช้สร้าง SQL (DB.TABLE ได้)
        database: (effectiveConnectionKey === "ACA" || effectiveConnectionKey === "seagate") ? (effectiveConnectionKey as "ACA" | "seagate") : undefined,
        label: r.label,
        drizzleTable: null, // Always null for dynamic tables
        connectionKey: effectiveConnectionKey, // route qualified ACA/seagate tables through static pools
        columns: r.columns,
        customSql: r.customSql ? {
          connectionKey: r.customSql.connectionKey,
          multiQuery: r.customSql.multiQuery ?? false,
          multiQueryType: r.customSql.multiQueryType ?? null,
          customSql: (r.customSql as any).customSql, // preserve raw string for searchService
          buildQuery: (values: string[], dbCol: string) => {
            const customTemplate = (r.customSql as any).customSql;
            const escapedDbCol = dbCol.includes(".")
              ? dbCol.split(".").map(p => `\`${p.trim()}\``).join(".")
              : `\`${dbCol}\``;

            if (customTemplate) {
              let sqlStr = customTemplate;
              // replace column placeholders (like ?col, `?col`, or :col)
              sqlStr = sqlStr.replace(/`\??col`/gi, escapedDbCol);
              sqlStr = sqlStr.replace(/\??col\b/gi, escapedDbCol);
              
              // expand IN (?) placeholder
              const placeholders = values.map(() => "?").join(",");
              if (sqlStr.includes("(?)")) {
                sqlStr = sqlStr.replace(/\(\?\)/g, `(${placeholders})`);
              } else if (sqlStr.includes("?")) {
                sqlStr = sqlStr.replace(/\?/g, placeholders);
              }
              return { sql: sqlStr, params: values };
            }
            return {
              sql: `SELECT * FROM ${quoteTableRef(r.dbTable || r.tableName)} WHERE ${escapedDbCol} IN (${values.map(() => "?").join(",")})`,
              params: values,
            };
          },
        } as any : undefined,
      };
      // Keep the legacy name for compatibility, but also retain every
      // duplicate table under a qualified key so connection-aware lookup can
      // distinguish (for example) ACA.PACK_DATA_SERIAL from BITR.PACK_DATA_SERIAL.
      if (map[r.tableName]) {
        const previous = map[r.tableName];
        map[`${r.tableName}_${previous.connectionKey}`] = previous;
      }
      map[r.tableName] = meta;
      map[`${r.tableName}_${r.connectionKey}`] = meta;
    }
    return map;
  }

  /**
   * Hot reload dynamically configured tables into tableRegistry cache.
   */
  async reloadDynamicRegistry(): Promise<void> {
    const map = await this.loadAsTableMeta();
    setDynamicRegistry(map);
    console.log(`⚡ Hot-loaded ${Object.keys(map).length} dynamic tables into TableRegistry.`);
  }

  /**
   * Auto-detect columns using SHOW COLUMNS on target connection pool.
   */
  async previewColumns(connKey: string, tableName: string): Promise<ColumnMeta[]> {
    if (!resolveConnConfig(connKey)) {
      throw new Error(`ไม่พบ Connection Key "${connKey}"`);
    }

    // Support dot-notation: "BIT.ACA_BONDING_DATA" or plain "ACA_BONDING_DATA"
    // Needed for connections where database = undefined (e.g. Bitintra)
    const partRegex = /^[A-Za-z0-9_]{1,100}$/;
    let showColumnsTarget: string;

    // Oracle: ไม่มี SHOW COLUMNS — SELECT 0 แถวแล้วอ่านชื่อคอลัมน์จาก metaData
    // ใช้ได้ทั้ง table / view / synonym (EBS APPS เป็น synonym ซึ่ง ALL_TAB_COLUMNS มองไม่เห็น)
    // ชื่อไม่ระบุ OWNER = schema ของ user ที่ login (หรือ public synonym)
    if (isOracleConn(connKey)) {
      const parts = tableName.split(".");
      if (parts.length > 2 || !parts.every(p => partRegex.test(p))) {
        throw new Error("ชื่อตารางไม่ถูกต้อง (รองรับเฉพาะ A-Z, a-z, 0-9, _ และรูปแบบ OWNER.TABLE)");
      }
      const [, meta] = await getRawPool(connKey).execute(
        `SELECT * FROM ${quoteTableRef(tableName, true)} WHERE ROWNUM < 1`
      ) as any[];
      return (meta as Array<{ name: string }>).map(m => ({
        dbColumn: m.name,
        label: m.name,
        searchable: m.name.toLowerCase() !== "id",
        linksTo: [],
      }));
    }

    if (tableName.includes(".")) {
      const [dbPart, tblPart] = tableName.split(".", 2);
      if (!partRegex.test(dbPart) || !partRegex.test(tblPart)) {
        throw new Error("ชื่อตาราง/ฐานข้อมูลไม่ถูกต้อง (รองรับเฉพาะ A-Z, a-z, 0-9, _ และ รูปแบบ DB.TABLE)");
      }
      showColumnsTarget = `\`${dbPart}\`.\`${tblPart}\``;
    } else {
      if (!partRegex.test(tableName)) {
        throw new Error("ชื่อตารางไม่ถูกต้องเพื่อความปลอดภัยในการป้องกัน SQL Injection");
      }
      // Check if connection has no default database — warn user to use DB.TABLE format
      const cfg = resolveConnConfig(connKey);
      if (cfg && cfg.database === undefined) {
        throw new Error(
          `Connection "${connKey}" ไม่มี Default Database กรุณาระบุชื่อตารางในรูปแบบ "DB.TABLE" เช่น "BIT.${tableName}"`
        );
      }
      showColumnsTarget = `\`${tableName}\``;
    }

    const rawPool = getRawPool(connKey);
    // SHOW COLUMNS returns: Field, Type, Null, Key, Default, Extra
    const [rows] = await rawPool.execute(`SHOW COLUMNS FROM ${showColumnsTarget}`) as any[];
    
    return rows.map((r: any) => {
      const colName = r.Field;
      // Exclude generic keys like 'id' from searchability default logic
      const isIdCol = colName.toLowerCase() === "id";
      
      // Derive camelCase key from snake_case db column
      const colKey = colName.replace(/_([a-z])/g, (m: string, c: string) => c.toUpperCase());

      return {
        dbColumn: colName,
        label: colName,
        searchable: !isIdCol,
        linksTo: [],
      };
    });
  }

  /**
   * Safely test raw user-defined query with a LIMIT 5 cap.
   */
  async testQuery(connKey: string, userSql: string, params: unknown[]): Promise<{ rows: any[]; tookMs: number }> {
    if (!resolveConnConfig(connKey)) {
      throw new Error(`ไม่พบ Connection Key "${connKey}"`);
    }
    
    // Safety check: force limit cap to prevent heavy server load, and forbid multi-statement queries
    let trimmedSql = userSql.trim();
    if (trimmedSql.endsWith(";")) {
      trimmedSql = trimmedSql.slice(0, -1);
    }
    if (trimmedSql.includes(";")) {
      throw new Error("ไม่อนุญาตให้ใช้คำสั่ง Multi-Statements (เซมิโคลอน ;) เพื่อความปลอดภัยทางระบบ");
    }

    // Safety wrapping: wrap query inside subquery or append LIMIT 5
    // Oracle: ห่อ ROWNUM เสมอ (ไม่มี LIMIT, ห้ามมี AS หน้า table alias)
    let safetySql = trimmedSql;
    if (isOracleConn(connKey)) {
      safetySql = limitSql(trimmedSql, 5, true);
      // ส่ง bind เท่าจำนวน "?" จริง — Oracle error ถ้า bind เกิน (ORA-01036) ต่างจาก mysql2
      params = params.slice(0, (trimmedSql.match(/\?/g) || []).length);
    } else if (!trimmedSql.toLowerCase().includes("limit")) {
      safetySql = `${trimmedSql} LIMIT 5`;
    } else {
      // Force limit override to max 5
      safetySql = `SELECT * FROM (${trimmedSql}) AS safety_subquery LIMIT 5`;
    }

    const rawPool = getRawPool(connKey);
    const start = Date.now();
    const [res] = await rawPool.execute(safetySql, params) as any[];
    const tookMs = Date.now() - start;

    const rows = Array.isArray(res) ? res : [res];

    return {
      rows: rows.slice(0, 5),
      tookMs,
    };
  }

  /**
   * Run a DDL statement to verify or create the registry_users table on startup
   * and seed it with a default admin record if empty.
   */
  async ensureUsersTableExists(): Promise<void> {
    try {
      await dbSeagateDev.execute(sql`
        CREATE TABLE IF NOT EXISTS registry_users (
          en VARCHAR(50) PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          permission VARCHAR(50) NOT NULL DEFAULT 'admin',
          created_at VARCHAR(50) NOT NULL,
          updated_at VARCHAR(50) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8
      `);
      console.log("✅ MySQL database (SeagateDev): checked/created 'registry_users' table.");

      // Check if there is any user in the table, if empty seed default admin EN "0001"
      const users = await dbSeagateDev.select().from(registryUsers).limit(1);
      if (users.length === 0) {
        const isoString = new Date().toISOString();
        await dbSeagateDev.insert(registryUsers).values({
          en: "0001",
          name: "System Administrator",
          permission: "admin",
          createdAt: isoString,
          updatedAt: isoString,
        });
        console.log("🌱 Seeded default administrator with EN '0001' on SeagateDev.");
      }
    } catch (err) {
      console.error("❌ Failed to verify/create/seed 'registry_users' table on SeagateDev:", err);
    }
  }

  /**
   * Verify an employee number (EN) against the registry_users DB table.
   */
  async verifyUserEn(en: string): Promise<{ en: string; name: string; permission: string } | null> {
    if (!en || en.trim() === "") return null;
    const users = await dbSeagateDev
      .select()
      .from(registryUsers)
      .where(eq(registryUsers.en, en.trim()))
      .limit(1);

    if (users.length === 0) return null;
    const u = users[0];
    return {
      en: u.en,
      name: u.name,
      permission: u.permission,
    };
  }

  async getAllUsers() {
    return await dbSeagateDev.select().from(registryUsers);
  }

  async createUser(user: { en: string; name: string; permission: string }) {
    const isoString = new Date().toISOString();
    await dbSeagateDev.insert(registryUsers).values({
      en: user.en.trim(),
      name: user.name.trim(),
      permission: user.permission.trim(),
      createdAt: isoString,
      updatedAt: isoString,
    });
    return user;
  }

  async updateUser(en: string, patch: { name?: string; permission?: string }) {
    const existing = await dbSeagateDev
      .select()
      .from(registryUsers)
      .where(eq(registryUsers.en, en))
      .limit(1);
    if (existing.length === 0) throw new Error(`User not found: ${en}`);

    await dbSeagateDev
      .update(registryUsers)
      .set({
        name: patch.name !== undefined ? patch.name.trim() : existing[0].name,
        permission: patch.permission !== undefined ? patch.permission.trim() : existing[0].permission,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(registryUsers.en, en));
    return { en, ...patch };
  }

  async deleteUser(en: string) {
    await dbSeagateDev.delete(registryUsers).where(eq(registryUsers.en, en));
    return true;
  }

  async getUsersByEns(ens: string[]) {
    if (!ens || ens.length === 0) return [];
    const uniqueEns = [...new Set(ens.map(e => String(e).trim()).filter(Boolean))];
    if (uniqueEns.length === 0) return [];
    
    return await dbSeagateDev
      .select()
      .from(registryUsers)
      .where(inArray(registryUsers.en, uniqueEns));
  }
}
