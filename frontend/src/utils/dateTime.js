// ═══ วันที่/เวลา: heuristic + formatter กลาง (แชร์ทุกจุด — เดิมสำเนา 3 ที่ไม่ตรงกัน) ═══

function isExcludedUserStamp(normalized) {
  // user_reg/user_upd = รหัสพนักงาน ไม่ใช่วันที่
  return normalized.includes('user_reg') || normalized.includes('user_upd') || normalized.includes('userreg') || normalized.includes('userupd');
}

// คอลัมน์วันที่ทั้งหมด (DATE/DATETIME) — เช่น createDate, create_dt, scandate, reg
export function isDateColumnName(colName) {
  if (!colName) return false;
  const normalized = colName.toLowerCase();
  if (isExcludedUserStamp(normalized)) return false;
  return normalized.includes('date') || normalized.includes('time') || normalized.includes('crdt') || normalized === 'reg' || normalized === 'upd' || /dt$/.test(normalized);
}

// เฉพาะ DATETIME (ลงท้าย dt เช่น create_dt) — ใช้ picker ระดับเวลา HH:mm:ss
// (คอลัมน์ date/time ทั่วไปคง picker แบบวันที่เดิม)
export function isDateTimeColumnName(colName) {
  if (!colName) return false;
  const normalized = colName.toLowerCase();
  if (isExcludedUserStamp(normalized)) return false;
  return /dt$/.test(normalized);
}

// 2026-08-20T19:07:16.000Z → "2026-08-20 19:07:16" — ตัด T/Z ที่ระดับสตริง
// ponytail: ไม่ผ่าน new Date() เพื่อไม่ให้ browser แปลง timezone จนเวลาเลื่อน
export function fmtDateTime(v) {
  // defensive: Date object หลุดเข้ามา (เช่น cache เก่า / adapter อื่น) — แปลงตาม local timezone
  if (v instanceof Date) {
    const p = (n) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())} ${p(v.getHours())}:${p(v.getMinutes())}:${p(v.getSeconds())}`;
  }
  if (typeof v !== 'string' || v.length < 19 || v[10] !== 'T') return v;
  const d = v.slice(0, 10);
  const t = v.slice(11, 19);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && /^\d{2}:\d{2}:\d{2}$/.test(t) ? `${d} ${t}` : v;
}

// idempotent — เรียกซ้ำได้ (ค่าที่ format แล้วไม่มี T จะถูกข้าม)
export function fmtRowDates(row) {
  for (const k in row) row[k] = fmtDateTime(row[k]);
  return row;
}
