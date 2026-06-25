import { db } from "../db/client";
import { materialScans, solderingRecords, aoiTests, packagingRecords } from "../db/schema";
import { inArray } from "drizzle-orm";
import { BATCH_SIZE } from "../config/appConfig";

// กำหนดประเภทของ Response Step สำหรับ Frontend
export interface FlowStep {
  stepName: string;
  status: "success" | "warning" | "error" | "pending";
  operator: string | null;
  timestamp: string | null;
  details: Record<string, any>;
}

export interface SNTraceabilityResult {
  sn: string;
  steps: FlowStep[];
}

export class TraceabilityService {
  /**
   * ค้นหาและสร้างข้อมูล Flow การผลิตสำหรับ SN (เดี่ยว หรือ หลายรายการ)
   */
  async getTraceability(snInput: string | string[]): Promise<SNTraceabilityResult[]> {
    // 1. นำข้อมูล SN ทั้งหมดมาใส่ใน Array
    const snList = Array.isArray(snInput)
      ? snInput.map((sn) => sn.trim()).filter((sn) => sn.length > 0)
      : [snInput.trim()].filter((sn) => sn.length > 0);

    if (snList.length === 0) {
      return [];
    }

    // กำหนด Batch Size เพื่อความปลอดภัยของ Connection Pool และ Query Size (MySQL 5.0.0)
    const results: SNTraceabilityResult[] = [];

    // 2. แบ่งการทำงานเป็น Batch
    for (let i = 0; i < snList.length; i += BATCH_SIZE) {
      const batchSNs = snList.slice(i, i + BATCH_SIZE);
      const batchResult = await this.processBatch(batchSNs);
      for (let j = 0; j < batchResult.length; j++) {
        results.push(batchResult[j]);
      }
    }

    return results;
  }

  /**
   * ดึงข้อมูลและประมวลผลเป็นราย Batch โดยยิง Query ขนานด้วย Promise.all
   */
  private async processBatch(sns: string[]): Promise<SNTraceabilityResult[]> {
    if (sns.length === 0) return [];

    // 1. ยิง Query ไปทุกตารางการผลิตแบบ Parallel (ลด Latency ด้วย Promise.all)
    const [scans, solderings, tests, packagings] = await Promise.all([
      db
        .select()
        .from(materialScans)
        .where(inArray(materialScans.sn, sns)),
      db
        .select()
        .from(solderingRecords)
        .where(inArray(solderingRecords.sn, sns)),
      db
        .select()
        .from(aoiTests)
        .where(inArray(aoiTests.sn, sns)),
      db
        .select()
        .from(packagingRecords)
        .where(inArray(packagingRecords.sn, sns)),
    ]);

    // 2. จัดระเบียบข้อมูลเป็น Map ใน Memory (In-Memory Grouping)
    // การเข้าถึงข้อมูลด้วย Map [O(1)] จะเร็วกว่าการทำ Loop nested [O(N^2)] มหาศาล
    const scanMap = new Map<string, typeof scans[0]>();
    scans.forEach((row) => scanMap.set(row.sn, row));

    const solderMap = new Map<string, typeof solderings[0]>();
    solderings.forEach((row) => solderMap.set(row.sn, row));

    const testMap = new Map<string, typeof tests[0]>();
    tests.forEach((row) => testMap.set(row.sn, row));

    const packMap = new Map<string, typeof packagings[0]>();
    packagings.forEach((row) => packMap.set(row.sn, row));

    // 3. ประกอบข้อมูลผลลัพธ์เป็น Flow รูปแบบมาตรฐานสำหรับแต่ละ SN
    return sns.map((sn) => {
      const scanData = scanMap.get(sn);
      const solderData = solderMap.get(sn);
      const testData = testMap.get(sn);
      const packData = packMap.get(sn);

      const steps: FlowStep[] = [
        // Step 1: Material Scan
        {
          stepName: "Material Scan",
          status: scanData ? "success" : "pending",
          operator: scanData ? scanData.operatorName : null,
          timestamp: scanData ? scanData.scanTime.toISOString() : null,
          details: scanData
            ? {
                boardType: scanData.boardType,
              }
            : {},
        },
        // Step 2: Soldering
        {
          stepName: "Soldering",
          status: solderData ? "success" : "pending",
          operator: solderData ? solderData.machineId : null,
          timestamp: solderData ? solderData.solderTime.toISOString() : null,
          details: solderData
            ? {
                temperature: Number(solderData.temperature),
                conveyorSpeed: Number(solderData.conveyorSpeed),
              }
            : {},
        },
        // Step 3: AOI Test
        {
          stepName: "AOI Test",
          status: testData
            ? testData.result.toUpperCase() === "PASS"
              ? "success"
              : "error"
            : "pending",
          operator: testData ? testData.operatorName : null,
          timestamp: testData ? testData.testTime.toISOString() : null,
          details: testData
            ? {
                result: testData.result,
                defectDetails: testData.defectDetails || "No defect",
              }
            : {},
        },
        // Step 4: Packaging
        {
          stepName: "Packaging",
          status: packData ? "success" : "pending",
          operator: packData ? packData.operatorName : null,
          timestamp: packData ? packData.packTime.toISOString() : null,
          details: packData
            ? {
                boxId: packData.boxId,
              }
            : {},
        },
      ];

      return {
        sn,
        steps,
      };
    });
  }
}
