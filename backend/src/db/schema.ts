import {
  mysqlTable,
  bigint,
  varchar,
  date,
  time,
  datetime,
  text,
  decimal,
  tinyint,
} from "drizzle-orm/mysql-core";

// ============================================================
// Table 1: scan1
// Fields: id, hookup, pcca, 2D_eblock, date, time, en
// ============================================================
export const scan1 = mysqlTable("scan1", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  hookup: varchar("hookup", { length: 100 }),
  pcca: varchar("pcca", { length: 100 }),
  eblock2D: varchar("2D_eblock", { length: 100 }),
  date: varchar("date", { length: 20 }),
  time: varchar("time", { length: 20 }),
  en: varchar("en", { length: 50 }),
});

// ============================================================
// Table 2: scan1_map_aca_lot_bracket_lot
// Fields: id, hookup, pcca, aca_lot, bracket_lot, en, date, time
// KEY LINKAGES: hookup → all, aca_lot → soldering/soldering_laser
// ============================================================
export const scan1MapAcaLotBracketLot = mysqlTable("scan1_map_aca_lot_bracket_lot", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  hookup: varchar("hookup", { length: 100 }),
  pcca: varchar("pcca", { length: 100 }),
  acaLot: varchar("aca_lot", { length: 100 }),
  bracketLot: varchar("bracket_lot", { length: 100 }),
  en: varchar("en", { length: 50 }),
  date: varchar("date", { length: 20 }),
  time: varchar("time", { length: 20 }),
});

// ============================================================
// Table 3: scan1_dispensing (SCAn1_DISPENSING)
// Fields: ID, M_ID, LOT, DCM(=hookup), BONDING_FIXTURE, DATE, TIME, EN, TYPE
// NOTE: LOT is dispensing's own lot — NOT aca_lot/bracket_lot
// ============================================================
export const scan1Dispensing = mysqlTable("SCAN1_DISPENSING", {
  id: bigint("ID", { mode: "number" }).primaryKey(),
  mId: varchar("M_ID", { length: 100 }),
  lot: varchar("LOT", { length: 100 }),
  dcm: varchar("DCM", { length: 100 }), // = hookup (SN หลัก)
  bondingFixture: varchar("BONDING_FIXTURE", { length: 100 }),
  date: varchar("DATE", { length: 20 }),
  time: varchar("TIME", { length: 20 }),
  en: varchar("EN", { length: 50 }),
  type: varchar("TYPE", { length: 50 }),
});

// ============================================================
// Table 4: scan21
// Fields: lot, hookup, tray, pack, pc, sc, vc, ac, date, time, en, en_vmi2, en_scan2
// ============================================================
export const scan21 = mysqlTable("scan21", {
  lot: varchar("lot", { length: 100 }),
  hookup: varchar("hookup", { length: 100 }),
  tray: varchar("tray", { length: 100 }),
  pack: varchar("pack", { length: 100 }),
  pc: varchar("pc", { length: 50 }),
  sc: varchar("sc", { length: 50 }),
  vc: varchar("vc", { length: 50 }),
  ac: varchar("ac", { length: 50 }),
  date: varchar("date", { length: 20 }),
  time: varchar("time", { length: 20 }),
  en: varchar("en", { length: 50 }),
  enVmi2: varchar("en_vmi2", { length: 50 }),
  enScan2: varchar("en_scan2", { length: 50 }),
});

// ============================================================
// Table 5: soldering
// Fields: id, hookup, en, date, time, bending, fixture_no, aca_lot, damper, barcode
// KEY LINKAGES: hookup → all, aca_lot → scan1_map/soldering_laser
// ============================================================
export const soldering = mysqlTable("soldering", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  hookup: varchar("hookup", { length: 100 }),
  en: varchar("en", { length: 50 }),
  date: varchar("date", { length: 20 }),
  time: varchar("time", { length: 20 }),
  bending: varchar("bending", { length: 100 }),
  fixtureNo: varchar("fixture_no", { length: 100 }),
  acaLot: varchar("aca_lot", { length: 100 }),
  damper: varchar("damper", { length: 100 }),
  barcode: varchar("barcode", { length: 100 }),
});

// ============================================================
// Table 6: soldering_laser
// Fields: id, hookup, laser_mc, bending, damper, aca_lot, date, time, barcode
// KEY LINKAGES: hookup → all, aca_lot → scan1_map/soldering
// ============================================================
export const solderingLaser = mysqlTable("soldering_laser", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  hookup: varchar("hookup", { length: 100 }),
  laserMc: varchar("laser_mc", { length: 100 }),
  bending: varchar("bending", { length: 100 }),
  damper: varchar("damper", { length: 100 }),
  acaLot: varchar("aca_lot", { length: 100 }),
  date: varchar("date", { length: 20 }),
  time: varchar("time", { length: 20 }),
  barcode: varchar("barcode", { length: 100 }),
});

// ============================================================
// Table 7: baking
// Fields: id, baking_type, baking_no, serial_no(=hookup), process,
//         baking_temperature, active, scan_in_dt, scan_in_by, baking_hour,
//         time_used, scan_out_dt, scan_out_by, baking_status,
//         updated_dt, updated_by, remark, lot_no
// KEY LINKAGES: serial_no = hookup
// ============================================================
export const baking = mysqlTable("BAKING", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  bakingType: varchar("baking_type", { length: 50 }),
  bakingNo: varchar("baking_no", { length: 50 }),
  serialNo: varchar("serial_no", { length: 100 }), // = hookup
  process: varchar("process", { length: 50 }),
  bakingTemperature: varchar("baking_temperature", { length: 20 }),
  active: varchar("active", { length: 5 }),
  scanInDt: datetime("scan_in_dt"),
  scanInBy: varchar("scan_in_by", { length: 100 }),
  bakingHour: varchar("baking_hour", { length: 20 }),
  timeUsed: datetime("time_used"),
  scanOutDt: datetime("scan_out_dt"),
  scanOutBy: varchar("scan_out_by", { length: 100 }),
  bakingStatus: varchar("baking_status", { length: 50 }),
  updatedDt: datetime("updated_dt"),
  updatedBy: varchar("updated_by", { length: 100 }),
  remark: text("remark"),
  lotNo: varchar("lot_no", { length: 100 }),
});

