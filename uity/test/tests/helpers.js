// @ts-check
/**
 * Shared selectors + helpers for the Smart Search E2E suite.
 *
 * IMPORTANT: The Vue app has no data-testid attributes. All selectors below are
 * text-based against the live UI strings in TraceabilityFlow.vue,
 * QueryTemplatesPanel.vue, AdminLoginDialog.vue, and RegistryManagerDialog.vue.
 *
 * If a selector breaks because UI copy changed, update it here in ONE place.
 */

const BACKEND_BASE =
  process.env.BACKEND_BASE_URL || 'http://localhost:9090';

export const API = {
  base: BACKEND_BASE,
  tables: `${BACKEND_BASE}/api/tables`,
  search: `${BACKEND_BASE}/api/search`,
  pivot: `${BACKEND_BASE}/api/pivot`,
  templates: `${BACKEND_BASE}/api/templates`,
};

/**
 * Wait for the SPA to finish booting: the master "Search" button should be
 * visible and the table registry should have been fetched once.
 */
export async function bootApp(page) {
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  // Title from line 10 of TraceabilityFlow.vue
  await page.getByRole('heading', { name: 'Smart Pivot Search' }).waitFor();
  // Master "Search" button (TraceabilityFlow.vue line 268)
  await page.getByRole('button', { name: /Search$/ }).first().waitFor();
}

/**
 * Pick the master table in the left sidebar. `displayLabel` must match the
 * human-readable label registered in backend/src/config/tableRegistry.ts
 * (e.g. "WMS Lot Info", "Scan 1 (Unit Entry)", "Scan 2.1 (VMI / Final)").
 */
export async function pickMasterTable(page, displayLabel) {
  // The first el-select in the left panel is the table picker.
  const tableSelect = page.locator('.el-select').first();
  await tableSelect.click();
  await page.getByRole('option', { name: displayLabel, exact: true }).click();
}

/**
 * Pick a column for condition row #conditionIdx (0-based).
 */
export async function pickColumn(page, columnLabel, conditionIdx = 0) {
  // After the table-select, each condition row has its own column-select.
  // We grab all el-selects and offset by 1 (master table) + conditionIdx * 2.
  // This is fragile — adjust if the form layout changes.
  const selects = page.locator('.el-select');
  const colSelect = selects.nth(1 + conditionIdx * 2);
  await colSelect.click();
  await page.getByRole('option', { name: columnLabel, exact: true }).click();
}

/**
 * Pick an operator for condition row #conditionIdx (0-based).
 * Valid labels: "Like (contains)", "Exact (=)", "In list", "Between",
 *               ">= (gte)", "<= (lte)".
 */
export async function pickOperator(page, operatorLabel, conditionIdx = 0) {
  const selects = page.locator('.el-select');
  const opSelect = selects.nth(1 + conditionIdx * 2 + 1);
  await opSelect.click();
  await page.getByRole('option', { name: operatorLabel, exact: true }).click();
}

/**
 * Fill the single-value input on condition row #conditionIdx.
 */
export async function fillValue(page, value, conditionIdx = 0) {
  // Each row contains exactly one visible value input when operator is
  // like/eq/gte/lte. The N-th visible input on the page is conditionIdx.
  const inputs = page.locator(
    '.search-conditions .el-input__inner, .search-conditions input',
  );
  await inputs.nth(conditionIdx).fill(value);
}

export async function clickMasterSearch(page) {
  await page.getByRole('button', { name: /^\s*🔍?\s*Search\s*$/i }).click();
}

/**
 * Wait for a Step card to appear in the right-hand stepper.
 * stepIdx is 1-based to match the UI ("Step 1", "Step 2", ...).
 */
export async function waitForStep(page, stepIdx) {
  await page
    .locator('.step-card, .stepper-card', { hasText: `Step ${stepIdx}` })
    .first()
    .waitFor({ timeout: 60_000 });
}

/**
 * Extract the "<n>" row-count number from a Step card header, e.g.
 * "Step 1 — WMS Lot Info — 9,216 rows" → 9216.
 */
export async function rowCountForStep(page, stepIdx) {
  const card = page
    .locator('.step-card, .stepper-card', { hasText: `Step ${stepIdx}` })
    .first();
  const text = await card.innerText();
  const m = text.match(/([\d,]+)\s*(?:\/\s*[\d,]+)?\s*rows?/i);
  if (!m) throw new Error(`No row count found on Step ${stepIdx}: ${text}`);
  return Number(m[1].replace(/,/g, ''));
}

/**
 * Click the green pivot button on Step N for the column with label `columnLabel`,
 * then choose the target table from the dropdown menu.
 */
export async function pivotStep(page, stepIdx, columnLabel, targetTableLabel) {
  const card = page
    .locator('.step-card, .stepper-card', { hasText: `Step ${stepIdx}` })
    .first();
  // Pivot buttons have text "<column> ➔" (e.g. "DCM (SN) ➔", "Lot ➔").
  await card.getByRole('button', { name: new RegExp(`${escapeRe(columnLabel)}\\s*➔`) }).click();
  await page.getByRole('menuitem', { name: targetTableLabel, exact: true }).click();
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Reset app state by clearing localStorage and reloading. Use in beforeEach if
 * tests need a clean slate (login session, cached templates, etc).
 */
export async function resetAppState(page) {
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
}

/**
 * Delete a saved template by name via the backend API. Used to clean up after
 * TC3 so re-runs don't accumulate "WMS TRACE TEST" duplicates.
 */
export async function deleteTemplateByName(request, name) {
  const list = await request.get(API.templates);
  if (!list.ok()) return;
  const items = await list.json();
  const matches = (items || []).filter((t) => t.name === name);
  for (const t of matches) {
    await request.delete(`${API.templates}/${t.id}`);
  }
}
