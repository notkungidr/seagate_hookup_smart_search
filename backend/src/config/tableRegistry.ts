import {
  scan1,
  scan1MapAcaLotBracketLot,
  scan1Dispensing,
  scan21,
  soldering,
  solderingLaser,
  baking,
  bondingFixture,
  bondingFixtureBearing,
  acaScan1,
} from "../db/schema";
import type { DbKey } from "../db/client";

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface ColumnMeta {
  /** ชื่อ column จริงใน DB */
  dbColumn: string;
  /** ชื่อแสดงผลฝั่ง Frontend */
  label: string;
  /** ค้นหาแบบ LIKE ได้ไหม (ถ้า false จะใช้ = เท่านั้น) */
  searchable: boolean;
  /** ประเภทข้อมูล (text | date) */
  dataType?: "text" | "date";
  /** Column นี้ Link ไป Table อื่นได้ไหน */
  linksTo?: LinkTarget[];
}

export interface LinkTarget {
  /** ชื่อ Table ปลายทางที่จะ Pivot ไป */
  targetTable: string;
  /** Connection/Server ที่ targetTable อยู่ (เช่น ACA, HGSTACA, seagate) */
  targetServer?: string;
  /** Column บน targetTable ที่จะใช้ IN query */
  targetColumn: string;
  /** Label แสดงฝั่ง Frontend */
  label: string;
}

// ============================================================
// CUSTOM SQL CONFIG — สำหรับ Virtual/Cross-DB tables
// ============================================================

export interface CustomSqlConfig {
  /**
   * connection key ที่จะใช้ execute query
   * ชี้ไปที่ key ใน CONNECTION_CONFIGS ใน client.ts
   */
  connectionKey: DbKey;

  /**
   * สร้าง SQL string + params array สำหรับ IN query
   * values = unique source values (batch ละ ≤1000, กฎ MySQL 5.0.0)
   * dbCol  = ชื่อ column จริงใน DB ที่จะใช้ IN
   *
   * Return null เพื่อ skip Drizzle generic path (ใช้ sentinel pattern เช่น WMS multi-query)
   */
  buildQuery?: (values: string[], dbCol: string) => { sql: string; params: any[] } | null;

  /**
   * Optional: transform raw DB row → normalized output shape
   * ถ้าไม่กำหนด = ใช้ raw rows ตรงๆ
   */
  mapRow?: (row: any) => any;

  /**
   * Sentinel flag: ถ้า true = pivotService จะ delegate ไปหา special multi-query handler
   * ใช้กับ wms_lot_info ที่มี logic พิเศษ (2 sub-queries + enrichment)
   */
  multiQuery?: boolean;

  /**
   * ตัวระบุพิเศษสำหรับ multi-query sentinel
   * เช่น "wms" → pivotService รู้ว่าต้องเรียก _pivotWmsMulti()
   */
  multiQueryType?: string;
}

export interface TableMeta {
  /** ชื่อ Table จริงใน MySQL */
  tableName: string;
  database?: "seagate" | "ACA";
  /** Connection key ที่จะใช้ query (สำหรับ dynamic tables ที่ไม่ใช่ seagate/ACA) */
  connectionKey?: string;
  /** Drizzle Table Object (null = ใช้ raw SQL ผ่าน customSql) */
  drizzleTable: any;
  /** Label แสดงฝั่ง Frontend */
  label: string;
  /** รายการ Column พร้อม Metadata */
  columns: Record<string, ColumnMeta>;
  /**
   * NEW: Config สำหรับ virtual/cross-DB tables
   * ถ้ากำหนด → pivotService จะใช้ generic customSql handler แทน Drizzle path
   * ถ้าไม่กำหนด → ใช้ Drizzle generic path ตามเดิม
   */
  customSql?: CustomSqlConfig;
}

