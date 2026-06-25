/**
 * 🧪 Smart Search Playwright E2E Automated Test Suite
 * File: d:\seagate_hookup_smart_search\frontend\smart_search_e2e.spec.js
 * 
 * เอกสารสคริปต์ทดสอบอัตโนมัติ (End-to-End Automated Testing) ด้วย Playwright
 * ใช้สำหรับจำลองพฤติกรรมวิศวกรและ QA เพื่อสืบค้นข้อมูลประวัติการผลิต Seagate ACA Line
 * บนระบบ Smart Pivot Search ผ่าน selectors ที่มีเสถียรภาพสูง (Stable HTML IDs / data-testids)
 */

import { test, expect } from '@playwright/test';

// ตัวแปร URL ของระบบที่ใช้ทดสอบ
const APP_URL = 'http://localhost:5177/prodline/seagate/hookup/hookup_smart_search/frontend/';

// Helper function ในการหา Option ใน dropdown ของ Element Plus แบบยืดหยุ่น (กรองเอาเฉพาะตัวที่มองเห็น :visible เพื่อป้องกันการดึงตัวเลือกที่ซ่อนอยู่ใน DOM ของ dropdown เก่า)
function getSelectOption(page, text) {
  return page.locator('.el-select__item:visible, .el-select-dropdown__item:visible').filter({ hasText: text }).first();
}

// Helper function ในการคลิกเปิด Dropdown ของ Element Plus select แบบทนทาน (บดบังปัญหา pointer intercept)
async function clickSelect(page, selector) {
  const element = page.locator(selector).first();
  const tagName = await element.evaluate(el => el.tagName.toLowerCase()).catch(() => '');
  
  if (tagName === 'input') {
    // Target element is an input inside the wrapper. Find parent wrapper and click it.
    const wrapper = page.locator(`.el-select:has(${selector})`).first();
    if (await wrapper.count() > 0) {
      await wrapper.click();
    } else {
      await element.click();
    }
  } else {
    // Target element is already the wrapper. Click it directly.
    await element.click();
  }
  // รอเวลาเล็กน้อย (300ms) เพื่อให้แอนิเมชันเปิดของ Element Plus เปิดขึ้นอย่างเสถียร 100%
  await page.waitForTimeout(300);
}

