# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Seagate Hookup Smart Search — production traceability tool for the Seagate ACA Line. Users pick a table + column, search for a value (Hookup SN, ACA Lot, DCM, etc.), then "pivot" through related tables to trace a unit's journey: Scan1 → Dispensing → Soldering → Baking → Scan2.1 → WMS shipment.

## Commands

**Backend** (`backend/`, Bun + Elysia + Drizzle):
- `cd backend && bun install`
- `bun run dev` — watch mode on port **9090** (override with `PORT=<n>`)
- `bun run start` — production
- Swagger UI auto-mounted at `GET /swagger`
- HTTPS: set `ENABLE_TLS=true` + cert env vars (`SSL_CERT_PATH`, `SSL_KEY_PATH`, `SSL_CA_PATH`). Defaults to `/etc/httpd/conf/ssl.crt/beltontechnology_com.*` (production box). Falls back to HTTP if certs missing.

**Frontend** (`frontend/`, Vue 3 + Vite + Element Plus):
- `cd frontend && npm install`
- `npm run dev` — Vite dev server
- `npm run build` / `npm run preview`

**No test suite, lint, or formatter** — `backend/src/check_*.ts` and `simulate_run.ts` are ad-hoc probes (`bun run <file>`), not a test harness.

## Architecture

Two-tier SPA: Vue frontend (`frontend/`) talks to Elysia HTTP API (`backend/src/index.ts`). All routes mounted under **both** `/api/*` and `/prodline/seagate/hookup/hookup_smart_search/api/*` (production reverse-proxy path — keep both working).

### Core API Endpoints

- `GET  /api/tables` — full table/column/link metadata (frontend caches once at boot)
- `GET  /api/distinct?table=&column=&search=&limit=` — autocomplete distinct values (default limit 200, returns `tooManyDistinct` flag)
- `POST /api/search` — search one table by `conditions[]` (operators: `like|eq|in|between|gte|lte`)
- `POST /api/pivot` — given `sourceValues[]` from previous result, query `targetTable.targetColumn`
- `GET|POST|PUT|DELETE /api/templates[/:id]` — CRUD for Query Templates (MySQL `query_templates` on SeagateDev pool)
- `GET|POST|PUT|DELETE /api/v1/endpoints[/:id]` — CRUD for Saved Endpoints (template + binding metadata: `allowedParams`, `paramBindings`, `visibleCols`)
- `GET|POST /api/v1/trace/:id?format=json|csv&<param>=<value>...` — runs saved endpoint's full pivot chain server-side, left-joins all steps via `EndpointService.combineSteps`, applies in-memory filtering, returns JSON or CSV. The "publish parameterized traceability query as stable URL" feature.

### Single Source of Truth: `backend/src/config/tableRegistry.ts`

Every table, searchable column, display label, and inter-table link lives in `TABLE_REGISTRY`. `searchService.ts` and `pivotService.ts` are generic — they call `getTableMeta(name)` and act on its `columns` map. To add a table or pivot path, edit the registry + `db/schema.ts`; **never hardcode** table names or joins in services.

Each column has `dbColumn` (physical, often UPPERCASE/snake_case) and a TS key (camelCase). `linksTo[].targetColumn` references the **TS key** in the target table's registry, not the physical name.

### MySQL Pools (`backend/src/db/client.ts`)

All wrapped with 120s hard timeout (`conn.destroy()` on socket) — respect this when adding queries. Primary pools:

1. **`db`** — host `sghu-db02`, DB `seagate`. Primary production data (Scan1, Soldering, Baking, Scan2.1, Bonding fixtures, etc.)
2. **`dbACA`** — same host, DB `ACA`
3. **`dbBitintra`** — host `bitintra-db02`, no default DB. Cross-DB queries
4. **`dbWMS`** — host `bitintra-db02`, DB `WMS`. WMS-specific queries (`SHIPMENTPALLET_BOX_PROD`, `SG_FGREC_DATA`)
5. **`dbSeagateDev`** — app-managed metadata tables: `query_templates`, `saved_endpoints`, `registry_users`. DDLs are auto-`CREATE TABLE IF NOT EXISTS`'d at server startup.

