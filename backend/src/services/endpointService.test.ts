import { describe, expect, test } from "bun:test";
import { EndpointService } from "./endpointService";

describe("EndpointService template parity", () => {
  const service = new EndpointService();

  test("clones and canonicalizes the saved Template chain", () => {
    const config = service.buildConfigFromTemplate({
      id: "template-scan-flow",
      rootTable: "scan1",
      rootColumn: "Hookup (SN)",
      rootOperator: "eq",
      rootConditions: [
        { column: "hookup", operator: "eq", value: "REAL_VALUE_IS_NOT_QUERIED" },
        { column: "date", operator: "between", dateRange: ["2026-07-01", "2026-07-22"] },
        { column: "pcca", operator: "in", multiValue: "PCCA-1\nPCCA-2" },
      ],
      hops: [
        {
          fromColumnKey: "hookup",
          fromStepIdx: 0,
          targetTable: "scan21",
          targetColumn: "Hookup (SN)",
        },
        {
          fromColumnKey: "hookup",
          fromStepIdx: 0,
          targetTable: "soldering",
          targetColumn: "hookup",
        },
      ],
      favoriteColumns: ["Hookup (SN)", "S2_Date"],
    });

    expect(config.sourceTemplateId).toBe("template-scan-flow");
    expect(config.rootColumn).toBe("hookup");
    expect(config.rootConditions?.map(c => c.column)).toEqual(["hookup", "date", "pcca"]);
    expect(config.rootConditions?.[1].operator).toBe("between");
    expect(config.rootConditions?.[1]).toMatchObject({ value: "2026-07-01", value2: "2026-07-22" });
    expect(config.rootConditions?.[2].values).toEqual(["PCCA-1", "PCCA-2"]);
    expect(config.hops).toEqual([
      { fromColumnKey: "hookup", fromStepIdx: 0, targetTable: "scan21", targetColumn: "hookup" },
      { fromColumnKey: "hookup", fromStepIdx: 0, targetTable: "soldering", targetColumn: "hookup" },
    ]);
    expect(config.visibleCols).toEqual(["Hookup (SN)", "S2_Date"]);
    expect(service.isDatabaseParameter(config, "hookup")).toBe(true);
    expect(service.isDatabaseParameter(config, "S2_hookup")).toBe(true);
    expect(service.isDatabaseParameter(config, "S2_field_that_does_not_exist")).toBe(false);
  });

  test("reads legacy parentStepIdx but writes canonical fromStepIdx", () => {
    const config = service.normalizeConfig({
      rootTable: "scan1",
      rootColumn: "hookup",
      rootConditions: [{ column: "hookup", operator: "eq", value: "REAL_VALUE_IS_NOT_QUERIED" }],
      hops: [{
        fromColumnKey: "hookup",
        parentStepIdx: 0,
        targetTable: "scan21",
        targetColumn: "hookup",
      }],
    });

    expect(config.hops[0].fromStepIdx).toBe(0);
    expect(config.hops[0].parentStepIdx).toBeUndefined();
  });

  test("fails at publish time with the exact broken table/field", () => {
    expect(() => service.normalizeConfig({
      rootTable: "scan1",
      rootColumn: "hookup",
      rootConditions: [{ column: "hookup", operator: "eq", value: "REAL_VALUE_IS_NOT_QUERIED" }],
      hops: [{
        fromColumnKey: "field_that_does_not_exist",
        fromStepIdx: 0,
        targetTable: "scan21",
        targetColumn: "hookup",
      }],
    })).toThrow('Endpoint hop 1 source: column "field_that_does_not_exist" not found on table "scan1".');
  });

  test("does not allow a new API endpoint without a saved Template", async () => {
    await expect(service.create({
      id: "not-from-template",
      name: "Invalid endpoint",
      config: {
        rootTable: "scan1",
        rootColumn: "hookup",
        rootConditions: [{ column: "hookup", operator: "eq", value: "REAL_VALUE_IS_NOT_QUERIED" }],
        hops: [],
      },
      createdAt: "",
      updatedAt: "",
    })).rejects.toThrow("A saved Template is required before creating an API endpoint.");
  });
});
