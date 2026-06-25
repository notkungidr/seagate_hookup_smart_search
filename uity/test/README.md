# Smart Search E2E Test Suite

Playwright suite generated from [`../../test_cases.md`](../../test_cases.md).
Covers the five manual test cases (TC1–TC5) for the Seagate Hookup Smart
Search app.

## Layout

```
uity/test/
├── package.json
├── playwright.config.js
├── README.md
└── tests/
    ├── helpers.js               # shared selectors + boot/login/pivot utilities
    ├── tc1-initial-search.spec.js
    ├── tc2-manual-pivot.spec.js
    ├── tc3-save-template.spec.js
    ├── tc4-run-template.spec.js
    └── tc5-admin-control.spec.js
```

## One-time setup

```powershell
cd D:\seagate_hookup_smart_search\uity\test
npm install
npm run install:browsers     # downloads Chromium for Playwright
```

## Run prerequisites — both servers must already be up

The suite drives the **live** dev app, it does not mock anything.

In two separate terminals:

```powershell
# Terminal 1 — backend (port 9090)
cd D:\seagate_hookup_smart_search\backend
bun run dev

# Terminal 2 — frontend (port 5173, served under the prodline base path)
cd D:\seagate_hookup_smart_search\frontend
npm run dev
```

The default frontend URL the tests open is:

```
http://localhost:5173/prodline/seagate/hookup/hookup_smart_search/frontend/
```

Override with env vars if you're running elsewhere:

```powershell
$env:FRONTEND_BASE_URL = "http://localhost:5173/prodline/seagate/hookup/hookup_smart_search/frontend/"
$env:BACKEND_BASE_URL  = "http://localhost:9090"
```

## Run

```powershell
npm test                  # all 5 test cases, headless
npm run test:headed       # watch the browser drive the UI
npm run test:ui           # Playwright UI mode (best for debugging selectors)
npm run test:tc1          # one case at a time
npm run report            # open the HTML report from the last run
```

## Test case ↔ spec mapping

| Spec | Source in `test_cases.md` | What it covers |
|---|---|---|
| `tc1-initial-search.spec.js` | §1 Initial Search | Master table → column → operator → value → Search; asserts Step 1 row count (~9,216) |
| `tc2-manual-pivot.spec.js`   | §2 Manual Pivot Hops | TC1 then pivots Step 1 → Scan 2.1 → Scan 1; asserts row counts + edge labels |
| `tc3-save-template.spec.js`  | §3 Save current path | Builds a 3-step chain, opens the Save dialog, asserts S1/S2/S3 nodes, saves, verifies via API |
| `tc4-run-template.spec.js`   | §4 Run a template | Seeds a template via `POST /api/templates`, selects it in the UI, clicks Run Chain, asserts every step populates |
| `tc5-admin-control.spec.js`  | §5 Admin Control | Rejects EN `9999`, admits EN `0001`, opens Registry Manager. Shadow write/revert gated behind `RUN_DESTRUCTIVE=1` |

The destructive half of TC5 (writing then reverting a Dynamic Shadow on
`scan1`) is **skipped by default** because it mutates the SeagateDev DB.
Opt in explicitly:

```powershell
$env:RUN_DESTRUCTIVE = "1"
npm run test:tc5
```

## Idempotency / cleanup

- TC3 deletes the `WMS TRACE TEST E2E` template in `afterEach` via
  `DELETE /api/templates/:id`.
- TC4 seeds `WMS TRACE TEST RUN` in `beforeEach` and deletes it in
  `afterEach` — failure between hooks won't accumulate junk because the
  next `beforeEach` deletes any prior copy first.
- TC5's non-destructive half logs in as admin but does not save anything.

## Tunable inputs

The hard-coded search value `BITMRK2605078` and expected row counts
(`9,216` / `9,215`) come straight from `test_cases.md`. Production data
drifts over time, so the assertions allow ±5% tolerance and only require
`> 0` row counts as a baseline. If the lot has been purged or shifted
much further than that, edit the constants at the top of `tc1`/`tc2`/
`tc3`/`tc4` rather than weakening the assertions further.

## Selector strategy + maintenance

The Vue components have no `data-testid` attributes, so all locators are
text-based against the visible UI copy (Thai + English mixed). When the
UI copy changes, update the corresponding string in
`tests/helpers.js` — that file is the single source of truth for shared
selectors. Per-spec strings (template names, table labels, EN values)
stay inside each spec.

If a selector breaks:

1. Run `npm run test:ui` and use the picker to find the new locator.
2. Update `helpers.js` (shared) or the spec file (case-specific).
3. Re-run just that case with `npm run test:tcN`.

## Known limitations

- `pickColumn` / `pickOperator` in `helpers.js` index `el-select` controls
  positionally (`.el-select` nth match). If the search form layout ever
  grows another select above the conditions, the offsets need adjusting.
  A long-term fix would be to add `data-testid` to the form selects in
  `TraceabilityFlow.vue` and switch these helpers to attribute selectors.
- Row-count parsing uses a loose regex (`/([\d,]+)\s*(?:\/\s*[\d,]+)?\s*rows?/i`)
  that works for both `9,216 rows` and `9,216 / 9,216 rows`. If the
  stepper card copy changes format, update `rowCountForStep`.
- TC5's "EN 9999 is invalid, EN 0001 is admin" assumption matches the
  current seed data. If the admin seed changes, edit the constants at
  the top of `tc5-admin-control.spec.js`.
