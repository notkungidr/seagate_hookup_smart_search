import { dbACA } from "./db/client";
import { acaScan1 } from "./db/schema";
import { eq, sql } from "drizzle-orm";

async function run() {
  try {
    const res = await dbACA.execute(sql`SELECT COUNT(*) as count FROM ACA_SCAN1`);
    console.log("Total rows in ACA_SCAN1:", res[0]);

    const sample = await dbACA.execute(sql`SELECT * FROM ACA_SCAN1 LIMIT 3`);
    console.log("Sample rows in ACA_SCAN1:", sample[0]);

    const match = await dbACA.execute(sql`SELECT * FROM ACA_SCAN1 WHERE serial_no = 'RJ77KEG031'`);
    console.log("Rows matching RJ77KEG031:", match[0]);

    const match2 = await dbACA.execute(sql`SELECT * FROM ACA_SCAN1 WHERE serial_no = 'RJ64KEG044'`);
    console.log("Rows matching RJ64KEG044:", match2[0]);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    process.exit(0);
  }
}

run();
