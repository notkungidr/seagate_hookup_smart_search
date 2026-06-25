import { db } from "./db/client";
import { scan1 } from "./db/schema";
import { isNotNull, sql } from "drizzle-orm";

async function run() {
  try {
    const res = await db.execute(sql`SELECT COUNT(*) as count FROM scan1 WHERE 2D_eblock IS NOT NULL AND 2D_eblock != ''`);
    console.log("Non-null 2D_eblock rows:", res[0]);

    const sample = await db.execute(sql`SELECT hookup, 2D_eblock FROM scan1 WHERE 2D_eblock IS NOT NULL AND 2D_eblock != '' LIMIT 5`);
    console.log("Sample non-null rows:", sample[0]);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    process.exit(0);
  }
}

run();