// ============================================================
// TABLE REGISTRY
// ลงทะเบียน Table, Column, และ Linkage ทั้งหมดในที่เดียว
//
// วิธีเพิ่ม Chain ใหม่:
//   - Table ธรรมดา (same server)  → เพิ่ม entry ที่นี่ + schema.ts
//   - Cross-DB / Virtual table    → เพิ่ม entry + customSql config ที่นี่ (ไม่แตะ pivotService!)
//   - Server ใหม่                 → เพิ่ม 1 entry ใน CONNECTION_CONFIGS ใน client.ts
// ============================================================
export const TABLE_REGISTRY: Record<string, TableMeta> = {

  scan1: {
    tableName: "scan1",
    label: "Scan 1 (Unit Entry)",
    drizzleTable: scan1,
    columns: {
      hookup: {
        dbColumn: "hookup", label: "Hookup (SN)", searchable: true,
        linksTo: [
          { targetTable: "scan1_map_aca_lot_bracket_lot", targetColumn: "hookup", label: "→ Map ACA/Bracket Lot" },
          { targetTable: "SCAN1_DISPENSING", targetColumn: "dcm", label: "→ Dispensing" },
          { targetTable: "scan21", targetColumn: "hookup", label: "→ Scan 2.1" },
          { targetTable: "soldering", targetColumn: "hookup", label: "→ Soldering" },
          { targetTable: "soldering_laser", targetColumn: "hookup", label: "→ Soldering Laser" },
          { targetTable: "BAKING", targetColumn: "serialNo", label: "→ Baking" },
          { targetTable: "BONDING_FIXTURE", targetColumn: "dcm", label: "→ Bonding Fixture" },
          { targetTable: "BONDING_FIXTURE_BEARING", targetColumn: "dcm", label: "→ Bonding Fixture Bearing" },
        ],
      },
      pcca: { dbColumn: "pcca", label: "PCCA", searchable: true },
      eblock2D: {
        dbColumn: "2D_eblock", label: "2D Eblock", searchable: true,
        linksTo: [
          { targetTable: "ACA_SCAN1", targetColumn: "acaSerialNo", label: "← ACA Scan 1 (Serial No)" },
        ],
      },
      en: { dbColumn: "en", label: "EN", searchable: true },
      date: { dbColumn: "date", label: "Date", searchable: true },
      time: { dbColumn: "time", label: "Time", searchable: false },
    },
  },

  scan1_map_aca_lot_bracket_lot: {
    tableName: "scan1_map_aca_lot_bracket_lot",
    label: "Scan 1 Map (ACA Lot / Bracket Lot)",
    drizzleTable: scan1MapAcaLotBracketLot,
    columns: {
      hookup: {
        dbColumn: "hookup", label: "Hookup (SN)", searchable: true,
        linksTo: [
          { targetTable: "scan1", targetColumn: "hookup", label: "→ Scan 1" },
          { targetTable: "SCAN1_DISPENSING", targetColumn: "dcm", label: "→ Dispensing" },
          { targetTable: "scan21", targetColumn: "hookup", label: "→ Scan 2.1" },
          { targetTable: "soldering", targetColumn: "hookup", label: "→ Soldering" },
          { targetTable: "soldering_laser", targetColumn: "hookup", label: "→ Soldering Laser" },
          { targetTable: "BAKING", targetColumn: "serialNo", label: "→ Baking" },
          { targetTable: "BONDING_FIXTURE", targetColumn: "dcm", label: "→ Bonding Fixture" },
          { targetTable: "BONDING_FIXTURE_BEARING", targetColumn: "dcm", label: "→ Bonding Fixture Bearing" },
        ],
      },
      pcca: { dbColumn: "pcca", label: "PCCA", searchable: true },
      acaLot: {
        dbColumn: "aca_lot", label: "ACA Lot", searchable: true,
        linksTo: [
          { targetTable: "soldering", targetColumn: "acaLot", label: "→ Soldering (ACA Lot)" },
          { targetTable: "soldering_laser", targetColumn: "acaLot", label: "→ Soldering Laser (ACA Lot)" },
        ],
      },
      bracketLot: { dbColumn: "bracket_lot", label: "Bracket Lot", searchable: true },
      en: { dbColumn: "en", label: "EN", searchable: true },
      date: { dbColumn: "date", label: "Date", searchable: true },
    },
  },

  SCAN1_DISPENSING: {
    tableName: "SCAN1_DISPENSING",
    label: "Scan 1 Dispensing",
    drizzleTable: scan1Dispensing,
    columns: {
      dcm: {
        dbColumn: "DCM", label: "DCM (SN)", searchable: true,
        linksTo: [
          { targetTable: "scan1", targetColumn: "hookup", label: "→ Scan 1" },
          { targetTable: "scan1_map_aca_lot_bracket_lot", targetColumn: "hookup", label: "→ Map ACA/Bracket Lot" },
          { targetTable: "scan21", targetColumn: "hookup", label: "→ Scan 2.1" },
          { targetTable: "soldering", targetColumn: "hookup", label: "→ Soldering" },
          { targetTable: "soldering_laser", targetColumn: "hookup", label: "→ Soldering Laser" },
          { targetTable: "BAKING", targetColumn: "serialNo", label: "→ Baking" },
        ],
      },
      mId: { dbColumn: "M_ID", label: "M_ID", searchable: true },
      lot: { dbColumn: "LOT", label: "Lot (Dispensing Own)", searchable: true },
      bondingFixture: { dbColumn: "BONDING_FIXTURE", label: "Bonding Fixture", searchable: true },
      en: { dbColumn: "EN", label: "EN", searchable: true },
      type: { dbColumn: "TYPE", label: "Type", searchable: true },
      date: { dbColumn: "DATE", label: "Date", searchable: true },
    },
  },

  scan21: {
    tableName: "scan21",
    label: "Scan 2.1 (VMI / Final)",
    drizzleTable: scan21,
    columns: {
      hookup: {
        dbColumn: "hookup", label: "Hookup (SN)", searchable: true,
        linksTo: [
          { targetTable: "scan1", targetColumn: "hookup", label: "→ Scan 1" },
          { targetTable: "scan1_map_aca_lot_bracket_lot", targetColumn: "hookup", label: "→ Map ACA/Bracket Lot" },
          { targetTable: "soldering", targetColumn: "hookup", label: "→ Soldering" },
          { targetTable: "soldering_laser", targetColumn: "hookup", label: "→ Soldering Laser" },
          { targetTable: "BAKING", targetColumn: "serialNo", label: "→ Baking" },
          { targetTable: "SCAN1_DISPENSING", targetColumn: "dcm", label: "→ Dispensing" },
          { targetTable: "BONDING_FIXTURE", targetColumn: "dcm", label: "→ Bonding Fixture" },
          { targetTable: "BONDING_FIXTURE_BEARING", targetColumn: "dcm", label: "→ Bonding Fixture Bearing" },
        ],
      },
      lot: {
        dbColumn: "lot",
        label: "Lot",
        searchable: true,
        linksTo: [
          { targetTable: "wms_lot_info", targetColumn: "prod_lot", label: "📦 → WMS Lot Info (Shipment/FGRec)" },
          { targetTable: "tl_info",      targetColumn: "tlSn",     label: "→ TL Info (Traveler Lot + PC)" },
        ]
      },
      tray: { dbColumn: "tray", label: "Tray", searchable: true },
      pack: { dbColumn: "pack", label: "Pack", searchable: true },
      en: { dbColumn: "en", label: "EN", searchable: true },
      enVmi2: { dbColumn: "en_vmi2", label: "EN VMI2", searchable: true },
      enScan2: { dbColumn: "en_scan2", label: "EN Scan2", searchable: true },
      date: { dbColumn: "date", label: "Date", searchable: true },
    },
  },

  soldering: {
    tableName: "soldering",
    label: "Soldering",
    drizzleTable: soldering,
    columns: {
      hookup: {
        dbColumn: "hookup", label: "Hookup (SN)", searchable: true,
        linksTo: [
          { targetTable: "scan1", targetColumn: "hookup", label: "→ Scan 1" },
          { targetTable: "scan1_map_aca_lot_bracket_lot", targetColumn: "hookup", label: "→ Map ACA/Bracket Lot" },
          { targetTable: "scan21", targetColumn: "hookup", label: "→ Scan 2.1" },
          { targetTable: "BAKING", targetColumn: "serialNo", label: "→ Baking" },
          { targetTable: "soldering_laser", targetColumn: "hookup", label: "→ Soldering Laser" },
          { targetTable: "SCAN1_DISPENSING", targetColumn: "dcm", label: "→ Dispensing" },
          { targetTable: "BONDING_FIXTURE", targetColumn: "dcm", label: "→ Bonding Fixture" },
          { targetTable: "BONDING_FIXTURE_BEARING", targetColumn: "dcm", label: "→ Bonding Fixture Bearing" },
        ],
      },
      acaLot: {
        dbColumn: "aca_lot", label: "ACA Lot", searchable: true,
        linksTo: [
          { targetTable: "scan1_map_aca_lot_bracket_lot", targetColumn: "acaLot", label: "→ Map ACA/Bracket Lot" },
          { targetTable: "soldering_laser", targetColumn: "acaLot", label: "→ Soldering Laser" },
        ],
      },
      en: { dbColumn: "en", label: "EN", searchable: true },
      bending: { dbColumn: "bending", label: "Bending", searchable: true },
      fixtureNo: { dbColumn: "fixture_no", label: "Fixture No", searchable: true },
      damper: { dbColumn: "damper", label: "Damper", searchable: true },
      barcode: { dbColumn: "barcode", label: "Barcode", searchable: true },
      date: { dbColumn: "date", label: "Date", searchable: true },
    },
  },

  soldering_laser: {
    tableName: "soldering_laser",
    label: "Soldering Laser",
    drizzleTable: solderingLaser,
    columns: {
      hookup: {
        dbColumn: "hookup", label: "Hookup (SN)", searchable: true,
        linksTo: [
          { targetTable: "scan1", targetColumn: "hookup", label: "→ Scan 1" },
          { targetTable: "scan1_map_aca_lot_bracket_lot", targetColumn: "hookup", label: "→ Map ACA/Bracket Lot" },
          { targetTable: "soldering", targetColumn: "hookup", label: "→ Soldering" },
          { targetTable: "BAKING", targetColumn: "serialNo", label: "→ Baking" },
          { targetTable: "scan21", targetColumn: "hookup", label: "→ Scan 2.1" },
          { targetTable: "SCAN1_DISPENSING", targetColumn: "dcm", label: "→ Dispensing" },
          { targetTable: "BONDING_FIXTURE", targetColumn: "dcm", label: "→ Bonding Fixture" },
          { targetTable: "BONDING_FIXTURE_BEARING", targetColumn: "dcm", label: "→ Bonding Fixture Bearing" },
        ],
      },
      acaLot: {
        dbColumn: "aca_lot", label: "ACA Lot", searchable: true,
        linksTo: [
          { targetTable: "scan1_map_aca_lot_bracket_lot", targetColumn: "acaLot", label: "→ Map ACA/Bracket Lot" },
          { targetTable: "soldering", targetColumn: "acaLot", label: "→ Soldering" },
        ],
      },
      laserMc: { dbColumn: "laser_mc", label: "Laser Machine", searchable: true },
      bending: { dbColumn: "bending", label: "Bending", searchable: true },
      damper: { dbColumn: "damper", label: "Damper", searchable: true },
      barcode: { dbColumn: "barcode", label: "Barcode", searchable: true },
      date: { dbColumn: "date", label: "Date", searchable: true },
    },
  },

  BAKING: {
    tableName: "BAKING",
    label: "Baking",
    drizzleTable: baking,
    columns: {
      serialNo: {
        dbColumn: "serial_no", label: "Serial No (SN)", searchable: true,
        linksTo: [
          { targetTable: "scan1", targetColumn: "hookup", label: "→ Scan 1" },
          { targetTable: "scan1_map_aca_lot_bracket_lot", targetColumn: "hookup", label: "→ Map ACA/Bracket Lot" },
          { targetTable: "scan21", targetColumn: "hookup", label: "→ Scan 2.1" },
          { targetTable: "soldering", targetColumn: "hookup", label: "→ Soldering" },
          { targetTable: "soldering_laser", targetColumn: "hookup", label: "→ Soldering Laser" },
          { targetTable: "SCAN1_DISPENSING", targetColumn: "dcm", label: "→ Dispensing" },
          { targetTable: "BONDING_FIXTURE", targetColumn: "dcm", label: "→ Bonding Fixture" },
          { targetTable: "BONDING_FIXTURE_BEARING", targetColumn: "dcm", label: "→ Bonding Fixture Bearing" },
        ],
      },
      bakingType: { dbColumn: "baking_type", label: "Baking Type", searchable: true },
      bakingNo: { dbColumn: "baking_no", label: "Baking No", searchable: true },
      process: { dbColumn: "process", label: "Process", searchable: true },
      bakingStatus: { dbColumn: "baking_status", label: "Baking Status", searchable: true },
      lotNo: { dbColumn: "lot_no", label: "Lot No", searchable: true },
      bakingTemperature: { dbColumn: "baking_temperature", label: "Temperature", searchable: false },
      scanInBy: { dbColumn: "scan_in_by", label: "Scan In By", searchable: true },
      scanOutBy: { dbColumn: "scan_out_by", label: "Scan Out By", searchable: true },
    },
  },

  BONDING_FIXTURE: {
    tableName: "BONDING_FIXTURE",
    label: "Bonding Fixture",
    drizzleTable: bondingFixture,
    columns: {
      dcm: {
        dbColumn: "DCM", label: "DCM (SN)", searchable: true,
        linksTo: [
          { targetTable: "scan1", targetColumn: "hookup", label: "→ Scan 1" },
          { targetTable: "scan1_map_aca_lot_bracket_lot", targetColumn: "hookup", label: "→ Map ACA/Bracket Lot" },
          { targetTable: "scan21", targetColumn: "hookup", label: "→ Scan 2.1" },
          { targetTable: "soldering", targetColumn: "hookup", label: "→ Soldering" },
          { targetTable: "soldering_laser", targetColumn: "hookup", label: "→ Soldering Laser" },
          { targetTable: "BAKING", targetColumn: "serialNo", label: "→ Baking" },
        ],
      },
      mId: { dbColumn: "M_ID", label: "M_ID", searchable: true },
      bondingFixture: { dbColumn: "BONDING_FIXTURE", label: "Bonding Fixture", searchable: true },
      en: { dbColumn: "EN", label: "EN", searchable: true },
      date: { dbColumn: "DATE", label: "Date", searchable: true },
    },
  },

  BONDING_FIXTURE_BEARING: {
    tableName: "BONDING_FIXTURE_BEARING",
    label: "Bonding Fixture Bearing",
    drizzleTable: bondingFixtureBearing,
    columns: {
      dcm: {
        dbColumn: "DCM", label: "DCM (SN)", searchable: true,
        linksTo: [
          { targetTable: "scan1", targetColumn: "hookup", label: "→ Scan 1" },
          { targetTable: "scan1_map_aca_lot_bracket_lot", targetColumn: "hookup", label: "→ Map ACA/Bracket Lot" },
          { targetTable: "scan21", targetColumn: "hookup", label: "→ Scan 2.1" },
          { targetTable: "soldering", targetColumn: "hookup", label: "→ Soldering" },
          { targetTable: "soldering_laser", targetColumn: "hookup", label: "→ Soldering Laser" },
          { targetTable: "BAKING", targetColumn: "serialNo", label: "→ Baking" },
        ],
      },
      mId: { dbColumn: "M_ID", label: "M_ID", searchable: true },
      lot: { dbColumn: "lOT", label: "Lot", searchable: true },
      bondingFixture: { dbColumn: "BONDING_FIXTURE", label: "Bonding Fixture", searchable: true },
      en: { dbColumn: "EN", label: "EN", searchable: true },
      date: { dbColumn: "DATE", label: "Date", searchable: true },
    },
  },

  ACA_SCAN1: {
    tableName: "ACA_SCAN1",
    database: "ACA",
    label: "ACA Scan 1",
    drizzleTable: acaScan1,
    columns: {
      acaSerialNo: {
        dbColumn: "serial_no", label: "Serial No (2D Eblock)", searchable: true,
        linksTo: [
          { targetTable: "scan1", targetColumn: "eblock2D", label: "→ Hookup Scan 1 (2D Eblock)" },
        ],
      },
      ptNo: {
        dbColumn: "pt_no", label: "PT No", searchable: true,
        linksTo: [
          { targetTable: "ACA_BONDING_DATA", targetColumn: "ptNo", label: "→ ACA Bonding Data (PT No)" }
        ]
      },
      partNumberAca: { dbColumn: "part_number_aca", label: "Part Number ACA", searchable: true },
      partNumberEblock: { dbColumn: "part_number_eblock", label: "Part Number Eblock", searchable: true },
      storeLot: { dbColumn: "store_lot", label: "Store Lot", searchable: true },
      doNo: { dbColumn: "do_no", label: "DO No", searchable: true },
      prodLot: { dbColumn: "prod_lot", label: "Prod Lot", searchable: true },
      productName: { dbColumn: "product_name", label: "Product Name", searchable: true },
      machine: { dbColumn: "machine", label: "Machine", searchable: true },
      createdBy: { dbColumn: "created_by", label: "Created By", searchable: true },
      createdDate: { dbColumn: "created_date", label: "Created Date", searchable: true },
      ptRef: { dbColumn: "pt_ref", label: "PT Ref", searchable: true },
    },
  },

  // เพิ่ม chain ที่ข้ามเซิร์ฟเวอร์ หรือมี custom logic:
  //   → กำหนด customSql.connectionKey + buildQuery
  //   → pivotService จะ auto-dispatch ให้ generic handler
  //   → ไม่ต้องแตะ pivotService.ts เลย!
  // ============================================================

  ACA_BONDING_DATA: {
    tableName: "ACA_BONDING_DATA",
    database: "Bitintra" as any,
    label: "ACA Bonding Data",
    drizzleTable: null,
    // ── customSql config ─────────────────────────────────────
    // ก่อนหน้า: if (targetTable === "ACA_BONDING_DATA") { ... ~90 บรรทัดใน pivotService }
    // ตอนนี้: config อยู่ที่นี่ที่เดียว
    customSql: {
      connectionKey: "Bitintra",
      buildQuery: (values: string[], dbCol: string) => ({
        sql: `SELECT * FROM BIT.ACA_BONDING_DATA WHERE customer = 'Seagate:ACA' AND \`${dbCol}\` IN (${values.map(() => "?").join(",")})`,
        params: values,
      }),
    },
    columns: {
      ptNo: {
        dbColumn: "pt_no", label: "PT No", searchable: true,
        linksTo: [
          { targetTable: "ACA_SCAN1", targetColumn: "ptNo", label: "🔙 → ACA Scan 1 (PT No)" },
          { targetTable: "ACA_BONDING_DATA_2", targetColumn: "ptNo", label: "→ ACA Bonding Data 2 (PT No)" }
        ]
      },
      jobNo: { dbColumn: "job_no", label: "Job No", searchable: true },
      partNo: { dbColumn: "part_no", label: "Part No", searchable: true },
      mBitModel: { dbColumn: "m_bit_model", label: "Model (M BIT)", searchable: true },
      qty: { dbColumn: "qty", label: "Qty", searchable: true },
      rejectQty: { dbColumn: "reject_qty", label: "Reject Qty", searchable: true },
      remark: { dbColumn: "remark", label: "Remark", searchable: true },
      customer: { dbColumn: "customer", label: "Customer", searchable: true },
      shift: { dbColumn: "shift", label: "Shift", searchable: true },
      ovenNo: { dbColumn: "oven_no", label: "Oven No", searchable: true },
      reg: { dbColumn: "reg", label: "Registered Time", searchable: true },
      userReg: { dbColumn: "user_reg", label: "User Reg", searchable: true },
      upd: { dbColumn: "upd", label: "Updated Time", searchable: true },
      userUpd: { dbColumn: "user_upd", label: "User Upd", searchable: true },
      lotCoil: { dbColumn: "lot_coil", label: "Lot Coil", searchable: true },
      lotBobbin: { dbColumn: "lot_bobbin", label: "Lot Bobbin", searchable: true },
      lotAdhesive: { dbColumn: "lot_adhesive", label: "Lot Adhesive", searchable: true },
      lotTube: { dbColumn: "lot_tube", label: "Lot Tube", searchable: true },
      lotPin: { dbColumn: "lot_pin", label: "Lot Pin", searchable: true },
      lotSlit: { dbColumn: "lot_slit", label: "Lot Slit", searchable: true },
      mcNo: { dbColumn: "mc_no", label: "Machine No", searchable: true },
      enOperator: { dbColumn: "en_operator", label: "Operator EN", searchable: true },
      kambanCoil: { dbColumn: "kamban_coil", label: "Kamban Coil", searchable: true },
      kambanAdhesive: { dbColumn: "kamban_adhesive", label: "Kamban Adhesive", searchable: true },
      kambanBobbin: { dbColumn: "kamban_bobbin", label: "Kamban Bobbin", searchable: true },
      rack: { dbColumn: "rack", label: "Rack", searchable: true },
      reasonCode: { dbColumn: "reason_code", label: "Reason Code", searchable: true },
      roundCoil: { dbColumn: "round_coil", label: "Round Coil", searchable: true },
      roundAdhesive: { dbColumn: "round_adhesive", label: "Round Adhesive", searchable: true },
      roundBobbin: { dbColumn: "round_bobbin", label: "Round Bobbin", searchable: true },
    }
  },

  ACA_BONDING_DATA_2: {
    tableName: "ACA_BONDING_DATA_2",
    database: "Bitintra" as any,
    label: "ACA Bonding Data 2",
    drizzleTable: null,
    // ── customSql config ─────────────────────────────────────
    customSql: {
      connectionKey: "Bitintra",
      buildQuery: (values: string[], dbCol: string) => ({
        sql: `SELECT * FROM BIT.ACA_BONDING_DATA_2 WHERE customer = 'Seagate:ACA' AND \`${dbCol}\` IN (${values.map(() => "?").join(",")})`,
        params: values,
      }),
    },
    columns: {
      ptNo: {
        dbColumn: "pt_no", label: "PT No", searchable: true,
        linksTo: [
          { targetTable: "ACA_BONDING_DATA", targetColumn: "ptNo", label: "🔙 → ACA Bonding Data (PT No)" }
        ]
      },
      typeIn: { dbColumn: "type_in", label: "Type In", searchable: true },
      jobNo: { dbColumn: "job_no", label: "Job No", searchable: true },
      partNo: { dbColumn: "part_no", label: "Part No", searchable: true },
      mBitModel: { dbColumn: "m_bit_model", label: "Model (M BIT)", searchable: true },
      qty: { dbColumn: "qty", label: "Qty", searchable: true },
      rejectQty: { dbColumn: "reject_qty", label: "Reject Qty", searchable: true },
      customer: { dbColumn: "customer", label: "Customer", searchable: true },
      shift: { dbColumn: "shift", label: "Shift", searchable: true },
      ovenNo: { dbColumn: "oven_no", label: "Oven No", searchable: true },
      reg: { dbColumn: "reg", label: "Registered Time", searchable: true },
      userReg: { dbColumn: "user_reg", label: "User Reg", searchable: true },
      upd: { dbColumn: "upd", label: "Updated Time", searchable: true },
      userUpd: { dbColumn: "user_upd", label: "User Upd", searchable: true },
      enOperator: { dbColumn: "en_operator", label: "Operator EN", searchable: true },
      remark: { dbColumn: "remark", label: "Remark", searchable: true },
      typeOut: { dbColumn: "type_out", label: "Type Out", searchable: true },
      qtyOut: { dbColumn: "qty_out", label: "Qty Out", searchable: true },
      rejectQtyOut: { dbColumn: "reject_qty_out", label: "Reject Qty Out", searchable: true },
      regOut: { dbColumn: "reg_out", label: "Registered Time Out", searchable: true },
      userRegOut: { dbColumn: "user_reg_out", label: "User Reg Out", searchable: true },
      enOperatorOut: { dbColumn: "en_operator_out", label: "Operator EN Out", searchable: true },
      remarkOut: { dbColumn: "remark_out", label: "Remark Out", searchable: true },
      shiftOut: { dbColumn: "shift_out", label: "Shift Out", searchable: true },
      reasonCode: { dbColumn: "reason_code", label: "Reason Code", searchable: true },
    }
  },

  tl_info: {
    tableName: "tl_info",
    label: "TL Info (Traveler Lot + PC)",
    drizzleTable: null,
    // ── customSql config ─────────────────────────────────────
    // tl_info ต้องการ JOIN tl + pc บน seagate DB → ใช้ raw SQL
    customSql: {
      connectionKey: "seagate",
      buildQuery: (values: string[], dbCol: string) => ({
        sql: `SELECT tl.lot, tl.tl, tl.date, tl.time, tl.en, tl.lot_size, tl.flex, tl.pivot, tl.remark, tl.internal_remark, tl.sbr_no, tl.re_fg, tl.rtv, tl.pn_BIT, tl.preamp_name, tl.cus_type, tl.product_code, tl.digit5, tl.prefix, tl.pcca_part_no_rev, tl.dp460_lot, tl.stx_sbr, tl.arm, tl.eblock, tl.coil, tl.pccarev, pc.detail AS pc_detail, pc.model AS pc_model, pc.product_code AS pc_product_code FROM tl INNER JOIN pc ON pc.pn_BIT = tl.pn_BIT WHERE tl.\`${dbCol}\` IN (${values.map(() => "?").join(",")})`,
        params: values,
      }),
    },
    columns: {
      tlSn: {
        dbColumn: "tl", label: "TL (SN)", searchable: true,
        linksTo: [
          { targetTable: "scan21", targetColumn: "lot", label: "🔙 → Scan 2.1" },
        ],
      },
      lot: { dbColumn: "lot", label: "Lot", searchable: true },
      date: { dbColumn: "date", label: "Date", searchable: true },
      time: { dbColumn: "time", label: "Time", searchable: false },
      en: { dbColumn: "en", label: "EN", searchable: true },
      lotSize: { dbColumn: "lot_size", label: "Lot Size", searchable: false },
      flex: { dbColumn: "flex", label: "Flex", searchable: true },
      pivot: { dbColumn: "pivot", label: "Pivot", searchable: true },
      remark: { dbColumn: "remark", label: "Remark", searchable: true },
      internalRemark: { dbColumn: "internal_remark", label: "Internal Remark", searchable: true },
      sbrNo: { dbColumn: "sbr_no", label: "SBR No", searchable: true },
      reFg: { dbColumn: "re_fg", label: "Re FG", searchable: true },
      rtv: { dbColumn: "rtv", label: "RTV", searchable: true },
      pnBit: { dbColumn: "pn_BIT", label: "PN BIT", searchable: true },
      preampName: { dbColumn: "preamp_name", label: "Preamp Name", searchable: true },
      cusType: { dbColumn: "cus_type", label: "Customer Type", searchable: true },
      productCode: { dbColumn: "product_code", label: "Product Code", searchable: true },
      digit5: { dbColumn: "digit5", label: "Digit5", searchable: true },
      prefix: { dbColumn: "prefix", label: "Prefix", searchable: true },
      pccaPartNoRev: { dbColumn: "pcca_part_no_rev", label: "PCCA Part No Rev", searchable: true },
      dp460Lot: { dbColumn: "dp460_lot", label: "DP460 Lot", searchable: true },
      stxSbr: { dbColumn: "stx_sbr", label: "STX SBR", searchable: true },
      arm: { dbColumn: "arm", label: "Arm", searchable: true },
      eblock: { dbColumn: "eblock", label: "Eblock", searchable: true },
      coil: { dbColumn: "coil", label: "Coil", searchable: true },
      pccarev: { dbColumn: "pccarev", label: "PCCA Rev", searchable: true },
      pcDetail: { dbColumn: "pc_detail", label: "PC Detail", searchable: true },
      pcModel: { dbColumn: "pc_model", label: "PC Model", searchable: true },
      pcProductCode: { dbColumn: "pc_product_code", label: "PC Product Code", searchable: true },
    },
  },

  wms_lot_info: {
    tableName: "wms_lot_info",
    label: "📦 WMS Lot Info (Shipment / FGRec)",
    drizzleTable: null,
    // ── customSql config ─────────────────────────────────────
    // WMS ต้องการ 2 sub-queries + enrichment logic → ใช้ multiQuery sentinel
    // pivotService จะ detect multiQueryType === "wms" แล้ว delegate ไป _pivotWmsMulti()
    customSql: {
      connectionKey: "Bitintra",
      multiQuery: true,
      multiQueryType: "wms",
    },
    columns: {
      prod_lot: {
        dbColumn: "prod_lot", label: "Prod Lot", searchable: true,
        linksTo: [
          { targetTable: "scan21", targetColumn: "lot", label: "🔙 → Scan 2.1 (ย้อนกลับเข้า Line)" }
        ]
      },
      wms_source: { dbColumn: "wms_source", label: "WMS Source", searchable: true },
      store_lot: { dbColumn: "store_lot", label: "Store Lot", searchable: true },
      qty: { dbColumn: "qty", label: "Qty / Size", searchable: true },
      do_no: { dbColumn: "do_no", label: "DO No", searchable: true },
      plan_id: { dbColumn: "plan_id", label: "Plan ID", searchable: true },
      product_name: { dbColumn: "product_name", label: "Product Name", searchable: true },
      customer: { dbColumn: "customer", label: "Customer", searchable: true },
      receive_date: { dbColumn: "receive_date", label: "Receive Date", searchable: true },
      lot_status: { dbColumn: "lot_status", label: "Lot Status", searchable: true },
      item_no: { dbColumn: "item_no", label: "Item No", searchable: true },
      cust_pn: { dbColumn: "cust_pn", label: "Customer P/N", searchable: true },
      mt_no: { dbColumn: "mt_no", label: "Material No", searchable: true },
    },
  },

};

