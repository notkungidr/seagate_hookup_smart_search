import { PivotService } from "./services/pivotService";

async function run() {
  const pivotService = new PivotService();
  try {
    const res = await pivotService.pivot({
      sourceValues: ["DKEQPQGZ3349A1 205630100B"],
      targetTable: "scan1",
      targetColumn: "hookup"
    });
    console.log("Total rows pivoted:", res.total);
    if (res.rows.length > 0) {
      console.log("Returned row:", res.rows[0]);
      console.log("Returned row keys:", Object.keys(res.rows[0]));
    }
  } catch (err) {
    console.error("Error:", err);
  } finally {
    process.exit(0);
  }
}

run();