// ============================================================
// Table 8: bonding_fixture
// Fields: M_ID, DCM(=hookup), BONDING_FIXTURE, DATE, TIME, EN
// ============================================================
export const bondingFixture = mysqlTable("BONDING_FIXTURE", {
  mId: varchar("M_ID", { length: 100 }),
  dcm: varchar("DCM", { length: 100 }), // = hookup
  bondingFixture: varchar("BONDING_FIXTURE", { length: 100 }),
  date: varchar("DATE", { length: 20 }),
  time: varchar("TIME", { length: 20 }),
  en: varchar("EN", { length: 50 }),
});

// ============================================================
// Table 9: bonding_fixture_bearing
// Fields: ID, M_ID, lOT, DCM(=hookup), BONDING_FIXTURE, DATE, TIME, EN
// ============================================================
export const bondingFixtureBearing = mysqlTable("BONDING_FIXTURE_BEARING", {
  id: bigint("ID", { mode: "number" }).primaryKey(),
  mId: varchar("M_ID", { length: 100 }),
  lot: varchar("lOT", { length: 100 }),
  dcm: varchar("DCM", { length: 100 }), // = hookup
  bondingFixture: varchar("BONDING_FIXTURE", { length: 100 }),
  date: varchar("DATE", { length: 20 }),
  time: varchar("TIME", { length: 20 }),
  en: varchar("EN", { length: 50 }),
});

// ============================================================
// Table 10: ACA.ACA_SCAN1
// Fields: id, pt_no, serial_no, part_number_aca, part_number_eblock,
//         remark, store_lot, do_no, prod_lot, product_name, machine,
//         created_by, created_date, pt_ref
// KEY LINKAGE: serial_no = scan1.2D_eblock
// ============================================================
export const acaScan1 = mysqlTable("ACA_SCAN1", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  ptNo: varchar("pt_no", { length: 50 }),
  serialNo: varchar("serial_no", { length: 50 }),
  partNumberAca: varchar("part_number_aca", { length: 50 }),
  partNumberEblock: varchar("part_number_eblock", { length: 50 }),
  remark: text("remark"),
  storeLot: varchar("store_lot", { length: 100 }),
  doNo: varchar("do_no", { length: 50 }),
  prodLot: varchar("prod_lot", { length: 100 }),
  productName: varchar("product_name", { length: 255 }),
  machine: varchar("machine", { length: 100 }),
  createdBy: varchar("created_by", { length: 50 }),
  createdDate: datetime("created_date"),
  ptRef: varchar("pt_ref", { length: 255 }),
});

// ============================================================
// Table 11: saved_endpoints
// Fields: id, slug, name, description, config, created_at, updated_at
// ============================================================
export const savedEndpoints = mysqlTable("saved_endpoints", {
  id: varchar("id", { length: 100 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  config: text("config").notNull(),
  createdAt: varchar("created_at", { length: 50 }).notNull(),
  updatedAt: varchar("updated_at", { length: 50 }).notNull(),
});

// ============================================================
// Table 12: query_templates
// Fields: id, name, description, rootTable, rootColumn, rootOperator, rootConditions, hops, stepsChain, createdAt, updatedAt
// ============================================================
export const queryTemplates = mysqlTable("query_templates", {
  id: varchar("id", { length: 100 }).primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  rootTable: varchar("root_table", { length: 100 }).notNull(),
  rootColumn: varchar("root_column", { length: 100 }).notNull(),
  rootOperator: varchar("root_operator", { length: 20 }).default("like").notNull(),
  rootConditions: text("root_conditions"),
  hops: text("hops"),
  stepsChain: text("steps_chain"),
  favoriteColumns: text("favorite_columns"),
  createdAt: varchar("created_at", { length: 50 }).notNull(),
  updatedAt: varchar("updated_at", { length: 50 }).notNull(),
});

// ============================================================
// Table 13: registry_tables (Dynamic Registry tables list)
// Fields: id, table_name, label, connection_key, custom_sql, columns, is_active, created_at, updated_at
// ============================================================
export const registryTables = mysqlTable("registry_tables", {
  id: varchar("id", { length: 64 }).primaryKey(),
  tableName: varchar("table_name", { length: 100 }).notNull().unique(),
  label: varchar("label", { length: 200 }).notNull(),
  connectionKey: varchar("connection_key", { length: 50 }).notNull().default("seagate"),
  customSql: text("custom_sql"),
  columns: text("columns", { length: "long" }).notNull(), // LONGTEXT JSON Record<string, ColumnMeta>
  isActive: tinyint("is_active").notNull().default(1),
  createdAt: varchar("created_at", { length: 50 }).notNull(),
  updatedAt: varchar("updated_at", { length: 50 }).notNull(),
});

// ============================================================
// Table 14: registry_users (Database User Access Control list)
// Fields: en, name, permission, created_at, updated_at
// ============================================================
export const registryUsers = mysqlTable("registry_users", {
  en: varchar("en", { length: 50 }).primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  permission: varchar("permission", { length: 50 }).notNull().default("admin"),
  createdAt: varchar("created_at", { length: 50 }).notNull(),
  updatedAt: varchar("updated_at", { length: 50 }).notNull(),
});
