// run: bun test src/db/oracle.test.ts — pure helpers only (no DB)
import { test, expect } from "bun:test";
import { buildConnectString, toOracleBinds } from "./oracle";
import { quoteTableRef, quoteColumnRef, limitSql } from "../config/tableRegistry";

test("connect descriptor uses SID + default port 1521", () => {
  expect(buildConnectString({ host: "erp", user: "u", database: "PROD" }))
    .toBe("(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=erp)(PORT=1521))(CONNECT_DATA=(SID=PROD)))");
  expect(buildConnectString({ host: "erp", port: 1538, user: "u", database: "PROD" })).toContain("(PORT=1538)");
});

test("? placeholders become positional :n binds", () => {
  expect(toOracleBinds('SELECT * FROM "T" WHERE "A" IN (?, ?) AND "B" = ?'))
    .toBe('SELECT * FROM "T" WHERE "A" IN (:1, :2) AND "B" = :3');
  expect(toOracleBinds("SELECT 1 FROM DUAL")).toBe("SELECT 1 FROM DUAL");
});

test("oracle identifiers: double-quoted + uppercase, owner.table split", () => {
  expect(quoteTableRef("apps.mtl_system_items_b", true)).toBe('"APPS"."MTL_SYSTEM_ITEMS_B"');
  expect(quoteColumnRef("date", true)).toBe('"DATE"');
  expect(quoteTableRef('x"; DROP', true)).toBe('"X; DROP"'); // embedded quote stripped
});

test("mysql quoting unchanged (regression)", () => {
  expect(quoteTableRef("BIT.ACA_BONDING_DATA")).toBe("`BIT`.`ACA_BONDING_DATA`");
  expect(quoteColumnRef("pd.pt_no")).toBe("`pd`.`pt_no`");
});

test("limitSql: mysql LIMIT vs oracle ROWNUM wrap", () => {
  expect(limitSql("SELECT * FROM `t` WHERE 1=1", 10)).toBe("SELECT * FROM `t` WHERE 1=1 LIMIT 10");
  expect(limitSql('SELECT * FROM "T" WHERE 1=1', 10, true)).toBe('SELECT * FROM (SELECT * FROM "T" WHERE 1=1) WHERE ROWNUM <= 10');
});
