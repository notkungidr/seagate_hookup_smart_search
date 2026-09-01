# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Seagate Hookup Smart Search — production traceability tool for the Seagate ACA Line. Users pick a table + column, search for a value (Hookup SN, ACA Lot, DCM, etc.), then "pivot" through related tables to trace a unit's journey: Scan1 → Dispensing → Soldering → Baking → Scan2.1 → WMS shipment.

## Commands

**Backend** (`backend/`, Bun + Elysia + Drizzle):
- `cd backend && bun install`
- `bun run dev` — watch mode on port **9090** (override with `PORT=<n>`)
- `bun run start` — production
- `bun test` — runs `src/services/endpointService.test.ts` (only test file; not a full suite)
- Swagger UI auto-mounted at `GET /swagger`
- Requires `backend/.env` (copy from `.env.example`) — supplies `DB_*` credentials
- HTTPS: set `ENABLE_TLS=true` + cert env vars (`SSL_CERT_PATH`, `SSL_KEY_PATH`, `SSL_CA_PATH`). Defaults to `/etc/httpd/conf/ssl.crt/beltontechnology_com.*` (production box). Falls back to HTTP if certs missing.

**Frontend** (`frontend/`, Vue 3 + Vite + Element Plus):
- `cd frontend && npm install`
- `npm run dev` — Vite dev server
- `npm run build` / `npm run preview`

**No lint or formatter** — `backend/src/check_*.ts` and `simulate_run.ts` are ad-hoc probes (`bun run <file>`), not a test harness.

## Architecture

Two-tier SPA: Vue frontend (`frontend/`) talks to Elysia HTTP API (`backend/src/index.ts`). All routes mounted under **both** `/api/*` and `/prodline/seagate/hookup/hookup_smart_search/api/*` (production reverse-proxy path — keep both working).

### Core API Endpoints

- `GET  /api/tables` — table/column/link metadata. **Reloads dynamic registry on every call** (keeps multiple server instances in sync)
- `GET  /api/config` — exposes `pivotBatchSize`
- `GET  /api/distinct?table=&column=&search=&limit=` — autocomplete distinct values (default limit 200, returns `tooManyDistinct` flag)
- `POST /api/search` — search one table by `conditions[]` (operators: `like|eq|in|between|gte|lte`)
- `POST /api/pivot` — given `sourceValues[]` from previous result, query `targetTable.targetColumn`
- `GET|POST|PUT|DELETE /api/templates[/:id]` — CRUD for Query Templates (MySQL `query_templates` on SeagateDev pool)
- `GET|POST|PUT|DELETE /api/v1/endpoints[/:id]` — CRUD for Saved Endpoints
- `GET|POST /api/v1/trace/:id?format=json|csv&<param>=<value>...` — runs saved endpoint's full pivot chain server-side, left-joins all steps via `EndpointService.combineSteps`, applies in-memory filtering, returns JSON or CSV
- `POST /api/registry/login`, `GET|POST|PUT|DELETE /api/registry/tables[/:id]`, `POST /api/registry/preview-columns|test-query|reload` (**preview-columns/test-query are admin-only** — they accept external SQL/connection keys), `GET|POST|PUT|DELETE /api/registry/users[/:en]` — Dynamic Registry management (see below)
- `GET|POST /api/registry/connections`, `PUT|DELETE /api/registry/connections/:id`, `POST /api/registry/connections/:id/test` — Dynamic DB Connections CRUD (all admin-only; see Connection Registry below)

### Table Registry: static + dynamic layers

Static source of truth: `backend/src/config/tableRegistry.ts` (`TABLE_REGISTRY`) — every built-in table, searchable column, display label, and inter-table link.

**Dynamic layer (Phase 2):** tables can also be added at runtime via the Registry Manager UI (`frontend/src/components/RegistryManagerDialog.vue`) and are persisted to `registry_tables` (SeagateDev pool, columns JSON-serialized `ColumnMeta` map, optional `custom_sql` JSON). `registryService.reloadDynamicRegistry()` hot-loads them into `_dynamicRegistry`; `getTableMeta()` checks **dynamic first, static second** — a dynamic table shadows a static one with the same name.

- `wms_lot_info` is seeded into `registry_tables` with `customSql: { multiQuery: true, multiQueryType: "wms" }` — `searchService` and `pivotService` have a generic customSql dispatcher plus a WMS-specific branch that fans out to `WMS.SHIPMENTPALLET_BOX_PROD` + `WMS.SG_FGREC_DATA` and merges rows with `wms_source` enrichment.
- `customSql.buildQuery` is the generic escape hatch for new custom tables — no service changes needed.