Additional pools available via `getDb(key)`: `dbHr`, `dbBIT`, `SGCOIL`. Virtual table `wms_lot_info` in registry has `drizzleTable: null` and custom branches in services that fan out to `dbBitintra` / `dbWMS`.

### Hard Constraints (MySQL 5.0.0)

- **Batch all `IN (...)` queries.** Codebase uses `BATCH_SIZE = 1000`, but docs mention safe batch is **100**. Confirm with user before changing.
- No window functions, no CTEs, no modern JSON. Keep queries simple.
- Table-name case must match physically: `SCAN1_DISPENSING`, `BONDING_FIXTURE`, `BONDING_FIXTURE_BEARING`, `BAKING` are UPPERCASE; `scan1`, `scan1_map_aca_lot_bracket_lot`, `scan21`, `soldering`, `soldering_laser` are lowercase.

### CamelCase vs snake_case Pivot (Resolved — Don't Re-introduce)

Drizzle returns rows keyed by **physical** column name (e.g. `BONDING_FIXTURE`, not `bondingFixture`). Search response includes `availablePivots[].fromDbColumn` — frontend must extract pivot source values using `row[pivot.fromDbColumn]`, not camelCase TS key. See `frontend/src/components/TraceabilityFlow.vue`.

### Credentials

DB credentials currently hardcoded in `backend/src/db/client.ts`. Known tech debt — don't "fix" by moving to `.env` without asking; other tooling may depend on current setup.

## Saved Query Templates (Frontend Feature)

`frontend/src/composables/useQueryTemplates.js` + `frontend/src/components/QueryTemplatesPanel.vue`. Users save Pivot path (Scan1 → Map → Soldering → Scan2.1 → ...) and replay it from single SN, fan-out via `/api/pivot` 100 values at a time. Templates persisted to MySQL via `/api/templates` CRUD endpoints (table `query_templates` on SeagateDev pool) — **not** localStorage. Old code/comments referencing localStorage are out of date.

Template shape:
```ts
interface QueryTemplate {
  id: string; name: string; description: string;
  createdAt: string; updatedAt?: string;
  rootTable: string;          // tableRegistry KEY
  rootColumn: string;         // column key (camelCase) — legacy/back-compat
  rootOperator?: 'like'|'eq';
  rootConditions?: any[];     // full multi-condition snapshot
  hops: { fromColumnKey, fromStepIdx, targetTable, targetColumn }[];
  stepsChain: string[];       // [rootTable, ...hops.map(h => h.targetTable)]
}
```

`hops[].fromStepIdx` is index of source step to pivot FROM (0 = root). Supports **branched chains** (Add Branch) where hop may originate from any prior step, not just previous one. Old templates without `fromStepIdx` fall back to `i` for backwards compat.

**Pivot Path vs Search Conditions stored separately** — chain (`hops[]`) is structure; `rootConditions[]` is default values for master/root table. When user picks template, `QueryTemplatesPanel` renders Master Chain Conditions Editor seeded from `rootConditions` so they can tweak date ranges, operators, IN-lists before Run Chain. Don't merge these concepts.

### Root Step Must Carry `.table` and `._searchConditions` (Resolved)

`doSearch` snapshots both onto `chainSteps[0]` at search time so `buildTemplateFromCurrentChain` reads the table/conditions that were actually searched, not live sidebar values.

### Branch Pivot Parent Lookup (Resolved)

When "Add Branch" used, `chainSteps[i]._pivotFromStepIdx` points to actual parent step. `buildTemplateFromCurrentChain` uses `_pivotFromStepIdx` to find correct parent table for `fromCol` lookup. `runTemplateChain` uses `hop.fromStepIdx` to pull source rows from correct prior step via `stepRows[]`/`stepTableKey[]` arrays instead of single `prevRows` cursor.

