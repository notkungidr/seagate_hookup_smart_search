import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

const QUERY_TIMEOUT_MS = 120000; // 2 minutes (120 seconds) as requested by user

// ============================================================
// CONNECTION REGISTRY
// เพิ่ม Server ใหม่: เพิ่มแค่ 1 entry ที่นี่เท่านั้น!
// ⚠️ Credentials อ่านจาก Environment Variables (.env)
// ============================================================
export const CONNECTION_CONFIGS = {
  seagate: {
    host: process.env.DB_SEAGATE_HOST || "sghu-db02.th.belton.corp",
    user: process.env.DB_SEAGATE_USER!,
    password: process.env.DB_SEAGATE_PASSWORD!,
    database: "seagate",
  },
  ACA: {
    host: process.env.DB_SEAGATE_HOST || "sghu-db02.th.belton.corp",
    user: process.env.DB_SEAGATE_USER!,
    password: process.env.DB_SEAGATE_PASSWORD!,
    database: "ACA",
  },
  Bitintra: {
    host: process.env.DB_BITINTRA_HOST || "bitintra-db02.th.belton.corp",
    user: process.env.DB_BITINTRA_USER!,
    password: process.env.DB_BITINTRA_PASSWORD!,
    database: undefined, // ไม่กำหนด default database → ระบุชื่อ DB ใน Query ได้อิสระ (*)
  },
  BITR: {
    host: process.env.DB_BITINTRA_HOST || "bitintra-db02.th.belton.corp",
    user: process.env.DB_BITINTRA_USER!,
    password: process.env.DB_BITINTRA_PASSWORD!,
    database: "BITR",
  },
  BITR_IMM: {
    host: process.env.DB_BITINTRA_HOST || "bitintra-db02.th.belton.corp",
    user: process.env.DB_BITINTRA_USER!,
    password: process.env.DB_BITINTRA_PASSWORD!,
    database: "BITR_IMM",
  },
  BITR_SM: {
    host: process.env.DB_BITINTRA_HOST || "bitintra-db02.th.belton.corp",
    user: process.env.DB_BITINTRA_USER!,
    password: process.env.DB_BITINTRA_PASSWORD!,
    database: "BITR_SM",
  },
  WORKFLOW: {
    host: process.env.DB_BITINTRA_HOST || "bitintra-db02.th.belton.corp",
    user: process.env.DB_BITINTRA_USER!,
    password: process.env.DB_BITINTRA_PASSWORD!,
    database: "WORKFLOW",
  },
  dbHr: {
    host: process.env.DB_BITINTRA_HOST || "bitintra-db02.th.belton.corp",
    user: process.env.DB_WMS_USER!,
    password: process.env.DB_WMS_PASSWORD!,
    database: "hr",
  },
  dbBIT: {
    host: process.env.DB_BITINTRA_HOST || "bitintra-db02.th.belton.corp",
    user: process.env.DB_WMS_USER!,
    password: process.env.DB_WMS_PASSWORD!,
    database: "BIT",
  },
  dbWMS: {
    host: process.env.DB_WMS_HOST || "bitintra-db02.th.belton.corp",
    user: process.env.DB_WMS_USER!,
    password: process.env.DB_WMS_PASSWORD!,
    database: "WMS",
  },
  SeagateDev: {
    host: process.env.DB_SEAGATEDEV_HOST || "devth-db2.th.belton.corp",
    user: process.env.DB_SEAGATEDEV_USER!,
    password: process.env.DB_SEAGATEDEV_PASSWORD!,
    database: "seagate",
  },
  seagateACADev: {
    host: "devth-db2",
    user: "adminapp",
    password: "It-development2006Bit",
    database: "ACA",
  },
  SGCOIL: {
    host: process.env.DB_SGCOIL_HOST || "wdhu-db02.th.belton.corp",
    user: 'intranet4',
    password: process.env.DB_SGCOIL_PASSWORD!,
    database: "SGCOIL",
  },
  HGSTACA: {
    host: process.env.DB_HGSTACA_HOST || "wdhu-db02.th.belton.corp",
    user: 'intranet4',
    password: process.env.DB_HGSTACA_PASSWORD!,
    database: "HGSTACA",
  },
  SEAPRINT: {
    host: process.env.DB_SEAPRINT_HOST || "sgfc-db02.th.belton.corp",
    user: process.env.DB_SEAPRINT_USER!,
    password: process.env.DB_SEAPRINT_PASSWORD!,
    database: "seaprint",
  },
  SOFT: {
    host: process.env.DB_SOFT_HOST || "sgfc-db02.th.belton.corp",
    user: process.env.DB_SOFT_USER!,
    password: process.env.DB_SOFT_PASSWORD!,
    database: "soft",
  },
} as const;