Each column has `dbColumn` (physical, often UPPERCASE/snake_case) and a TS key (camelCase). `linksTo[].targetColumn` references the **TS key** in the target table's registry, not the physical name. To add a built-in table or pivot path, edit `tableRegistry.ts` + `db/schema.ts`; **never hardcode** table names or joins in services.

### Row Shape: label-keyed (don't re-break)

Search/pivot SELECTs use `buildSelectClause()` → `dbCol AS '<label>'`, so returned rows are keyed by the column **label** (`mapRowToLabels` also tolerates dbColumn/TS-key fallbacks). `availablePivots[].fromDbColumn` now carries the **label** — frontend must extract pivot source values using `row[pivot.fromDbColumn]`, never a camelCase TS key. See `TraceabilityFlow.vue` (`sourceDbColumn = pivot.fromDbColumn`).

### MySQL Pools (`backend/src/db/client.ts`)

Credentials come from `.env` via `CONNECTION_CONFIGS` (`DB_SEAGATE_*`, `DB_BITINTRA_*`, `DB_WMS_*`, `DB_SEAGATEDEV_*`, `DB_SGCOIL_*`, `DB_SEAPRINT_*`, `DB_SOFT_*`, ...). All pools wrapped with a 120s hard timeout (`conn.destroy()` on socket) — respect this when adding queries. Pools are **lazy** (created on first `getDb(key)` call, cached). `getDb(key)`/`getRawPool(key)` accept any string key resolved via `resolveConnConfig(key)` — unknown keys throw a Thai error pointing to Registry Manager → Connections (not a crash).

Connection keys (via `getDb(key)` / exported consts): `seagate` (DB `seagate` — Scan1, Soldering, Baking, Scan2.1, Bonding), `ACA`, `Bitintra` (no default DB — cross-DB queries), `BITR`, `BITR_IMM`, `BITR_SM`, `WORKFLOW`, `dbHr`, `dbBIT`, `dbWMS` (`SHIPMENTPALLET_BOX_PROD`, `SG_FGREC_DATA`), `SeagateDev` (app metadata: `query_templates`, `saved_endpoints`, `registry_tables`, `registry_users`, `endpoint_permissions`, `registry_connections` — DDLs auto-`CREATE TABLE IF NOT EXISTS` at startup), `seagateACADev`, `SGCOIL`, `HGSTACA`, `SEAPRINT`, `SOFT` — plus any id from `registry_connections` (see below).

Tech debt: a few entries still hardcode user/password (`seagateACADev`, `SGCOIL`/`HGSTACA` usernames) — don't "fix" piecemeal; ask first.

### Connection Registry: static + dynamic layers

**Dynamic layer:** DB servers can be added at runtime via Registry Manager → **Connections** tab, persisted to `registry_connections` (SeagateDev pool). `connectionRegistryService` (`backend/src/services/connectionRegistryService.ts`) does CRUD + `loadAndApply()` → `setDynamicConnections()` fills the shadow map in `client.ts`; pools for dynamic keys are created lazily on first use. `closePool(id)` is called on update/delete so the next request rebuilds from the new config (in-flight queries on the old pool error once).

- **STATIC WINS, always:** `resolveConnConfig(key)` checks `CONNECTION_CONFIGS` first — dynamic rows can never shadow/hijack the 16 code-defined connections (and their eager exports `db`, `dbACA`, `dbSeagateDev`, ...). Never flip this order.
- Password is stored plaintext (accepted, same exposure class as `.env`) but **never returned by any API** — `list()` returns `hasPassword: true` only; blank password on PUT = keep existing; frontend never pre-fills the field.
- Delete refuses while any `registry_tables.connectionKey` still references the connection (frontend surfaces the refusal).
- Cross-instance sync: `loadAndApply()` runs at startup (before `reloadDynamicRegistry`), after every mutation, on `POST /registry/reload`, and piggybacks on `GET /tables` — but only the **config map** syncs; other instances keep stale pools until they restart or their own closePool fires.

### Hard Constraints (MySQL 5.0.0)

- **Batch all `IN (...)` queries.** Backend `BATCH_SIZE = 5000` (`backend/src/config/appConfig.ts`); frontend chain executor caps every `/api/pivot` call at `PIVOT_BATCH_SIZE = 100` per request as defense-in-depth. Don't change either without aligning both layers and confirming with user.
- No window functions, no CTEs, no modern JSON. Keep queries simple.
- Table-name case must match physically: `SCAN1_DISPENSING`, `BONDING_FIXTURE`, `BONDING_FIXTURE_BEARING`, `BAKING` are UPPERCASE; `scan1`, `scan1_map_aca_lot_bracket_lot`, `scan21`, `soldering`, `soldering_laser` are lowercase.