### shallowRef Auto-unwrap Pitfall (Resolved)

`chainSteps` in `TraceabilityFlow.vue` is `shallowRef([])`. When passed as prop, Vue auto-unwraps to raw array — `props.chainSteps.value = newArr` inside child **silently no-ops**. Fix: Composable's `runTemplateChain()` accepts `updateChainSteps(newSteps)` callback instead of shallowRef. Child emits `update:chainSteps`, parent does `@update:chain-steps="chainSteps = $event"`. One-way data flow. Keep this pattern when extending.

### 100-Batching Enforced on Frontend

Even though backend `pivotService.ts` batches internally (currently 1000), frontend chain executor caps every `/api/pivot` call at `PIVOT_BATCH_SIZE = 100` source values per request as defense-in-depth. Don't remove without aligning both layers.

## Saved API Endpoints (`/v1/endpoints` + `/v1/trace/:id`)

Separate from Query Templates. **Endpoint** is saved chain config (`EndpointConfig` in `backend/src/services/endpointService.ts`) published as stable callable URL:

- `EndpointConfig` shape: `rootTable`, `rootColumn`, `rootConditions[]`, `hops[]` (with optional `parentStepIdx` for branched chains), plus `paramBindings[]` (which step/column each URL query-param feeds), `visibleCols[]`, `allowedParams[]`.
- `GET /api/v1/trace/:id` filters incoming query string against `allowedParams[]` ∪ root-condition columns (case-insensitive), runs chain via `endpointService.runChain()`, performs in-memory left-join of all steps via `endpointService.combineSteps()`, applies substring/multi-value filtering, returns JSON or `format=csv`.
- `POST /api/v1/trace/:id` accepts JSON body + query params; arrays in body get joined with `\n` for multi-value IN-list filters.
- Frontend management UI: `frontend/src/components/ApiManagerDialog.vue`.

### Smart API Directory & RBAC (Added 2026-05-28)

`saved_endpoints` carries three extra columns auto-added on startup:
- `created_by` (VARCHAR 50) — Employee Number (EN) from `x-user-en` header
- `visibility` (VARCHAR 50, default `'public'`) — `'public'` or `'restricted'`
- `api_group` (VARCHAR 100, default `'General'`) — department/category label

Companion table `endpoint_permissions(endpoint_id, user_en, assigned_at)` stores per-EN grants for restricted endpoints (synced via `endpointService.syncAllowedUsers()`).

Route-level RBAC in `backend/src/index.ts`:
- `GET /v1/endpoints` — scopes list using `resolveViewer(headers)`. Admins see everything; non-admin users see `visibility='public'` ∪ their own ∪ granted via `endpoint_permissions`.
- `POST /v1/endpoints` — requires valid `x-user-en` (must exist in `registry_users`); EN recorded as `created_by`.
- `PUT|DELETE /v1/endpoints/:id` — require `permission='admin'` OR `createdBy === viewer.en`; else 403.
- `GET|POST /v1/trace/:id` — calls `endpointService.canViewerAccess(ep, viewer)`, returns 403 for restricted endpoints when caller not owner/admin/on allow-list.

Frontend bits:
- `TraceabilityFlow.vue` Save API dialog gains `apiGroup`, `visibility`, `allowedUsers` fields, sends `x-user-en` from `localStorage['sg_admin_user']`.
- `ApiManagerDialog.vue` adds group-filter pills, shows visibility + group tags, hides Delete button and Developer Code Integration tab for non-admin/non-owner viewers (read-only sandbox), exposes "Access Permissions" panel for admins/owners that PUTs `apiGroup`/`visibility`/`allowedUsers` back to `/v1/endpoints/:id`.

## Frontend Layout