export type DbKey = keyof typeof CONNECTION_CONFIGS;

// ============================================================
// DYNAMIC CONNECTIONS (Phase 3) — เพิ่ม connection จาก UI ได้ ไม่ต้องแก้โค้ด
// โหลดจากตาราง registry_connections (SeagateDev) ผ่าน connectionRegistryService
// กติกา: STATIC ชนะเสมอ — dynamic ห้ามแทน/แก้ connection ที่อยู่ในโค้ด
// ============================================================
export type ConnConfig = { host: string; port?: number; user: string; password?: string; database?: string };
const _dynamicConnConfigs = new Map<string, ConnConfig>();

export function setDynamicConnections(
  list: Array<{ id: string; host: string; port?: number | null; user: string; password: string; dbName?: string | null }>
): void {
  // ponytail: ปิด pool ของ key ที่ถูกลบ/ปิดใช้งาน — ไม่งั้น instance อื่น (GET /tables sync) จะค้าง pool เก่าตลอดไป
  const nextKeys = new Set(list.map(c => c.id));
  for (const prevKey of _dynamicConnConfigs.keys()) {
    if (!nextKeys.has(prevKey)) void closePool(prevKey);
  }
  _dynamicConnConfigs.clear();
  for (const c of list) {
    _dynamicConnConfigs.set(c.id, {
      host: c.host,
      port: c.port ?? undefined,
      user: c.user,
      password: c.password,
      database: c.dbName ?? undefined,
    });
  }
}

export function resolveConnConfig(key: string): ConnConfig | null {
  return CONNECTION_CONFIGS[key as DbKey] ?? _dynamicConnConfigs.get(key) ?? null;
}

/**
 * Wraps a mysql2 Pool so that any .execute() or .query() taking longer than timeoutMs
 * is physically severed (conn.destroy()) and rejected with a timeout error.
 */
function wrapPoolWithTimeout(pool: mysql.Pool, timeoutMs: number): mysql.Pool {
  pool.execute = async function (sql: any, values: any): Promise<any> {
    const conn = await pool.getConnection();
    let timeoutId: any;
    let timedOut = false;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        try {
          console.error(`[DB Timeout] Query exceeded ${timeoutMs}ms limit! Severing TCP socket connection immediately.`);
          conn.destroy(); // Physically cut the socket connection
        } catch (e) {
          console.error(`[DB Timeout] Error severing connection:`, e);
        }
        reject(new Error(`Database query timeout: Execution exceeded ${timeoutMs / 1000} seconds.`));
      }, timeoutMs);
    });

    const queryPromise = (async () => {
      try {
        return await conn.execute(sql, values);
      } finally {
        if (!timedOut) {
          conn.release();
        }
      }
    })();

    return Promise.race([queryPromise, timeoutPromise]).finally(() => {
      clearTimeout(timeoutId);
    });
  } as any;

  pool.query = async function (sql: any, values: any): Promise<any> {
    const conn = await pool.getConnection();
    let timeoutId: any;
    let timedOut = false;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        try {
          console.error(`[DB Timeout] Query exceeded ${timeoutMs}ms limit! Severing TCP socket connection immediately.`);
          conn.destroy(); // Physically cut the socket connection
        } catch (e) {
          console.error(`[DB Timeout] Error severing connection:`, e);
        }
        reject(new Error(`Database query timeout: Execution exceeded ${timeoutMs / 1000} seconds.`));
      }, timeoutMs);
    });

    const queryPromise = (async () => {
      try {
        return await conn.query(sql, values);
      } finally {
        if (!timedOut) {
          conn.release();
        }
      }
    })();

    return Promise.race([queryPromise, timeoutPromise]).finally(() => {
      clearTimeout(timeoutId);
    });
  } as any;

  return pool;
}

// ============================================================
// LAZY POOL CACHE
// สร้าง pool ครั้งแรกที่ใช้งาน แล้วเก็บไว้ใน cache
// ============================================================
const _poolCache = new Map<string, ReturnType<typeof drizzle>>();
const _rawPoolCache = new Map<string, mysql.Pool>();

/**
 * ดึง Drizzle instance ตาม connection key (static หรือ dynamic จาก registry_connections)
 * ครั้งแรกจะสร้าง pool ใหม่, ครั้งต่อไปใช้ pool เดิมจาก cache
 */
