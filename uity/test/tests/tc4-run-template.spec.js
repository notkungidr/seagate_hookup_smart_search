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
  API,
} from './helpers.js';

/**
 * Test Case 4 — Automated Template Run
 * Source: test_cases.md §4
 *
 * Strategy: seed a template directly via the backend API (so the test does
 * not depend on TC3 having succeeded), then drive the UI to select + run it.
 *
 * Steps:
 *   1. Pick template "WMS TRACE TEST RUN" from the templates dropdown
 *   2. Tweak a master condition (the date or lot)
 *   3. Click "Run Chain" → spinner overlay → all steps populate
 *   4. Verify every step ends with row_count > 0 (no Not Found)
 */
const TEMPLATE_NAME = 'WMS TRACE TEST RUN';

const TEMPLATE_PAYLOAD = {
  name: TEMPLATE_NAME,
  description: 'E2E seed for TC4',
  rootTable: 'wms_lot_info',
  rootColumn: 'doNo',
  rootOperator: 'eq',
  rootConditions: [
    { column: 'doNo', operator: 'eq', value: 'BITMRK2605078' },
  ],
  hops: [
    {
      fromColumnKey: 'dcmSn',
      fromStepIdx: 0,
      targetTable: 'scan21',
      targetColumn: 'lot',
    },
    {
      fromColumnKey: 'lot',
      fromStepIdx: 1,
      targetTable: 'scan1',
      targetColumn: 'hookup',
    },
  ],
  stepsChain: ['wms_lot_info', 'scan21', 'scan1'],
};

test.describe('TC4 — Run a saved template end-to-end', () => {
  test.beforeEach(async ({ request }) => {
    await deleteTemplateByName(request, TEMPLATE_NAME);
    const created = await request.post(API.templates, { data: TEMPLATE_PAYLOAD });
    expect(
      created.ok(),
      `seeding template via ${API.templates} should succeed`,
    ).toBeTruthy();
  });

  test.afterEach(async ({ request }) => {
    await deleteTemplateByName(request, TEMPLATE_NAME);
  });

  test('selects and runs a saved chain template, populating every step', async ({ page }) => {
    await bootApp(page);

    // ── Step 1: open the templates picker and choose our seeded template ──
    // The picker is rendered inside QueryTemplatesPanel; the template name
    // appears as a clickable item.
    const templateEntry = page.getByText(TEMPLATE_NAME, { exact: true }).first();
    await expect(templateEntry).toBeVisible({ timeout: 15_000 });
    await templateEntry.click();

    // After selection, the Master Chain Conditions editor appears.
    // We accept either Thai or English heading text.
    await expect(
      page.getByText(/Master Chain Conditions|เงื่อนไข|Master Conditions/i).first(),
    ).toBeVisible();

    // ── Step 2: tweak a condition value (optional but per the spec) ───────
    // Find the first input inside the Master Chain Conditions editor and
    // overwrite its value. We re-use the seeded value to keep the assertion
    // deterministic.
    const masterConditionInput = page
      .locator('.master-chain-conditions input, .qt-master-conditions input')
      .first();
    if (await masterConditionInput.count()) {
      await masterConditionInput.fill('BITMRK2605078');
    }

    // ── Step 3: click "Run Chain" ────────────────────────────────────────
    await page.getByRole('button', { name: /Run Chain/i }).click();

    // ── Step 4: wait for all 3 steps to populate ─────────────────────────
    await waitForStep(page, 1);
    await waitForStep(page, 2);
    await waitForStep(page, 3);

    // No step should display "Not Found" / "ไม่พบข้อมูล"
    const notFound = await page
      .locator('.step-card, .stepper-card')
      .getByText(/Not Found|ไม่พบ/i)
      .count();
    expect(notFound, 'no step should be empty').toBe(0);

    // All step cards should show a non-zero row count.
    const cards = page.locator('.step-card, .stepper-card');
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < cardCount; i++) {
      const text = await cards.nth(i).innerText();
      const m = text.match(/([\d,]+)\s*(?:\/\s*[\d,]+)?\s*rows?/i);
      if (m) {
        const n = Number(m[1].replace(/,/g, ''));
        expect(n, `step ${i + 1} row count`).toBeGreaterThan(0);
      }
    }
  });
});