### Dead Code

`backend/src/services/traceability.ts` imports schema exports that don't exist (`materialScans`, `aoiTests`, `packagingRecords`) and is mounted nowhere — dead, don't build on it.

## Saved Query Templates (Frontend Feature)

`frontend/src/composables/useQueryTemplates.js` + `frontend/src/components/QueryTemplatesPanel.vue`. Users save Pivot path (Scan1 → Map → Soldering → Scan2.1 → ...) and replay it from single SN, fan-out via `/api/pivot` 100 values at a time. Templates persisted to MySQL via `/api/templates` CRUD (table `query_templates` on SeagateDev pool) — **not** localStorage.

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

`hops[].fromStepIdx` is index of source step to pivot FROM (0 = root). Supports **branched chains** (Add Branch) — old templates without `fromStepIdx` fall back to `i`.

**Pivot Path vs Search Conditions stored separately** — chain (`hops[]`) is structure; `rootConditions[]` is default values for master/root table. When user picks template, `QueryTemplatesPanel` renders Master Chain Conditions Editor seeded from `rootConditions`. Don't merge these concepts.

Resolved pitfalls (don't re-introduce):
- `doSearch` snapshots `.table` + `._searchConditions` onto `chainSteps[0]` at search time — `buildTemplateFromCurrentChain` must read those, not live sidebar values.
- Branched chains: `chainSteps[i]._pivotFromStepIdx` points to actual parent; `runTemplateChain` pulls source rows via `stepRows[]`/`stepTableKey[]` arrays, not a single `prevRows` cursor.
- `chainSteps` is a `shallowRef` — passing it as prop auto-unwraps, so `props.chainSteps.value = x` in a child silently no-ops. Composable takes an `updateChainSteps(newSteps)` callback; child emits `update:chainSteps`, parent does `chainSteps = $event`. One-way data flow.

## Saved API Endpoints (`/v1/endpoints` + `/v1/trace/:id`)

Separate from Query Templates. **Endpoint** = saved chain config (`EndpointConfig` in `backend/src/services/endpointService.ts`) published as stable callable URL:

- `EndpointConfig`: `rootTable`, `rootColumn`, `rootConditions[]`, `hops[]` (optional `parentStepIdx` for branched chains), `paramBindings[]`, `visibleCols[]`, `allowedParams[]`.
- `GET /api/v1/trace/:id` filters query string against `allowedParams[]` ∪ root-condition columns (case-insensitive), runs chain, left-joins steps via `combineSteps()`, applies substring/multi-value filtering, returns JSON or `format=csv`. `POST` variant accepts JSON body; arrays joined with `\n` for IN-list filters.
- **Query param override behavior (fixed 2026-07-22, commits `6a2c649`+`fbede05`):** query params **override** matching rootConditions (same column) and non-overridden rootConditions are **skipped** when params present — so `?lotCoil=X` on an endpoint saved with `ptNo=...` searches by lotCoil alone instead of AND-ing both into 1 row. Frontend `ApiManagerDialog` test form shows all root-condition columns + `allowedParams`; `useCombinedRows.js` ports the same one-to-many fan-out join so combined view row count matches backend exactly.
- **Unknown params are rejected with 400 (added 2026-09-01):** `admitTraceParams()` in `index.ts` throws listing the offenders + the allowed set; a single-underscore operator typo (`S4_REQ_DATE_gte`) gets an explicit "needs TWO underscores" hint. Previously unknown params were silently dropped and the endpoint returned 200 with **unfiltered** data. `format` is the only reserved non-filter key.
- **Operator suffix on trace params (added 2026-09-01):** any param may carry `__<op>` — `__eq __like __in __between __gte __lte` (Django-style, parsed by `endpointService.parseParamOperator`). Bare param = legacy bidirectional substring (back-compat). Two suffixed params on the same column **AND** together (`?d__gte=X&d__lte=Y` == `?d__between=X,Y`) — `explicitOpColumns`/`explicitOpStepCols` append instead of overwrite. Registry columns filter at **SQL level** (seed operator fixed by suffix, e.g. `?create_dt__gte=2026-08-01 00:00:01`, `?S4_REQ_DATE__between=2026-08-01,2026-08-31 23:59:59`); non-registry projection columns filter in-memory via `endpointService.filterCombinedRows` (numeric compare when both sides numeric; `"YYYY-MM-DD HH:mm:ss"` string compare = chronological thanks to `dateStrings`). `paramMatchesAllowed` strips the suffix before admission checks — `__gte` needs no separate allowlist entry.

### RBAC (Smart API Directory)

`saved_endpoints` columns: `created_by` (EN from `x-user-en` header), `visibility` (`public`|`restricted`), `api_group` (default `General`). `endpoint_permissions(endpoint_id, user_en)` stores per-EN grants (synced via `endpointService.syncAllowedUsers()`).

Route guards in `backend/src/index.ts`:
- `GET /v1/endpoints` — scoped by `resolveViewer(headers)`: admins see all; others see public ∪ own ∪ granted
- `POST /v1/endpoints` — requires valid `x-user-en` in `registry_users`
- `PUT|DELETE /v1/endpoints/:id` — admin OR owner, else 403
- `GET|POST /v1/trace/:id` — `canViewerAccess()` check, 403 for restricted endpoints

Frontend: Save API dialog in `TraceabilityFlow.vue` sends `x-user-en` from `localStorage['sg_admin_user']`; `ApiManagerDialog.vue` has group-filter pills, visibility/group tags, hides destructive UI from non-admins, and exposes an Access Permissions panel for admins/owners.

### Registry Manager RBAC

`registry_users(en, name, permission)` gates the Registry Manager UI: `POST /registry/login` verifies EN, `registry/*` mutations require admin EN header. UI: `LoginPanel.vue` + `UserManagementDialog.vue` in `TraceabilityFlow.vue`.

## Frontend Layout

`App.vue` is a thin shell; `TraceabilityFlow.vue` imports everything else. Components in `frontend/src/components/`:
- `TraceabilityFlow.vue` — main search + pivot chain UI (largest component)
- `LoginPanel.vue` — EN login against `/registry/login` (stores `sg_admin_user` in localStorage)
- `RegistryManagerDialog.vue` — add/edit dynamic tables (`registry_tables`) with column editor + test-query; **Connections tab** manages `registry_connections` (list + test + CRUD, admin-gated)
- `UserManagementDialog.vue` — CRUD `registry_users`
- `QueryTemplatesPanel.vue` — saved-templates sidebar/dialog
- `ApiManagerDialog.vue` — CRUD UI for `/v1/endpoints`
- `ExportOptionsDialog.vue` — Excel export (`xlsx` via `useExcelExport.js`)
- `FeatureGuideDialog.vue`, `PhilosophyDialog.vue` — in-app help/about

Composables in `frontend/src/composables/`:
- `useQueryTemplates.js` — template CRUD + `runTemplateChain()` executor
- `useChainTracker.js` — tracks live pivot chain state
- `useCombinedRows.js` — client-side fan-out left-join of chain steps for combined view
- `useExcelExport.js` — `xlsx`-based workbook export
- `useAutoStreamingDownload.js.disabled` — disabled streaming-download experiment (backend combine-job API removed)

## Planned Features

### Multi-Column Pivot (Composite Key Joins) — NOT implemented

Pivot uses single-column WHERE (`targetCol IN (...values)`). Some joins need composite keys (e.g., Bearing needs `BONDING_FIXTURE` AND `DATE`; WMS may need `LOT` AND `DCM`). Plan: optional `conditions?: Array<{fromCol, targetCol}>` on `TableLink` in `tableRegistry.ts`, OR-chained tuple WHERE in `pivotService.ts` (MySQL 5.0 can't do `(col1,col2) IN ((?,?),...)`; 100 rows × 2 cols = 200 params fits batch limit), multi-column chips + template/endpoint support in frontend. Verified absent: no `conditions` handling in `pivotService.ts`.

## Behavior Rules
- **Verify Before Action:** Always read the relevant files and search the codebase before making any edits or writing new code.
- **No Guessing:** Never assume a function, variable, database column, component, or API endpoint exists — verify in the codebase first.
- **Maintain Integrity:** Verify the active server and database configuration before executing queries or running tests.
- **ASK FOR TEST DATA EVERY TIME:** Before testing any feature (search, pivot, endpoint, query), ALWAYS ask the user for real test data (SN, Lot, PT numbers, etc.) from the actual database. NEVER use random/guessed values — they will always return 0 rows. Wait for user confirmation before running any test.

## Reference Docs

- `README.md` — project overview + deployment
- `DEPLOY.md` — production deploy runbook (Docker Compose on prod box)
- `SECURITY.md` — `.env` credential handling
- `spec/` — original Excel/SQL samples the schema was reverse-engineered from, plus the original `/v1/trace` API design proposal (`spec/Api_endpoint.md`, feature since implemented)

When docs disagree with code (batch size, port, row key shape), **code is authoritative**.
