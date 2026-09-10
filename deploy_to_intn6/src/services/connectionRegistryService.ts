import { dbSeagateDev, getRawPool, CONNECTION_CONFIGS, resolveConnConfig, setDynamicConnections, closePool } from "../db/client";
import { registryConnections, registryTables } from "../db/schema";
import { eq, sql } from "drizzle-orm";

export interface ConnectionRow {
  id: string;
  label: string;
  host: string;
  port: number;
  dbName: string | null;
  isActive: boolean;
  hasPassword: boolean;
  isStatic: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// ป้ายชื่อของ connection แบบ static (อยู่ใน CONNECTION_CONFIGS ของโค้ด)
// ใช้แสดงใน dropdown ให้เห็นเหมือนเดิม — เพิ่ม connection ใหม่จาก UI ได้เลยโดยไม่แตะ map นี้
const STATIC_LABELS: Record<string, string> = {
  seagate: "Seagate Production (seagate)",
  ACA: "ACA Production (ACA)",
  Bitintra: "Bitintra Shared Server (Bitintra)",
  BITR: "BITR",
  BITR_IMM: "BITR_IMM",
  BITR_SM: "BITR_SM",
  WORKFLOW: "WORKFLOW",
  dbBIT: "BIT",
  dbWMS: "WMS",
  dbHr: "HR",
  SeagateDev: "Seagate Development (SeagateDev)",
  seagateACADev: "Seagate ACA Development (seagateACADev)",
  SGCOIL: "SGCOIL (wdhu-db02)",
  HGSTACA: "HGSTACA (wdhu-db02)",
  SEAPRINT: "SEAPRINT (sgfc-db02)",
  SOFT: "SOFT (sgfc-db02)",
};

export interface ConnectionInput {
  id?: string;
  label?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  dbName?: string | null;
  isActive?: boolean;
}

export class ConnectionRegistryService {
  /**
   * สร้างตาราง registry_connections ตอน startup (mirror สไตล์ registryService)
   */
  async ensureConnectionsTableExists(): Promise<void> {
    try {
      await dbSeagateDev.execute(sql`
        CREATE TABLE IF NOT EXISTS registry_connections (
          id VARCHAR(50) PRIMARY KEY,
          label VARCHAR(200) NOT NULL,
          host VARCHAR(255) NOT NULL,
          port INT NOT NULL DEFAULT 3306,
          user VARCHAR(100) NOT NULL,
          password VARCHAR(200) NOT NULL,
          db_name VARCHAR(100) NULL,
          is_active TINYINT NOT NULL DEFAULT 1,
          created_at VARCHAR(50) NOT NULL,
          updated_at VARCHAR(50) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8
      `);
      console.log("✅ MySQL database (SeagateDev): checked/created 'registry_connections' table.");
    } catch (err: any) {
      console.error("❌ Failed to ensure 'registry_connections' table:", err.message);
    }
  }

  /**
   * โหลด connection ที่ active จาก DB แล้วเทใส่ shadow map ใน client.ts
   * เรียกทุกครั้งหลัง mutation + piggyback บน GET /tables เพื่อ sync ข้าม instance
   */
  async loadAndApply(): Promise<void> {
    const rows = await dbSeagateDev
      .select()
      .from(registryConnections)
      .where(eq(registryConnections.isActive, 1));
    setDynamicConnections(rows.map(r => ({
      id: r.id,
      host: r.host,
      port: r.port,
      user: r.user,
      password: r.password,
      dbName: r.dbName,
    })));
    console.log(`⚡ Hot-loaded ${rows.length} dynamic connection(s) into connection registry.`);
  }