// ============================================================
// DYNAMIC REGISTRY CACHE (Phase 2)
// ============================================================
let _dynamicRegistry: Record<string, TableMeta> = {};

export function setDynamicRegistry(tables: Record<string, TableMeta>): void {
  _dynamicRegistry = tables;
}

export function getDynamicRegistry(): Record<string, TableMeta> {
  return _dynamicRegistry;
}

// ============================================================
// HELPER: ดึง Drizzle Table Object จากชื่อ Table (Dynamic shadows Static)
// ============================================================
export function getTableMeta(tableName: string): TableMeta | null {
  return _dynamicRegistry[tableName] ?? TABLE_REGISTRY[tableName] ?? null;
}

// ============================================================
// HELPER: แทน SELECT * ด้วย SELECT dbCol AS 'label'
// ============================================================
export function buildSelectClause(tableMeta: TableMeta): string {
  const cols = Object.values(tableMeta.columns)
    .map(col => {
      const escapedCol = col.dbColumn.includes(".")
        ? col.dbColumn.split(".").map(part => `\`${part.trim()}\``).join(".")
        : `\`${col.dbColumn}\``;
      return `${escapedCol} AS '${col.label}'`;
    })
    .join(", ");
  return cols || "*";
}

// ============================================================
// HELPER: แปลงคีย์ของ Row ในผลลัพธ์เป็น Label ที่กำหนดไว้
// ============================================================
export function mapRowToLabels(row: any, tableMeta: TableMeta): any {
  if (!row) return row;
  const mapped: Record<string, any> = {};
  
  // Safe helper to convert Node.js Buffer to clean UTF-8 string representation
  const cleanValue = (val: any) => {
    if (val && typeof val === "object" && Buffer.isBuffer(val)) {
      return val.toString("utf8");
    }
    return val;
  };
  
  // 1. Map known columns to their labels
  for (const [colKey, col] of Object.entries(tableMeta.columns)) {
    let val = undefined;
    if (row[col.label] !== undefined) {
      val = row[col.label];
    } else if (row[col.dbColumn] !== undefined) {
      val = row[col.dbColumn];
    } else if (row[colKey] !== undefined) {
      val = row[colKey];
    }
    
    if (val !== undefined) {
      mapped[col.label] = cleanValue(val);
    }
  }
  
  // 2. เก็บฟิลด์อื่นๆ ที่อยู่นอกเหนือจาก columns (เช่น virtual หรือ custom fields)
  for (const [k, v] of Object.entries(row)) {
    const isKnown = Object.entries(tableMeta.columns).some(([colKey, col]) => 
      col.dbColumn === k || colKey === k || col.label === k
    );
    if (!isKnown && mapped[k] === undefined) {
      mapped[k] = cleanValue(v);
    }
  }
  
  return mapped;
}

// ============================================================
// HELPER: สร้าง Response Summary สำหรับ GET /api/tables
// ============================================================
export function getTablesSummary() {
  // Return only dynamic tables from registry_tables
  // Static TABLE_REGISTRY is no longer exposed to frontend
  const dynamicEntries = Object.entries(_dynamicRegistry).map(([key, meta]) => ({
    key,
    tableName: meta.tableName,
    database: meta.connectionKey ?? meta.database ?? "seagate",
    connectionKey: meta.connectionKey ?? meta.database ?? "seagate",
    label: meta.label,
    isDynamic: true,
    columns: Object.entries(meta.columns).map(([colKey, col]) => ({
      key: colKey,
      dbColumn: col.dbColumn,
      label: col.label,
      searchable: col.searchable,
      dataType: col.dataType,
      linksTo: col.linksTo ?? [],
    })),
  }));

  return dynamicEntries;
}
