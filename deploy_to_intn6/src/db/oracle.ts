// Oracle adapter — คืน object ที่มี execute/query shape เดียวกับ mysql2 pool ([rows, metaData])
// เพื่อให้ raw-pool path เดิม (searchService/pivotService/registryService) ใช้ได้โดยไม่ต้องแยก code path
import oracledb from "oracledb";

export const ORACLE_CUSTOM_SQL_UNSUPPORTED = "Custom SQL ยังไม่รองรับ Oracle connection — ใช้ตารางแบบปกติ (ไม่ติ๊ก Custom SQL) แทน";

export type OracleConnConfig = { host: string; port?: number; user: string; password?: string; database?: string };

// Oracle ต่อด้วย SID (field database ของ ConnConfig = SID) — ยืนยันกับ EBS ebs_PRD แล้ว
// ponytail: ไม่มีตัวเลือก SERVICE_NAME — เพิ่ม field connect_by เมื่อเจอ DB ที่ต่อด้วย SID ไม่ได้ (ORA-12505)
export function buildConnectString(cfg: OracleConnConfig): string {
  return `(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=${cfg.host})(PORT=${cfg.port ?? 1521}))(CONNECT_DATA=(SID=${cfg.database ?? ""})))`;
}

// mysql "?" → oracle ":1, :2, ..."
// ponytail: นับทุก "?" — SQL ที่ raw path สร้างเองไม่มี "?" ใน string literal (ค่าทุกตัวเป็น bind)
// ถ้าวันหนึ่งรับ SQL ที่ผู้ใช้เขียนเองแบบมี '?' ใน literal ต้องเปลี่ยนเป็น tokenizer
export function toOracleBinds(sql: string): string {
  let n = 0;
  return sql.replace(/\?/g, () => `:${++n}`);
}

// thick mode เสมอ — EBS ใช้ password verifier เก่า (0x939) → thin mode ต่อไม่ได้ (NJS-116)
// ต้องเรียกก่อนสร้าง pool แรก, process-wide (เรียกเฉพาะตอนสร้าง Oracle pool → MySQL ไม่กระทบ)
// libDir: ORACLE_INSTANT_CLIENT_PATH ถ้ามี (Dockerfile ตั้งให้) → Windows dev default C:\oracle
// → Linux ไม่มีค่า: ใช้ ld.so.conf / LD_LIBRARY_PATH
let _clientInitDone = false;
function initClientOnce(): void {
  if (_clientInitDone) return;
  _clientInitDone = true;
  const libDir =
    process.env.ORACLE_INSTANT_CLIENT_PATH || (process.platform === "win32" ? "C:\\oracle" : undefined);
  try {
    oracledb.initOracleClient(libDir ? { libDir } : undefined);
  } catch (err) {
    _clientInitDone = false; // ให้ลองใหม่ได้หลังติดตั้ง/แก้ path
    throw new Error(
      `Oracle Instant Client โหลดไม่ได้ (libDir=${libDir ?? "system path"}) — ` +
        `ติดตั้ง Instant Client หรือตั้ง ORACLE_INSTANT_CLIENT_PATH: ${(err as Error).message}`
    );
  }
  console.log(`[DB Pool] oracledb thick mode (libDir=${libDir ?? "system path"})`);
}

// DATE/TIMESTAMP → "YYYY-MM-DD HH24:MI:SS" string ให้ตรงกับ mysql2 dateStrings:true
// (frontend dateTime.js + endpointService.filterCombinedRows พึ่ง format นี้)
const SESSION_SQL =
  "ALTER SESSION SET NLS_DATE_FORMAT='YYYY-MM-DD HH24:MI:SS' " +
  "NLS_TIMESTAMP_FORMAT='YYYY-MM-DD HH24:MI:SS' NLS_TIMESTAMP_TZ_FORMAT='YYYY-MM-DD HH24:MI:SS'";

export function createOracleRawPool(key: string, cfg: OracleConnConfig, timeoutMs: number) {
  initClientOnce();
  oracledb.fetchAsString = [oracledb.DATE, oracledb.CLOB];

  let poolPromise: Promise<oracledb.Pool> | null = null;
  const getPool = () => {
    if (!poolPromise) {
      poolPromise = oracledb.createPool({
        user: cfg.user,
        password: cfg.password,
        connectString: buildConnectString(cfg),
        poolMin: 0,
        poolMax: 10,
        poolIncrement: 1,
        sessionCallback: (conn: oracledb.Connection, _tag: string, cb: (err?: Error) => void) => {
          conn.execute(SESSION_SQL).then(() => cb(), cb);
        },
      }).catch(err => {
        poolPromise = null; // ให้ request ถัดไป retry ได้ (เช่น DB เพิ่งกลับมา)
        throw err;
      });
    }
    return poolPromise;
  };

  const execute = async (sql: string, params: unknown[] = []): Promise<[any[], any]> => {
    const conn = await (await getPool()).getConnection();
    try {
      conn.callTimeout = timeoutMs; // native timeout แทน wrapper ของ mysql2
      const res = await conn.execute(toOracleBinds(sql), params as any[], { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return [res.rows ?? [], res.metaData ?? []];
    } finally {
      await conn.close().catch(() => {});
    }
  };

  return {
    isOracle: true as const,
    execute,
    query: execute,
    end: async () => {
      if (poolPromise) await (await poolPromise).close(0).catch(() => {});
    },
  };
}
