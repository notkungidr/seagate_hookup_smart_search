import { db } from "./db/client";
import { scan1 } from "./db/schema";

async function run() {
  try {
    const rows = await db.select().from(scan1).limit(5);
    console.log("Returned row keys:", rows.length > 0 ? Object.keys(rows[0]) : "No rows");
    if (rows.length > 0) {
      console.log("First row:", rows[0]);
    }
  } catch (err) {
    console.error("Error:", err);
  } finally {
    process.exit(0);
  }
}

run();
