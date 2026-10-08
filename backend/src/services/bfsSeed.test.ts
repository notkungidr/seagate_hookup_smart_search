import { test, expect } from "bun:test";
import { SearchService } from "./searchService";
import { PivotService } from "./pivotService";
import { EndpointService } from "./endpointService";

// Regression: seed only on a non-root step (?S3_xxx=) with no resolved ancestor
// used to throw "BFS seed resolution deadlock".
test("seed only on step 3 resolves standalone, then backward-pivots", async () => {
  const calls: string[] = [];
  (SearchService.prototype as any).search = async ({ table }: any) => {
    calls.push(`search:${table}`);
    return { rows: [{ "Hookup (SN)": "SN1" }], tableLabel: table, availablePivots: [] };
  };
  (PivotService.prototype as any).pivot = async ({ targetTable }: any) => {
    calls.push(`pivot:${targetTable}`);
    return { rows: [{ "Hookup (SN)": "SN1" }], targetTableLabel: targetTable, availablePivots: [] };
  };

  const svc = new EndpointService();
  const config: any = {
    rootTable: "scan1", rootColumn: "hookup", rootConditions: [],
    hops: [
      { fromColumnKey: "hookup", fromStepIdx: 0, targetTable: "scan21", targetColumn: "hookup" },
      { fromColumnKey: "hookup", fromStepIdx: 1, targetTable: "soldering", targetColumn: "hookup" },
    ],
  };
  const res = await svc.runChain(config, { S3_hookup: "SN1" });
  expect(res.steps.length).toBe(3);
  expect(calls[0]).toBe("search:soldering"); // standalone seed first
  expect(res.steps.every((s) => s.rows.length === 1)).toBe(true);
  expect(res.seededSteps).toEqual([2]);
});

// Regression: ?S2_x=0 filtered S2 in SQL, but LEFT JOIN kept masters with S2 nulls.
test("seeded non-master step drops unmatched (null) rows", () => {
  const svc = new EndpointService();
  const config: any = {
    rootTable: "scan1", rootColumn: "hookup", rootConditions: [],
    hops: [{ fromColumnKey: "hookup", fromStepIdx: 0, targetTable: "scan21", targetColumn: "hookup" }],
  };
  const steps = [
    { table: "scan1", label: "scan1", rows: [{ "Hookup (SN)": "A" }, { "Hookup (SN)": "B" }, { "Hookup (SN)": "C" }] },
    { table: "scan21", label: "scan21", rows: [{ "Hookup (SN)": "A" }] },
  ];
  expect(svc.combineSteps(steps, config).length).toBe(3);      // unseeded: LEFT JOIN as before
  const rows = svc.combineSteps(steps, config, [1]);
  expect(rows.length).toBe(1);                                  // seeded: only matches
  expect(rows[0]["S1_Hookup (SN)"]).toBe("A");
});

// `__empty`: keeps rows whose step column is null/blank — incl. no joined row at all.
test("__empty is not a seed and keeps null/blank rows", async () => {
  (SearchService.prototype as any).search = async ({ table }: any) =>
    ({ rows: table === "scan1" ? [{ "Hookup (SN)": "A" }, { "Hookup (SN)": "B" }, { "Hookup (SN)": "C" }] : [], tableLabel: table, availablePivots: [] });
  (PivotService.prototype as any).pivot = async ({ targetTable }: any) =>
    ({ rows: [{ "Hookup (SN)": "A", "PCCA": "X" }, { "Hookup (SN)": "B", "PCCA": "" }], targetTableLabel: targetTable, availablePivots: [] });

  const svc = new EndpointService();
  const config: any = {
    rootTable: "scan1", rootColumn: "hookup", rootConditions: [],
    hops: [{ fromColumnKey: "hookup", fromStepIdx: 0, targetTable: "scan1", targetColumn: "hookup" }],
  };
  const res = await svc.runChain(config, { S1_hookup: "A,B,C", S2_pcca__empty: "" });
  expect(res.seededSteps).toEqual([0]);            // __empty did not seed S2
  expect(res.emptyCols).toEqual(["S2_PCCA"]);
  const rows = svc.combineSteps(res.steps, config, res.seededSteps, res.emptyCols);
  expect(rows.map((r) => r["S1_Hookup (SN)"]).sort()).toEqual(["B", "C"]); // B blank, C no S2 row
});