`App.vue` is thin shell. Real surface in `frontend/src/components/`:
- `TraceabilityFlow.vue` — main search + pivot chain UI (largest component)
- `QueryTemplatesPanel.vue` — saved-templates sidebar/dialog
- `ApiManagerDialog.vue` — CRUD UI for `/v1/endpoints`
- `ExportOptionsDialog.vue` — Excel export (`xlsx` via `useExcelExport.js`)
- `FeatureGuideDialog.vue`, `PhilosophyDialog.vue` — in-app help/about

Composables in `frontend/src/composables/`:
- `useQueryTemplates.js` — template CRUD + `runTemplateChain()` executor
- `useChainTracker.js` — tracks live pivot chain state
- `useCombinedRows.js` — client-side left-join of chain steps for combined-rows view
- `useExcelExport.js` — `xlsx`-based workbook export


## Planned Features

### Multi-Column Pivot (Composite Key Joins)

**Current:** Pivot uses single-column WHERE (`targetCol IN (...values)`).  
**Need:** Some tables require multi-column WHERE for accurate joins — e.g., pivot to Bearing table needs `BONDING_FIXTURE` AND `DATE` together; WMS queries may need `LOT` AND `DCM`.

**Plan:**
1. **Registry:** Add optional `conditions?: Array<{fromCol, targetCol}>` to `TableLink` in `tableRegistry.ts`. If present, overrides single-column `fromColumn`/`targetColumn`.
   ```ts
   linksTo: [{
     targetTable: 'SEAGATE_BONDING_FIXTURE_BEARING_G1',
     targetColumn: 'bondingFixture',     // label for UI
     fromColumn: 'bondingFixture',
     conditions: [
       { fromCol: 'bondingFixture', targetCol: 'bondingFixture' },
       { fromCol: 'date', targetCol: 'date' }
     ]
   }]
   ```

2. **Pivot Service:** In `pivotService.ts`, if `link.conditions` exists, build composite WHERE using OR-chained tuples:
   ```sql
   SELECT * FROM target
   WHERE (col1=? AND col2=?) OR (col1=? AND col2=?) OR ...
   ```
   MySQL 5.0 doesn't support `WHERE (col1,col2) IN ((?,?),...)` — must use OR-chain. Safe batch: 100 rows × 2 cols = 200 params (< 1000 limit).

3. **Frontend:** 
   - `TraceabilityFlow.vue` displays multi-column chips in Available Pivots
   - Extract multiple source values when pivoting
   - `useQueryTemplates.js` saves/replays `hop.conditions[]` in template
   - `ApiManagerDialog.vue` supports multi-column param bindings in saved endpoints

4. **Backward Compatibility:** Single-column pivots (existing templates/endpoints) continue working — `conditions` is optional. No data migration needed.

**Status:** Planned, not implemented. Current codebase only supports single-column pivot.

## Behavior Rules
- **Verify Before Action:** Always read the relevant files and search the codebase (`grep_search`, `view_file`) before making any edits or writing new code.
- **No Guessing:** Never assume or guess that a function, variable, database column, component, or API endpoint exists. You must explicitly verify its presence in the codebase first.
- **Maintain Integrity:** Verify the active server and database configuration from the configuration files before executing queries or running tests.

## Reference Docs

`AI_DEVELOPER_GUIDE.md`, `DEVELOPER_GUIDE.md`, `AI_WORKFLOW.md`, `WORKFLOW.md`, `USER_MANUAL.md`, `NOTE.txt`, `imprement.md` (Query Templates redesign), `IMPLEMENTATION_PLAN.md`, `PROJECT_MAP.md`, `AGENTS.md`, `PROJECT_PROMPT_SETUP.md`, `SETUP.txt`, `README.md` contain deeper background, resolved-bug history, end-user workflow. `spec/` directory holds original Excel/SQL samples schema was reverse-engineered from. When these docs disagree with code (batch size, port, localStorage-vs-MySQL), **code is authoritative** — markdown files have drifted.
