import { getTablesSummary } from "./config/tableRegistry";

// Mimic useQueryTemplates.js helpers
function findTable(tablesMeta: any[], tableKey: string) {
  return tablesMeta.find(t => t.key === tableKey) || null;
}

function findColumn(tablesMeta: any[], tableKey: string, columnKey: string) {
  const tbl = findTable(tablesMeta, tableKey);
  if (!tbl) return null;
  return tbl.columns.find((c: any) => c.key === columnKey) || null;
}

function resolveFromDbColumn(tablesMeta: any[], prevTableKey: string, fromColumnKey: string) {
  const col = findColumn(tablesMeta, prevTableKey, fromColumnKey);
  return col ? col.dbColumn : null;
}

async function run() {
  const tablesMeta = getTablesSummary();
  
  const fromDbCol = resolveFromDbColumn(tablesMeta, "scan1", "eblock2D");
  console.log("Resolved fromDbCol:", fromDbCol);
  
  const col = findColumn(tablesMeta, "scan1", "eblock2D");
  console.log("Found column:", col);
}

run();