  /**
   * รายการ connection ทั้งหมด (static + dynamic) — password ไม่มีวันออกจาก API นี้
   */
  async list(): Promise<ConnectionRow[]> {
    // ponytail: DB ล่มก็ต้องได้ static rows กลับไป — ไม่งั้น dropdown หน้า UI ว่างหมด
    let rows: Array<typeof registryConnections.$inferSelect> = [];
    try {
      rows = await dbSeagateDev.select().from(registryConnections);
    } catch (err: any) {
      console.error("⚠️ list(): อ่าน registry_connections ไม่สำเร็จ — ส่งคืนเฉพาะ static connections:", err?.message || err);
    }
    const staticRows: ConnectionRow[] = Object.keys(CONNECTION_CONFIGS).map(id => ({
      id,
      label: STATIC_LABELS[id] ?? id,
      host: "",
      port: 0,
      dbName: null,
      isActive: true,
      hasPassword: true,
      isStatic: true,
    }));
    const dynamicRows: ConnectionRow[] = rows.map(r => ({
      id: r.id,
      label: r.label,
      host: r.host,
      port: r.port,
      dbName: r.dbName,
      isActive: r.isActive === 1,
      hasPassword: true,
      isStatic: false,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
    return [...staticRows, ...dynamicRows];
  }

  /**
   * Validate input ก่อน INSERT/UPDATE (ข้อความ error สไตล์เดียวกับ registryService)
   */
  private validate(input: ConnectionInput, isUpdate: boolean, existingId?: string): void {
    const id = input.id ?? existingId;
    if (!isUpdate && !input.id) {
      throw new Error("กรุณาระบุ Connection ID (Registry ID)");
    }
    if (input.id) {
      const idReg = /^[A-Za-z0-9_]{1,50}$/;
      if (!idReg.test(input.id)) {
        throw new Error("Connection ID ต้องประกอบด้วยตัวอักษร A-Z, a-z, 0-9 และ _ เท่านั้น และยาวไม่เกิน 50 ตัวอักษร");
      }
      if (CONNECTION_CONFIGS[input.id as keyof typeof CONNECTION_CONFIGS]) {
        throw new Error(`Connection ID "${input.id}" ชนกับ connection หลักของระบบซึ่งแก้ไขไม่ได้`);
      }
    }
    if (input.host !== undefined && (!input.host || input.host.length > 255)) {
      throw new Error("กรุณาระบุ Host (ไม่เกิน 255 ตัวอักษร)");
    }
    if (!isUpdate && (input.host === undefined || !input.host)) {
      throw new Error("กรุณาระบุ Host");
    }
    if (input.port !== undefined && (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535)) {
      throw new Error("Port ต้องเป็นตัวเลขระหว่าง 1-65535");
    }
    if (input.user !== undefined && (!input.user || input.user.length > 100)) {
      throw new Error("กรุณาระบุ User (ไม่เกิน 100 ตัวอักษร)");
    }
    if (!isUpdate && (input.user === undefined || !input.user)) {
      throw new Error("กรุณาระบุ User");
    }
    // create: ต้องมี password / update: ว่าง = คงรหัสเดิม
    if (!isUpdate && (input.password === undefined || input.password.length === 0)) {
      throw new Error("กรุณาระบุ Password");
    }
    if (input.password !== undefined && input.password.length > 200) {
      throw new Error("Password ยาวไม่เกิน 200 ตัวอักษร");
    }
    if (input.label !== undefined && input.label.length > 200) {
      throw new Error("Label ยาวไม่เกิน 200 ตัวอักษร");
    }
    if (input.dbName !== undefined && input.dbName !== null && input.dbName.length > 100) {
      throw new Error("Database name ยาวไม่เกิน 100 ตัวอักษร");
    }
  }

  async create(input: ConnectionInput): Promise<void> {
    this.validate(input, false);
    const exists = await dbSeagateDev
      .select({ id: registryConnections.id })
      .from(registryConnections)
      .where(eq(registryConnections.id, input.id!))
      .limit(1);
    if (exists.length > 0) {
      throw new Error(`Connection ID "${input.id}" มีอยู่แล้วในระบบ`);
    }
    const now = new Date().toISOString();
    await dbSeagateDev.insert(registryConnections).values({
      id: input.id!,
      label: input.label?.trim() || input.id!,
      host: input.host!,
      port: input.port ?? 3306,
      user: input.user!,
      password: input.password!,
      dbName: input.dbName?.trim() || null,
      isActive: input.isActive === false ? 0 : 1,
      createdAt: now,
      updatedAt: now,
    });
    await this.loadAndApply();
  }

  async update(id: string, input: ConnectionInput): Promise<void> {
    this.validate({ ...input, id }, true, id);
    const rows = await dbSeagateDev
      .select()
      .from(registryConnections)
      .where(eq(registryConnections.id, id))
      .limit(1);
    if (rows.length === 0) {
      throw new Error(`ไม่พบ Connection "${id}"`);
    }
    const values: Partial<typeof registryConnections.$inferInsert> = {
      label: input.label?.trim() || rows[0].label,
      host: input.host ?? rows[0].host,
      port: input.port ?? rows[0].port,
      user: input.user ?? rows[0].user,
      dbName: input.dbName !== undefined ? (input.dbName?.trim() || null) : rows[0].dbName,
      isActive: input.isActive === undefined ? rows[0].isActive : (input.isActive ? 1 : 0),
      updatedAt: new Date().toISOString(),
    };
    // password ว่าง = คงรหัสเดิม (frontend ส่ง "" มาเสมอเมื่อไม่แก้)
    if (input.password !== undefined && input.password.length > 0) {
      values.password = input.password;
    }
    await dbSeagateDev.update(registryConnections).set(values).where(eq(registryConnections.id, id));
    await closePool(id); // บังคับ rebuild pool ด้วย config ใหม่ใน request ถัดไป
    await this.loadAndApply();
  }

  async delete(id: string): Promise<void> {
    if (CONNECTION_CONFIGS[id as keyof typeof CONNECTION_CONFIGS]) {
      throw new Error(`Connection "${id}" เป็น connection หลักของระบบ ลบไม่ได้`);
    }
    const usage = await dbSeagateDev
      .select({ cnt: sql<number>`COUNT(*)` })
      .from(registryTables)
      .where(eq(registryTables.connectionKey, id));
    if (Number(usage[0]?.cnt ?? 0) > 0) {
      throw new Error(`ลบไม่ได้ — มีตารางใน Registry ใช้ connection นี้อยู่ ${Number(usage[0].cnt)} ตาราง (ลบ/ย้ายตารางก่อน)`);
    }
    const result = await dbSeagateDev.delete(registryConnections).where(eq(registryConnections.id, id));
    if (result[0].affectedRows === 0) {
      throw new Error(`ไม่พบ Connection "${id}"`);
    }
    await closePool(id);
    await this.loadAndApply();
  }

  /**
   * ทดสอบ connection ด้วย SELECT 1 — สร้าง pool จริงถ้ายังไม่มี
   */
  async testConnection(id: string): Promise<{ tookMs: number }> {
    if (!resolveConnConfig(id)) {
      throw new Error(`ไม่พบ Connection "${id}" ในระบบ`);
    }
    const start = Date.now();
    const pool = getRawPool(id);
    await pool.query("SELECT 1");
    return { tookMs: Date.now() - start };
  }
}
