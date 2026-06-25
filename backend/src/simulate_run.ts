import { db, dbACA } from "./db/client";
import { sql } from "drizzle-orm";
import { BATCH_SIZE } from "./config/appConfig";

async function run() {
  try {
    // Step 0: Search BONDING_FIXTURE_BEARING
    console.log("--- Step 0: Search BONDING_FIXTURE_BEARING ---");
    const res0 = await db.execute(sql`
      SELECT * FROM BONDING_FIXTURE_BEARING 
      WHERE BONDING_FIXTURE LIKE '%SUM%' AND DATE LIKE '%2026-05-20%'
    `);
    const rows0 = res0[0] as any[];
    console.log("Step 0 rows count:", rows0.length);
    if (!rows0.length) return;

    // Step 1: Pivot to scan21 using dcm -> hookup
    console.log("--- Step 1: Pivot to scan21 ---");
    const dcmValues = [...new Set(rows0.map(r => String(r.DCM || "").trim()).filter(Boolean))];
    console.log("DCM values count:", dcmValues.length);
    
    // Batch query scan21
    const scan21Rows: any[] = [];
    for (let i = 0; i < dcmValues.length; i += BATCH_SIZE) {
      const batch = dcmValues.slice(i, i + BATCH_SIZE);
      const placeholders = batch.map(v => sql`${v}`);
      const joined = sql.join(placeholders, sql`, `);
      const res = await db.execute(sql`SELECT * FROM scan21 WHERE hookup IN (${joined})`);
      scan21Rows.push(...(res[0] as any[]));
    }
    console.log("Step 1 (scan21) rows count:", scan21Rows.length);
    if (!scan21Rows.length) return;

    // Step 2: Pivot to scan1 using hookup -> hookup
    console.log("--- Step 2: Pivot to scan1 ---");
    const hookupValues = [...new Set(scan21Rows.map(r => String(r.hookup || "").trim()).filter(Boolean))];
    console.log("Hookup values count:", hookupValues.length);

    const scan1Rows: any[] = [];
    for (let i = 0; i < hookupValues.length; i += BATCH_SIZE) {
      const batch = hookupValues.slice(i, i + BATCH_SIZE);
      const placeholders = batch.map(v => sql`${v}`);
      const joined = sql.join(placeholders, sql`, `);
      const res = await db.execute(sql`SELECT * FROM scan1 WHERE hookup IN (${joined})`);
      scan1Rows.push(...(res[0] as any[]));
    }
    console.log("Step 2 (scan1) rows count:", scan1Rows.length);
    if (!scan1Rows.length) return;

    // Check 2D_eblock in scan1Rows
    console.log("Sample scan1 row:", scan1Rows[0]);
    console.log("Sample scan1 row keys:", Object.keys(scan1Rows[0]));
    
    const eblockValues = [...new Set(scan1Rows.map(r => String(r["2D_eblock"] || "").trim()).filter(Boolean))];
    console.log("eblockValues (2D_eblock) count:", eblockValues.length);
    console.log("eblock2D (eblock2D) count:", [...new Set(scan1Rows.map(r => String(r.eblock2D || "").trim()).filter(Boolean))].length);

  } catch (err) {
    console.error("Error:", err);
  } finally {
    process.exit(0);
  }
}

run();