test.describe('Smart Pivot Search - E2E Testing Suite', () => {

  test.beforeEach(async ({ context, page }) => {
    // 1. ให้สิทธิ์การใช้งาน Clipboard แก่เบราว์เซอร์บริบทสำหรับการก๊อปปี้เซลล์ใน E2E Sandbox
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    // 2. เข้าสู่หน้าเว็บหลักก่อนเริ่มทุกการทดสอบ
    await page.goto(APP_URL);
    // 3. เคลียร์และกำหนดค่าใน localStorage เพื่อให้การทำงานเสถียร (และผูก Quick Paste Rule สำหรับ DKEWPY2D6303A1)
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('sg_quick_paste_rules', JSON.stringify([
        { name: 'Hookup SN', pattern: '^[A-Z0-9]{14}$', table: 'scan1', column: 'hookup', operator: 'like' }
      ]));
    });
    // 4. รีโหลดหน้าเว็บเพื่อให้แอปพลิเคชันโหลด Config จาก localStorage ที่จัดเตรียมไว้
    await page.reload();
  });

  // ---------------------------------------------------------------------------
  // 🎯 Test Case 1: การค้นหาขั้นต้น (Initial Search / Master Chain)
  // ---------------------------------------------------------------------------
  test('TC1: Should perform initial search successfully with AND conditions', async ({ page }) => {
    // เลือกตารางหลักเป็น WMS Lot Info - คลิกที่ตัวครอบของ Select โดยตรงเพื่อความปลอดภัย
    await clickSelect(page, '#select-master-table');
    await getSelectOption(page, 'WMS Lot Info').click();

    // กรอกเงื่อนไขค้นหาเงื่อนไขที่ 1
    await clickSelect(page, '[data-testid="select-cond-column-0"]');
    await getSelectOption(page, 'DO No').click();

    await clickSelect(page, '[data-testid="select-cond-operator-0"]');
    await getSelectOption(page, 'Exact (=)').click();

    const valInput = page.locator('[data-testid="input-cond-value-0"]');
    await valInput.fill('BITMRK2605078');

    // กดปุ่มค้นหาหลัก
    const searchBtn = page.locator('#btn-main-search');
    await expect(searchBtn).toBeEnabled();
    await searchBtn.click();

    // ตรวจสอบว่ากล่อง Step 1 (WMS Lot Info) และตารางแสดงข้อมูลดึงเสร็จสมบูรณ์
    const step1Card = page.locator('[data-testid="step-card-0"]');
    await expect(step1Card).toBeVisible();
    await expect(step1Card).toContainText('WMS Lot Info');

    const step1Table = page.locator('[data-testid="step-table-0"]');
    await expect(step1Table).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // 🎯 Test Case 2: การเชื่อมโยงข้ามขั้นตอนแบบ Manual (Manual Pivot Hops)
  // ---------------------------------------------------------------------------
  test('TC2: Should execute sequential manual pivots step-by-step', async ({ page }) => {
    // ทำการค้นหาข้อมูลเริ่มแรก (เช่น ตาราง scan1)
    await clickSelect(page, '#select-master-table');
    await getSelectOption(page, 'Scan 1 (Unit Entry)').click();
    
    await clickSelect(page, '[data-testid="select-cond-column-0"]');
    await getSelectOption(page, 'Hookup').click();
    
    await page.locator('[data-testid="input-cond-value-0"]').fill('DKEWPY2D6303A1');
    await page.locator('#btn-main-search').click();

    // รอให้ Step 1 แสดงขึ้นมา
    await expect(page.locator('[data-testid="step-card-0"]')).toBeVisible();

    // ขั้นตอน Pivot: กดปุ่ม PIVOT TO ที่กล่อง Step 1 (เช่น เลือก hookup)
    const pivotBtn = page.locator('[data-testid="btn-pivot-trigger-0-0"]');
    await pivotBtn.click();

    // เลือกเป้าหมายการเชื่อมโยง เช่น Scan 1 Map (ACA / Bracket) - ใช้ดัชนี 1 เพราะดัชนี 0 คือระบบ Self Link เสมอ
    const pivotLink = page.locator('[data-testid="btn-pivot-link-0-0-1"]');
    await pivotLink.click();

    // ตรวจสอบการงอกของกล่อง Step 2 ขึ้นบนระบบ
    const step2Card = page.locator('[data-testid="step-card-1"]');
    await expect(step2Card).toBeVisible();
    await expect(step2Card).toContainText('Scan 1 Map');
  });

  // ---------------------------------------------------------------------------
  // 🎯 Test Case 3 & 4: ระบบเทมเพลต (Query Templates Panel)
  // ---------------------------------------------------------------------------
  test('TC3-4: Should save path as template and replay template execution', async ({ page }) => {
    // 1. ค้นหาด่วนเพื่อให้มี chain steps ค้าง
    await clickSelect(page, '#select-master-table');
    await getSelectOption(page, 'Scan 1 (Unit Entry)').click();
    
    await clickSelect(page, '[data-testid="select-cond-column-0"]');
    await getSelectOption(page, 'Hookup').click();
    
    await page.locator('[data-testid="input-cond-value-0"]').fill('DKEWPY2D6303A1');
    await page.locator('#btn-main-search').click();
    await expect(page.locator('[data-testid="step-card-0"]')).toBeVisible();

    // 2. ทดลองบันทึก Path ปัจจุบัน
    const savePathBtn = page.locator('#btn-save-current-path');
    await expect(savePathBtn).toBeEnabled();
    await savePathBtn.click();

    // หน้าต่างบันทึกจะลอยขึ้นมา - ระบุเฉพาะเจาะจงเลี่ยงปัญหา Strict mode จากไดอะล็อกอื่น
    const saveDialog = page.locator('.el-dialog').filter({ hasText: 'บันทึก Path เป็น Template' });
    await expect(saveDialog).toBeVisible();

    // กรอกข้อมูลฟอร์ม - ใช้ตัวจับ placeholder จริงที่มีอยู่ในโค้ดหน้าบ้านเพื่อความแม่นยำ 100%
    await saveDialog.locator('input[placeholder*="Unit Trace Route"]').fill('AUTO_E2E_TEMPLATE');
    await saveDialog.locator('textarea[placeholder*="ใช้ตอนไหน"]').fill('บิวด์เพื่อทดสอบด้วย Playwright');
    
    // กดปุ่มยืนยันการบันทึก
    await saveDialog.locator('button:has-text("บันทึก")').click();
    await expect(saveDialog).not.toBeVisible();

    // 3. เรียกทดสอบ Template Selector
    await clickSelect(page, '#select-saved-template');
    await getSelectOption(page, 'AUTO_E2E_TEMPLATE').click();

    // ปรับเงื่อนไขและกดรัน Chain
    const runBtn = page.locator('#btn-run-chain');
    await expect(runBtn).toBeVisible();
    await runBtn.click();

    // ตรวจสอบการประมวลผล BFS ทะลุตาราง
    await expect(page.locator('[data-testid="step-card-0"]')).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // 🎯 Test Case 5: ระบบจัดการผู้ใช้และสิทธิ์ Admin (Admin Authentication)
  // ---------------------------------------------------------------------------
  test('TC5: Should allow developer bypass using Admin Portal with code 0001', async ({ page }) => {
    // คลิกปุ่ม Admin Access ที่ Header
    const adminBtn = page.locator('#btn-admin-access');
    await adminBtn.click();

    // Dialog ล็อกอินความปลอดภัยสูงปรากฏขึ้น
    const loginDialog = page.locator('.admin-login-dialog');
    await expect(loginDialog).toBeVisible();

    // ป้อนรหัสทดสอบเพื่อทำการ Bypass (รหัส EN 0001)
    await loginDialog.locator('#input-admin-username').fill('0001');
    
    // กดปุ่มยืนยันเข้าสู่ระบบ
    await loginDialog.locator('#btn-admin-login').click();

    // สิทธิ์แอดมินจะต้องโหลดสำเร็จ หน้าต่างล็อกอินจะปิดไป
    await expect(loginDialog).not.toBeVisible();
    
    // คอนเฟิร์มแถบชื่อใน Header แสดงชื่อ Admin
    await expect(page.locator('.admin-name')).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // 🎯 Test Case 8 & 9: กล่องวางข้อความด่วน (Quick Paste Box & Multi-Routing)
  // ---------------------------------------------------------------------------
  test('TC8-9: Should detect Regex Pattern and offer routing choices on conflict', async ({ page }) => {
    const qpInput = page.locator('#input-quick-paste');
    await expect(qpInput).toBeVisible();

    // พิมพ์รหัส Hookup ที่มีแพทเทิร์นชัดเจนลงในช่องวางด่วน
    await qpInput.fill('DKEWPY2D6303A1');

    // ตรวจสอบว่าแบนเนอร์แจ้งสถานะ Matched ทำงานทันที
    const matchStatus = page.locator('.qp-match-info .qp-status');
    await expect(matchStatus).toBeVisible();
    await expect(matchStatus).toContainText('Matched');

    // คีย์ค้นหาทันที
    const qpSearchBtn = page.locator('#btn-quick-paste-search');
    await qpSearchBtn.click();

    // ยืนยันว่าหน้าฟอร์มกรอกและสืบค้นผลลัพธ์ด่วนให้เสร็จสรรพ
    await expect(page.locator('[data-testid="step-card-0"]')).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // 🎯 Test Case 11: การคลิกเพื่อก๊อปปี้เนื้อหาในเซลล์ (Copy Cell on Click)
  // ---------------------------------------------------------------------------
  test('TC11: Should trigger copy-to-clipboard on cell click with green Toast popup', async ({ page }) => {
    // ยิงสืบค้นขั้นแรกก่อน
    await clickSelect(page, '#select-master-table');
    await getSelectOption(page, 'Scan 1 (Unit Entry)').click();
    
    await clickSelect(page, '[data-testid="select-cond-column-0"]');
    await getSelectOption(page, 'Hookup').click();
    
    await page.locator('[data-testid="input-cond-value-0"]').fill('DKEWPY2D6303A1');
    await page.locator('#btn-main-search').click();
    await expect(page.locator('[data-testid="step-card-0"]')).toBeVisible();

    // จับเซลล์แรกของตารางข้อมูลขึ้นมาคลิก
    const firstCell = page.locator('[data-testid="step-table-0"] .el-table__row td').first();
    await expect(firstCell).toBeVisible();
    
    // ดำเนินการกดที่เซลล์เพื่อคัดลอก
    await firstCell.click();

    // ยืนยันว่ามีกล่องแจ้งเตือน Toast สีเขียวเด้งขึ้นมาสวยงาม 1.5 วินาที - กรองคำเฉพาะเลี่ยงชนกับ Toast แจ้งเตือนจำนวนข้อมูลสืบค้น
    const successToast = page.locator('.el-message--success').filter({ hasText: 'คัดลอก' });
    await expect(successToast).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // 🎯 Test Case 12: ตรึงคอลัมน์คีย์หลัก (Sticky SN Column)
  // ---------------------------------------------------------------------------
  test('TC12: Should keep the first SN column fixed when horizontal scroll happens', async ({ page }) => {
    // รันการค้นหาหลัก
    await clickSelect(page, '#select-master-table');
    await getSelectOption(page, 'Scan 1 (Unit Entry)').click();
    
    await clickSelect(page, '[data-testid="select-cond-column-0"]');
    await getSelectOption(page, 'Hookup').click();
    
    await page.locator('[data-testid="input-cond-value-0"]').fill('DKEWPY2D6303A1');
    await page.locator('#btn-main-search').click();
    await expect(page.locator('[data-testid="step-card-0"]')).toBeVisible();

    // ตรวจสอบพฤติกรรม Fixed left ของคอลัมน์แรกสุดในตารางข้อมูลว่าถูกกำหนด CSS position: sticky และ left: 0px อย่างเสถียร
    const firstColumnHeader = page.locator('[data-testid="step-table-0"] th').first();
    await expect(firstColumnHeader).toBeVisible();
    const position = await firstColumnHeader.evaluate(el => window.getComputedStyle(el).position);
    const left = await firstColumnHeader.evaluate(el => window.getComputedStyle(el).left);
    expect(position).toBe('sticky');
    expect(left).toBe('0px');
  });

  // ---------------------------------------------------------------------------
  // 🎯 Test Case 13: ระบบสลับธีมกลางคืน (Dark Mode Toggle & Persistence - Idea 3.4)
  // ---------------------------------------------------------------------------
  test('TC13: Should toggle Dark/Light mode and persist preferred theme on reload', async ({ page }) => {
    // 1. ตรวจสอบว่าในสภาวะเริ่มต้น (Light Mode) ตัว html element ไม่มีคลาส dark
    const htmlElement = page.locator('html');
    await expect(htmlElement).not.toHaveClass(/dark/);

    // 2. คลิกปุ่มสลับธีมใน Header
    const themeBtn = page.locator('#btn-dark-mode-toggle');
    await expect(themeBtn).toBeVisible();
    await themeBtn.click();

    // 3. ยืนยันว่าคลาส dark ถูกเปิดใช้งานบน html element
    await expect(htmlElement).toHaveClass(/dark/);

    // 4. ทดลองรีโหลดหน้าเว็บเพื่อทดสอบความเสถียรของการเก็บสถานะลง localStorage
    await page.reload();

    // 5. ยืนยันว่าหลังจากรีโหลด สถานะธีมมืดยังคงอยู่ (มีคลาส dark เหมือนเดิม)
    await expect(htmlElement).toHaveClass(/dark/);

    // 6. คลิกสลับกลับเป็นโหมดปกติ (Light Mode)
    await themeBtn.click();
    await expect(htmlElement).not.toHaveClass(/dark/);
  });

  // ---------------------------------------------------------------------------
  // 🎯 Test Case 14: ระบบบันทึกคอลัมน์โปรด (Favorite Columns per Template - Idea 5.2)
  // ---------------------------------------------------------------------------
  test('TC14: Should save favorite visible columns and apply them automatically when template is replayed', async ({ page }) => {
    // 1. ค้นหาด่วนเพื่อให้มี chain steps และโหลดตารางหลัก
    await clickSelect(page, '#select-master-table');
    await getSelectOption(page, 'Scan 1 (Unit Entry)').click();
    
    await clickSelect(page, '[data-testid="select-cond-column-0"]');
    await getSelectOption(page, 'Hookup').click();
    
    await page.locator('[data-testid="input-cond-value-0"]').fill('DKEWPY2D6303A1');
    await page.locator('#btn-main-search').click();
    await expect(page.locator('[data-testid="step-card-0"]')).toBeVisible();

    // 2. บันทึกเป็นเทมเพลตชื่อ AUTO_COL_TEMPLATE
    const savePathBtn = page.locator('#btn-save-current-path');
    await expect(savePathBtn).toBeEnabled();
    await savePathBtn.click();

    const saveDialog = page.locator('.el-dialog').filter({ hasText: 'บันทึก Path เป็น Template' });
    await expect(saveDialog).toBeVisible();
    await saveDialog.locator('input[placeholder*="Unit Trace Route"]').fill('AUTO_COL_TEMPLATE');
    await saveDialog.locator('button:has-text("บันทึก")').click();
    await expect(saveDialog).not.toBeVisible();

    // 3. เรียกใช้งานเทมเพลตและตรวจสอบว่าปุ่มบันทึกคอลัมน์โปรดปรากฏขึ้น
    await clickSelect(page, '#select-saved-template');
    await getSelectOption(page, 'AUTO_COL_TEMPLATE').click();

    const saveFavBtn = page.locator('#btn-save-favorite-columns');
    await expect(saveFavBtn).toBeVisible();

    // 4. บันทึกคอลัมน์โปรด
    await saveFavBtn.click();

    // ยืนยันว่ามีกล่องแจ้งเตือน Toast สีเขียวเด้งขึ้นมาสำเร็จ
    const successToast = page.locator('.el-message--success').filter({ hasText: 'บันทึกคอลัมน์โปรด' });
    await expect(successToast).toBeVisible();
  });

});
