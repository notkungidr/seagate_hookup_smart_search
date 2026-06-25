import { dbSeagateDev } from "./db/client";
import { queryTemplates } from "./db/schema";
import { eq } from "drizzle-orm";

async function run() {
  try {
    const rows = await dbSeagateDev
      .select()
      .from(queryTemplates)
      .where(eq(queryTemplates.name, "TEST"));
    
    console.log("Found rows count:", rows.length);
    for (const r of rows) {
      console.log("ID:", r.id);
      console.log("Name:", r.name);
      console.log("RootTable:", r.rootTable);
      console.log("RootColumn:", r.rootColumn);
      console.log("RootConditions:", r.rootConditions);
      console.log("Hops:", r.hops);
      console.log("StepsChain:", r.stepsChain);
    }
  } catch (err) {
    console.error("Error:", err);
  } finally {
    process.exit(0);
  }
}

run();
