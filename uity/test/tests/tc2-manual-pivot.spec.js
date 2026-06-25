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
  rowCountForStep,
  pivotStep,
} from './helpers.js';

/**
 * Test Case 2 — Manual Pivot Hops
 * Source: test_cases.md §2
 *
 * Pre-condition: TC1 completed (Step 1 visible).
 * Steps:
 *   1. On Step 1 click "DCM (SN) ➔" → pick "Scan 2.1 (VMI / Final)"
 *   2. Step 2 should appear, ~9,216/9,216 rows, edge "Prod Lot ➔ Lot"
 *   3. On Step 2 click "Lot ➔" → pick "Scan 1 (Unit Entry)"
 *   4. Step 3 should appear, ~9,215/9,215 rows, edge "Hookup (SN) ➔ Hookup"
 */
test.describe('TC2 — Manual Pivot Hops', () => {
  test('pivots WMS → Scan 2.1 → Scan 1 and verifies row counts', async ({ page }) => {
    await bootApp(page);

    // ── Re-run TC1 prerequisite to get Step 1 on screen ────────────────────
    await pickMasterTable(page, 'WMS Lot Info');
    await pickColumn(page, 'DO No', 0);
    await pickOperator(page, 'Exact (=)', 0);
    await fillValue(page, 'BITMRK2605078', 0);
    await clickMasterSearch(page);
    await waitForStep(page, 1);

    // ── Hop 1: Step 1 → Step 2 via DCM (SN) ────────────────────────────────
    await pivotStep(page, 1, 'DCM (SN)', 'Scan 2.1 (VMI / Final)');
    await waitForStep(page, 2);
    const step2Rows = await rowCountForStep(page, 2);
    expect(step2Rows).toBeGreaterThan(0);
    expect(step2Rows).toBeGreaterThanOrEqual(Math.floor(9216 * 0.95));

    // Edge label between Step 1 and Step 2 should mention Prod Lot ➔ Lot
    await expect(
      page.locator('body').getByText(/Prod Lot.*Lot/i).first(),
    ).toBeVisible();

    // ── Hop 2: Step 2 → Step 3 via Lot ─────────────────────────────────────
    await pivotStep(page, 2, 'Lot', 'Scan 1 (Unit Entry)');
    await waitForStep(page, 3);
    const step3Rows = await rowCountForStep(page, 3);
    expect(step3Rows).toBeGreaterThan(0);
    // Expected ~9,215 per spec — allow ±5%
    expect(step3Rows).toBeGreaterThanOrEqual(Math.floor(9215 * 0.95));

    await expect(
      page.locator('body').getByText(/Hookup.*Hookup/i).first(),
    ).toBeVisible();
  });
});
