import { SearchService } from "./services/searchService";

async function run() {
  const searchService = new SearchService();
  try {
    const res = await searchService.search({
      table: "scan1",
      conditions: [{
        column: "hookup",
        operator: "eq",
        value: "DKEQPQGZ3349A1 205630100B"
      }]
    });
    console.log("Total rows found:", res.total);
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
