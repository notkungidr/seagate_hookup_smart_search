// @ts-check
import { test, expect } from '@playwright/test';
import { bootApp } from './helpers.js';

/**
 * Test Case 5 — Admin Control & Dynamic Shadowing
 * Source: test_cases.md §5
 *
 * Steps:
 *   1. Open "⚙️ ระบบจัดการ & การตั้งค่า" → "🗂️ จัดการ Chains & Tables"
 *      → Admin login dialog appears
 *   2. Enter EN "9999" (no permission) → expect rejection toast
 *   3. Enter EN "0001" (admin) → expect Toolbar "System Administrator"
 *      and the Registry Manager dialog opens
 *   4. Pick a static table (e.g. scan1), edit a link, click "Save Registry Config"
 *      → expect success toast + hot-reload
 *   5. Click the 🗑️ button next to scan1 under Dynamic → confirm → revert
 *
 * NOTE: Steps 4 and 5 mutate the Dynamic Shadow registry in the SeagateDev DB.
 * They are guarded behind `process.env.RUN_DESTRUCTIVE === '1'` to avoid
 * polluting production data unless explicitly opted in.
 */
test.describe('TC5 — Admin Control', () => {
  test('rejects unknown EN and admits EN 0001', async ({ page }) => {
    await bootApp(page);

    // ── Step 1: open settings menu → "จัดการ Chains & Tables" ─────────────
    // The top-right gear button opens an el-dropdown; we click its trigger
    // by its visible text.
    await page.getByRole('button', { name: /ระบบจัดการ|⚙️/i }).first().click();
    await page.getByRole('menuitem', { name: /จัดการ Chains & Tables/i }).click();

    // Admin login dialog appears
    const loginDialog = page
      .locator('.el-dialog__wrapper:visible, .el-overlay-dialog:visible')
      .filter({ hasText: /Employee Number|รหัสพนักงาน/i })
      .first();
    await expect(loginDialog).toBeVisible();

    // ── Step 2: invalid EN "9999" → expect rejection ──────────────────────
    const enInput = loginDialog.getByPlaceholder(/กรอกรหัสพนักงาน/i);
    await enInput.fill('9999');
    await loginDialog.getByRole('button', { name: /Verify EN|เข้าสู่ระบบ/i }).click();

    // Rejection surfaces as an ElMessage toast — match Thai or English copy
    await expect(
      page.locator('.el-message, .el-notification').getByText(/ไม่พบสิทธิ์|not.*permission|ไม่มีสิทธิ์|invalid/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Dialog should still be open
    await expect(loginDialog).toBeVisible();

    // ── Step 3: valid EN "0001" → admin access granted ────────────────────
    await enInput.fill('0001');
    await loginDialog.getByRole('button', { name: /Verify EN|เข้าสู่ระบบ/i }).click();

    // Login dialog closes
    await expect(loginDialog).toBeHidden({ timeout: 10_000 });

    // Toolbar shows admin badge
    await expect(
      page.getByText(/System Administrator|ผู้ดูแลระบบ/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Registry Manager dialog opens
    await expect(
      page
        .locator('.el-dialog__wrapper:visible, .el-overlay-dialog:visible')
        .filter({ hasText: /Registry|จัดการ Chains/i })
        .first(),
    ).toBeVisible();
  });

  test.describe('destructive (opt-in via RUN_DESTRUCTIVE=1)', () => {
    test.skip(
      process.env.RUN_DESTRUCTIVE !== '1',
      'set RUN_DESTRUCTIVE=1 to run shadow-write tests',
    );

    test('saves a shadow override on scan1 then reverts it', async ({ page }) => {
      await bootApp(page);

      // Login as admin
      await page.getByRole('button', { name: /ระบบจัดการ|⚙️/i }).first().click();
      await page.getByRole('menuitem', { name: /จัดการ Chains & Tables/i }).click();
      const loginDialog = page
        .locator('.el-dialog__wrapper:visible, .el-overlay-dialog:visible')
        .filter({ hasText: /Employee Number|รหัสพนักงาน/i })
        .first();
      await loginDialog.getByPlaceholder(/กรอกรหัสพนักงาน/i).fill('0001');
      await loginDialog.getByRole('button', { name: /Verify EN|เข้าสู่ระบบ/i }).click();
      await expect(loginDialog).toBeHidden({ timeout: 10_000 });

      const registry = page
        .locator('.el-dialog__wrapper:visible, .el-overlay-dialog:visible')
        .filter({ hasText: /Registry|จัดการ Chains/i })
        .first();
      await expect(registry).toBeVisible();

      // ── Step 4: pick scan1, save (no actual link mutation — we just exercise
      //          the persistence path) ────────────────────────────────────
      await registry.getByText('scan1', { exact: true }).first().click();
      await registry.getByRole('button', { name: /Save Registry Config|💾/i }).click();

      await expect(
        page.locator('.el-message').getByText(/บันทึก|success|saved/i).first(),
      ).toBeVisible({ timeout: 10_000 });

      // Close the dialog so we can see the sidebar
      await page.keyboard.press('Escape');

      // ── Step 5: revert via trash icon next to scan1 under Dynamic ─────
      const sidebar = page.locator('aside, .sidebar, .left-panel').first();
      const dynamicSection = sidebar.getByText(/Dynamic/i).first();
      await expect(dynamicSection).toBeVisible();

      const scan1Row = sidebar.locator('li, .row, .table-row', { hasText: 'scan1' }).first();
      await scan1Row.getByRole('button', { name: /🗑|delete|ลบ/i }).click();

      // Confirm el-message-box
      const confirmBox = page.locator('.el-message-box');
      await expect(confirmBox).toBeVisible();
      await confirmBox.getByRole('button', { name: /ยืนยัน|OK|Confirm/i }).click();

      await expect(
        page.locator('.el-message').getByText(/revert|คืนค่า|success/i).first(),
      ).toBeVisible({ timeout: 10_000 });
    });
  });
});
