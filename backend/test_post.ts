import { EndpointService } from "./src/services/endpointService";
import { RegistryService } from "./src/services/registryService";
import { getTableMeta } from "./src/config/tableRegistry";
import { savedEndpoints } from "./src/db/schema";
import { dbSeagateDev } from "./src/db/client";
import { eq } from "drizzle-orm";

const endpointService = new EndpointService();
const registryService = new RegistryService();

async function main() {
  await registryService.reloadDynamicRegistry();

  const [api] = await dbSeagateDev
    .select()
    .from(savedEndpoints)
    .where(eq(savedEndpoints.id, "apiPtAcaToCoilMagnetWireNo"));
  
  const config = JSON.parse(api.config as string);

  const ptNos = [
    "PT260525472_N",
    "PT260525471_N",
    "PT260522419_H",
    "PT260524002_N",
    "PT260524001_N",
    "PT260522490_N",
    "PT260522489_N",
    "PT260525449_N",
    "PT260525448_N",
    "PT260526192_H",
    "PT260526191_H",
    "PT260526295_H",
    "PT260525293_N",
    "PT260522470_H",
    "PT260526187_H",
    "PT260525470_N"
  ];

  console.log("Running chain with pt_no list...");
  const result = await endpointService.runChain(config, {
    pt_no: ptNos.join("\n")
  });

  const combinedRows = endpointService.combineSteps(result.steps, config);
  console.log("Combined rows count:", combinedRows.length);
  if (combinedRows.length > 0) {
    console.log("Keys in combined row:", Object.keys(combinedRows[0]));
    console.log("First row S1_pt_no:", combinedRows[0]["S1_pt_no"]);
  }

  // Replicate new in-memory filter logic
  let filteredRows = combinedRows;
  
  let masterIdx = 0;
  let maxRows = result.steps[0]?.rows.length || 0;
  result.steps.forEach((s, idx) => {
    if (s.rows.length > maxRows) {
      maxRows = s.rows.length;
      masterIdx = idx;
    }
  });

  const allowedSearchParams = { pt_no: ptNos.join("\n") };

  for (const [paramName, paramValue] of Object.entries(allowedSearchParams)) {
    const rawString = String(paramValue).trim();
    const valList = rawString.split(/[\n,]+/).map(v => v.trim().toLowerCase()).filter(Boolean);
    if (valList.length === 0) continue;

    filteredRows = filteredRows.filter((row) => {
      let cellVal = row[paramName];
      if (cellVal === undefined) {
        // Check for aliased versions like S1_col, S2_col, S3_col...
        for (let i = 1; i <= result.steps.length; i++) {
          const prefixedKey = `S${i}_${paramName}`;
          if (row[prefixedKey] !== undefined) {
            cellVal = row[prefixedKey];
            break;
          }
        }
      }

      if (cellVal == null) return false;
      const cellStr = String(cellVal).trim().toLowerCase();
      return valList.some(v => cellStr.includes(v) || v.includes(cellStr));
    });
  }

  console.log("Filtered rows count after logic:", filteredRows.length);
}

main().catch(console.error).finally(() => process.exit(0));