export function getDb(key: string): ReturnType<typeof drizzle> {
  if (_poolCache.has(key)) {
    return _poolCache.get(key)!;
  }

  const cfg = resolveConnConfig(key);
  if (!cfg) {
    throw new Error(`ไม่พบ Connection "${key}" ในระบบ (หรือถูกปิดใช้งานอยู่) — แก้ได้ที่ Registry Manager → Connections`);
  }
  const poolOptions: mysql.PoolOptions = {
    host: cfg.host,
    port: cfg.port ?? parseInt(process.env.DB_PORT || "3306", 10),
    user: cfg.user,
    password: cfg.password,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    // DATETIME/DATE คืนเป็น string "YYYY-MM-DD HH:MM:SS" ตรงตาม DB (ไม่ผ่าน Date object)
    // กัน timezone shift: ถ้าไม่ใส่ mysql2 แปลงเป็น Date ด้วย timezone:'local' แล้ว JSON
    // serialize เป็น UTC ISO — เครื่องที่รัน GMT+7 จะโชว์เวลาเพี้ยน -7h
    dateStrings: true,
  };
  if (cfg.database) {
    poolOptions.database = cfg.database;
  }

  // ponytail: debug log — ลบออกเมื่อหาสาเหตุ access denied เจอแล้ว
  console.log(`[DB Pool] init "${key}" → host=${cfg.host} user=${cfg.user} db=${cfg.database ?? "(none)"}`);

  const pool = mysql.createPool(poolOptions);
  const wrappedPool = wrapPoolWithTimeout(pool, QUERY_TIMEOUT_MS);

  // เก็บ raw pool ไว้ด้วยเพื่อให้ getRawPool() ใช้ execute raw SQL ได้
  _rawPoolCache.set(key, wrappedPool);

  // SeagateDev ใช้ schema เพื่อรองรับ saved_endpoints / query_templates
  // Bitintra ไม่ใช้ schema (ข้ามเซิร์ฟเวอร์ ใช้ raw SQL)
  const drizzleInstance = (key === "SeagateDev" || key === "seagateACADev")
    ? drizzle(wrappedPool, { schema, mode: "default" })
    : (key === "seagate" || key === "ACA")
      ? drizzle(wrappedPool, { schema, mode: "default" })
      : drizzle(wrappedPool, { mode: "default" });

  _poolCache.set(key, drizzleInstance);
  return drizzleInstance;
}

/**
 * ดึง raw mysql2 Pool ตาม connection key (สำหรับ execute raw SQL string)
 * ต้องเรียก getDb(key) ก่อนอย่างน้อย 1 ครั้งเพื่อให้ pool ถูกสร้าง
 */
export function getRawPool(key: string): mysql.Pool {
  // เรียก getDb เพื่อให้แน่ใจว่า pool ถูกสร้างแล้ว
  getDb(key);
  return _rawPoolCache.get(key)!;
}

/**
 * ปิดและลบ pool ออกจาก cache (ใช้เมื่อแก้/ลบ connection จาก UI)
 * query ที่กำลังรันอยู่บน pool เก่าจะ error ครั้งเดียว แล้ว request ถัดไป rebuild จาก config ล่าสุด
 * ponytail: fire-and-forget — close ตอนแก้ config เป็นเหตุการณ์หาได้ยาก ไม่คุ้ม retry logic
 */
export async function closePool(key: string): Promise<void> {
  _poolCache.delete(key);
  const raw = _rawPoolCache.get(key);
  _rawPoolCache.delete(key);
  if (raw) {
    // fire-and-forget — ไม่ await (ไม่งั้น admin PUT/DELETE โดนบล็อกถึง 120s ระหว่าง query drain)
    raw.end().catch(() => {
      // ปล่อย — เป้าหมายคือทำลาย pool เพื่อ rebuild อยู่แล้ว
    });
  }
}

// ============================================================
// NAMED EXPORTS (Backward Compatibility)
// ไฟล์อื่นๆ ที่ import db, dbACA, dbBitintra, dbSeagateDev, dbWMS
// ยังคงทำงานได้ตามปกติโดยไม่ต้องแก้ไข
// ============================================================
export const db = getDb("seagate");
export const dbACA = getDb("ACA");
export const dbBitintra = getDb("Bitintra");
export const dbSeagateDev = getDb("SeagateDev");
export const dbACADev = getDb("seagateACADev");
export const dbWMS = getDb("dbWMS");
