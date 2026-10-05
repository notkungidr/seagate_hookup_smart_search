// ad-hoc probe: real Search/Pivot/Registry service code against Oracle — in-memory only
// (no registry_connections / registry_tables writes, read-only SELECTs on DUAL: DUMMY='X' exists on every Oracle)
//   bun --env-file=D:\pr_online_budget_report_new\budget-report-backend\.env run src/check_oracle_e2e.ts
import { setDynamicConnections, closePool } from "./db/client";
import { setDynamicRegistry } from "./config/tableRegistry";
import { SearchService } from "./services/searchService";
import { PivotService } from "./services/pivotService";
import { RegistryService } from "./services/registryService";
import { ConnectionRegistryService } from "./services/connectionRegistryService";

if (process.platform === "win32") process.env.ORACLE_INSTANT_CLIENT_PATH ||= "C:\\oracle";
const m = (process.env.ORACLE_CONNECT_STRING || "").match(/^([^:/]+):(\d+)\/(.+)$/)!;
const KEY = "ORA_PROBE";
setDynamicConnections([{ id: KEY, host: m[1], port: Number(m[2]), user: process.env.ORACLE_USER!, password: process.env.ORACLE_PASSWORD!, dbName: m[3], type: "oracle" }]);

const reg = new RegistryService();
const cols = await reg.previewColumns(KEY, "DUAL"); // public synonym → SYS.DUAL
const columns = Object.fromEntries(cols.map(c => [c.dbColumn, { ...c, searchable: true }]));
setDynamicRegistry({ DUAL_PROBE: { tableName: "DUAL_PROBE", dbTable: "DUAL", connectionKey: KEY, drizzleTable: null, label: "DUAL", columns } as any });

let failed = 0;
const check = (name: string, ok: boolean, detail: unknown) => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${JSON.stringify(detail)}`);
};
const noise = (n: number) => Array.from({ length: n }, (_, i) => `NOPE_${i}`);
const quiet = async <T>(fn: () => Promise<T>) => { const log = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = log; } };

check("previewColumns DUAL (synonym)", cols.length === 1 && cols[0].dbColumn === "DUMMY", cols.map(c => c.dbColumn));

const conn = await new ConnectionRegistryService().testConnection(KEY);
check("testConnection SELECT 1 FROM DUAL", conn.tookMs >= 0, conn);

const tq = await reg.testQuery(KEY, "SELECT DUMMY, SYSDATE AS D FROM DUAL WHERE DUMMY = ?", ["X", "extra-ignored"]);
check("testQuery ROWNUM wrap + extra bind trimmed", tq.rows.length === 1 && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(tq.rows[0].D), tq.rows);

const s = new SearchService();
const eq = await quiet(() => s.search({ table: "DUAL_PROBE", conditions: [{ column: "DUMMY", operator: "eq", value: "X" }] }));
check("search eq", eq.total === 1 && eq.rows[0].DUMMY === "X", { total: eq.total, sql: eq.debug.sql });

const like = await quiet(() => s.search({ table: "DUAL_PROBE", conditions: [{ column: "DUMMY", operator: "like", value: "X" }] }));
check("search like", like.total === 1, { total: like.total });

const inVals = [...noise(1200), "X"]; // 'X' lands in batch 2 → proves 1000-cap batching (no ORA-01795)
const inRes = await quiet(() => s.search({ table: "DUAL_PROBE", conditions: [{ column: "DUMMY", operator: "in", value: "", values: inVals }] }));
check("search IN 1201 values (batched)", inRes.total === 1, { total: inRes.total });

const pv = await quiet(() => new PivotService().pivot({ sourceValues: [...noise(1500), "X"], targetTable: "DUAL_PROBE", targetServer: KEY, targetColumn: "DUMMY" } as any));
check("pivot 1501 values (batched)", pv.total === 1 && pv.debug!.queries.length === 2, { total: pv.total, batches: pv.debug!.queries.length });

const miss = await quiet(() => s.search({ table: "DUAL_PROBE", conditions: [{ column: "DUMMY", operator: "eq", value: "nope" }] }));
check("search no match → 0 rows", miss.total === 0, { total: miss.total });

try {
  await s.distinct("DUAL_PROBE", "DUMMY");
  check("distinct guard", false, "no error thrown");
} catch (e: any) {
  check("distinct guard (Thai error, no ORA-)", /Oracle/.test(e.message) && !/ORA-/.test(e.message), e.message);
}

await closePool(KEY);
console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
