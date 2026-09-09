// ponytail: self-check เดียวที่พังถ้า sibling-branch fan-out กลับมาเป็น cartesian
// run: node src/composables/useCombinedRows.test.mjs
import assert from 'node:assert';
import { shallowRef, ref, computed } from 'vue';
import { useCombinedRows } from './useCombinedRows.js';

// จำลอง chain จริงที่ระเบิด: S3 (พ่อ) แตกเป็น S4 กับ S6 (พี่น้อง)
//   S3 ACA_PACK_DETAIL   2 pack_id
//   S4 ACA_SCAN1         6 แถว  (3 ต่อ pack_id) ← master, แถวมากสุด
//   S6 ACA_PACK_DATA_SERIAL 4 แถว (2 ต่อ pack_id)
// cartesian = 6 x 2 = 12 แถว (ผิด)  |  ถูกต้อง = 6 แถว (grain ของ master)
const packDetail = [
  { 'Pack Id': 'P1', 'Pack Qty': 10 },
  { 'Pack Id': 'P2', 'Pack Qty': 20 },
];
const scan1 = [
  { 'Pack Id': 'P1', 'Serial No': 'A1' },
  { 'Pack Id': 'P1', 'Serial No': 'A2' },
  { 'Pack Id': 'P1', 'Serial No': 'A3' },
  { 'Pack Id': 'P2', 'Serial No': 'B1' },
  { 'Pack Id': 'P2', 'Serial No': 'B2' },
  { 'Pack Id': 'P2', 'Serial No': 'B3' },
];
const packDataSerial = [
  { 'Pack Id': 'P1', 'Box No': 'X1' },
  { 'Pack Id': 'P1', 'Box No': 'X2' },
  { 'Pack Id': 'P2', 'Box No': 'Y1' },
  { 'Pack Id': 'P2', 'Box No': 'Y2' },
];

const chainSteps = shallowRef([
  { _uid: 1, table: 'ACA_PACK_DETAIL', targetTable: 'ACA_PACK_DETAIL', rows: packDetail },
  {
    _uid: 2, table: 'ACA_SCAN1', targetTable: 'ACA_SCAN1', rows: scan1,
    _pivotFromStepIdx: 0, _joinFromDbColumn: 'Pack Id', _joinToColumn: 'Pack Id',
  },
  {
    _uid: 3, table: 'ACA_PACK_DATA_SERIAL', targetTable: 'ACA_PACK_DATA_SERIAL', rows: packDataSerial,
    _pivotFromStepIdx: 0, _joinFromDbColumn: 'Pack Id', _joinToColumn: 'Pack Id',
  },
]);

const tablesMeta = ref([
  { key: 'ACA_PACK_DETAIL', columns: [{ key: 'packId', dbColumn: 'PACK_ID', label: 'Pack Id' }] },
  { key: 'ACA_SCAN1', columns: [{ key: 'packId', dbColumn: 'PACK_ID', label: 'Pack Id' }] },
  { key: 'ACA_PACK_DATA_SERIAL', columns: [{ key: 'packId', dbColumn: 'PACK_ID', label: 'Pack Id' }] },
]);

const { combinedData, combinedFanOutSuppressed } = useCombinedRows({
  chainSteps,
  tablesMeta,
  getFilteredRows: (idx) => chainSteps.value[idx]?.rows ?? [],
  getGridColumns: (step) => Object.keys(step.rows[0] ?? {}),
});

const rows = combinedData.value;
assert.strictEqual(rows.length, 6, `sibling fan-out เป็น cartesian: ได้ ${rows.length} แถว ควรได้ 6 (grain ของ master)`);

// master grain ต้องอยู่ครบ — serial 6 ตัวไม่ซ้ำ (master = step idx 1 → prefix S2_)
const serials = rows.map((r) => r['S2_Serial No']).sort();
assert.deepStrictEqual(serials, ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'], 'master rows หาย/ซ้ำ');

// sibling ที่ถูกบีบต้องรายงานจำนวนที่ตัดทิ้ง (P1 x3 + P2 x3 = 6 แถว x ตัด 1 = 6)
assert.strictEqual(combinedFanOutSuppressed.value[2], 6, `ควรรายงานว่าตัด 6 match ได้ ${JSON.stringify(combinedFanOutSuppressed.value)}`);

// sibling ยังต้อง join ติด (ไม่ใช่ null ทิ้ง)
assert.ok(rows.every((r) => r['S3_Box No']), 'sibling column ควรมีค่าจาก match แรก');

// ทุกคอลัมน์ต้องมีป้าย S{N}_ รวม master — ไม่มีคอลัมน์เปลือย
const cols = Object.keys(rows[0]);
const bare = cols.filter((c) => !/^S\d+_/.test(c));
assert.deepStrictEqual(bare, [], `คอลัมน์ไม่มีป้าย S: ${bare.join(', ')}`);
assert.ok(cols.includes('S2_Pack Id'), `master ควร prefix S2_ — ได้ ${cols.join(', ')}`);
assert.ok(cols.includes('S1_Pack Qty'), 'root (step 1) ควร prefix S1_');

// colSteps/colOrigins ต้อง map ป้ายใหม่ (UI badge + favoriteColumns back-compat พึ่งตัวนี้)
const { combinedColSteps, combinedColOrigins } = useCombinedRows({
  chainSteps,
  tablesMeta,
  getFilteredRows: (idx) => chainSteps.value[idx]?.rows ?? [],
  getGridColumns: (step) => Object.keys(step.rows[0] ?? {}),
});
assert.strictEqual(combinedColSteps.value['S2_Serial No'], 1, 'colSteps ต้องชี้ step ของ master');
assert.strictEqual(combinedColOrigins.value['S2_Serial No'], 'Serial No', 'colOrigins ต้องคืนชื่อเดิม (favoriteColumns เก่าพึ่งตัวนี้)');

console.log('OK — 6 rows, master grain ครบ, suppressed 6, ทุกคอลัมน์มีป้าย S');
