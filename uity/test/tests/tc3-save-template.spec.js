// @ts-check
import { test, expect } from '@playwright/test';
import {
  bootApp,
  pickMasterTable,
  pickColumn,
  pickOperator,
  fillValue,
  clickMasterSearch,
  waitForStep,
  pivotStep,
  deleteTemplateByName,
} from './helpers.js';

/**
 * Test Case 3 — Save Current Path as Template
 * Source: test_cases.md §3
 *
 * Pre-condition: a chain Step 1 → 2 → 3 is built.
 * Steps:
 *   1. Click "Save current path" → modal opens (Interactive Flow Architect)
 *   2. Verify the flow diagram is rendered (S1 → S2 → S3 nodes visible)
 *   3. Fill template name "WMS TRACE TEST E2E" + click "บันทึก"
 *   4. The new template should auto-load in the templates dropdown
 *
 * Cleanup: deletes the template via the API after the test so re-runs stay
 * idempotent.
 */
const TEMPLATE_NAME = 'WMS TRACE TEST E2E';

test.describe('TC3 — Save current path as Template', () => {
  test.afterEach(async ({ request }) => {
    await deleteTemplateByName(request, TEMPLATE_NAME);
  });

  test('captures the current chain as a template and reloads it', async ({ page, request }) => {
    // Pre-clean any leftover template with this name
    await deleteTemplateByName(request, TEMPLATE_NAME);

    await bootApp(page);

    // Build a 3-step chain (mirror TC1 + TC2)
    await pickMasterTable(page, 'WMS Lot Info');
    await pickColumn(page, 'DO No', 0);
    await pickOperator(page, 'Exact (=)', 0);
    await fillValue(page, 'BITMRK2605078', 0);
    await clickMasterSearch(page);
    await waitForStep(page, 1);

    await pivotStep(page, 1, 'DCM (SN)', 'Scan 2.1 (VMI / Final)');
    await waitForStep(page, 2);
    await pivotStep(page, 2, 'Lot', 'Scan 1 (Unit Entry)');
    await waitForStep(page, 3);

    // ── Step 1: open Save modal ────────────────────────────────────────────
    await page.getByRole('button', { name: /Save current path/i }).click();

    // Element Plus dialog with title "บันทึก Path เป็น Template"
    const dialog = page.locator('.el-dialog__wrapper:visible, .el-overlay-dialog:visible')
      .filter({ hasText: /บันทึก Path|Interactive Flow Architect/i })
      .first();
    await expect(dialog).toBeVisible();

    // ── Step 2: flow diagram rendered with S1/S2/S3 ───────────────────────
    // The Architect draws nodes labelled "S1" / "S2" / "S3" (or "Step 1" etc).
    // Match either form to be resilient to copy tweaks.
    await expect(dialog.getByText(/S1|Step 1/).first()).toBeVisible();
    await expect(dialog.getByText(/S2|Step 2/).first()).toBeVisible();
    await expect(dialog.getByText(/S3|Step 3/).first()).toBeVisible();

    // ── Step 3: fill name + save ──────────────────────────────────────────
    const nameInput = dialog.locator('input[type="text"], .el-input__inner').first();
    await nameInput.fill(TEMPLATE_NAME);
    await dialog.getByRole('button', { name: /^บันทึก$/ }).click();

    // Dialog should close
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    // ── Step 4: template auto-loaded in the templates picker ──────────────
    // The templates panel/select should now display the new name somewhere.
    await expect(page.getByText(TEMPLATE_NAME).first()).toBeVisible({
      timeout: 10_000,
    });

    // Sanity check via API: template exists in DB
    const list = await request.get('http://localhost:9090/api/templates');
    expect(list.ok()).toBeTruthy();
    const items = await list.json();
    const found = (items || []).find((t) => t.name === TEMPLATE_NAME);
    expect(found, 'template persisted to query_templates table').toBeTruthy();
    expect(found.rootTable).toBe('wms_lot_info');
    expect(Array.isArray(found.hops)).toBeTruthy();
    expect(found.hops.length).toBe(2);
  });
});
