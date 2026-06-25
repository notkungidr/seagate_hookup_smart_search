// ============================================================================
// useQueryTemplates.js
// Saved Query Templates (Local-First) + Automated Chained Pivot Executor
// ----------------------------------------------------------------------------
// TypeScript shape (documented as JSDoc — runtime is plain JS to match the
// rest of frontend/src):
//
//   interface QueryTemplate {
//     id: string;                 // crypto.randomUUID() or `${Date.now()}`
//     name: string;
//     description: string;
//     createdAt: string;          // ISO
//     updatedAt?: string;
//     rootTable: string;          // tableRegistry KEY (camelCase) — searched first
//     rootColumn: string;         // legacy: single column key (back-compat with v1 templates)
//     rootOperator?: 'like'|'eq';
//     rootConditions?: Condition[]; // FULL multi-condition snapshot at save time
//                                   // — used as editable defaults in the Master
//                                   //   Chain Conditions Editor (imprement.md)
//     hops: TemplateHop[];        // ordered pivots after the root search
//     stepsChain: string[];       // [rootTable, ...hops.map(h => h.targetTable)]
//   }
//   interface Condition {
//     column: string; operator: 'like'|'eq'|'in'|'between'|'gte'|'lte';
//     value?: string; value2?: string; multiValue?: string; dateRange?: string[];
//   }
//   interface TemplateHop {
//     fromColumnKey: string;      // column key on previous step's table to pivot FROM
//     fromStepIdx:  number;       // index of the source step (0 = root; supports branches)
//     targetTable:  string;       // tableRegistry key of next table
//     targetColumn: string;       // column key on targetTable
//   }
//
// IMPORTANT — Single source of truth:
//   Table & column names always come from `tablesMeta` (= /api/tables response,
//   sourced from backend tableRegistry.ts). Nothing in this file hardcodes
//   physical DB column names; we resolve them via tablesMeta at runtime.
// ============================================================================

import { ref } from 'vue';
import { PIVOT_BATCH_SIZE } from '../config/appConfig';

// ---- Large dataset threshold for auto backend mode ---------------------------
const LARGE_DATASET_THRESHOLD = 200000; // 200K rows

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---- Condition sanitizer ---------------------------------------------------
// Keeps only the shape we recognise; drops empty/blank conditions; never
// throws on bad input.
function sanitizeConditions(list) {
  if (!Array.isArray(list)) return [];
  const ALLOWED_OPS = new Set(['like', 'eq', 'in', 'between', 'gte', 'lte']);
  const out = [];
  for (const c of list) {
    if (!c || typeof c !== 'object') continue;
    if (!c.column || typeof c.column !== 'string') continue;
    const op = ALLOWED_OPS.has(c.operator) ? c.operator : 'like';
    out.push({
      column: c.column,
      operator: op,
      value: typeof c.value === 'string' ? c.value : '',
      value2: typeof c.value2 === 'string' ? c.value2 : '',
      multiValue: typeof c.multiValue === 'string' ? c.multiValue : '',
      dateRange: Array.isArray(c.dateRange) ? c.dateRange.slice(0, 2) : [],
    });
  }
  return out;
}

// ---- tablesMeta lookup helpers (Single Source of Truth) --------------------
function findTable(tablesMeta, tableKey) {
  return tablesMeta.find(t => t.key === tableKey) || null;
}

function findColumn(tablesMeta, tableKey, columnKey) {
  const tbl = findTable(tablesMeta, tableKey);
  if (!tbl) return null;
  return tbl.columns.find(c => c.key === columnKey || c.dbColumn === columnKey || c.label === columnKey) || null;
}

/**
 * Resolve "what physical DB column should I read from previous step's rows
 * to pivot FROM" — returns the physical db column or fallback to fromColumnKey if not found.
 */
function resolveFromDbColumn(tablesMeta, prevTableKey, fromColumnKey) {
  const col = findColumn(tablesMeta, prevTableKey, fromColumnKey);
  return col ? col.label : fromColumnKey;
}

/**
 * Validate that the hop is reachable per registry.linksTo — protects against
 * stale templates after schema/registry changes.
 */
function validateHop(tablesMeta, prevTableKey, hop) {
  const col = findColumn(tablesMeta, prevTableKey, hop.fromColumnKey);
  if (!col) return `column "${hop.fromColumnKey}" not found on table "${prevTableKey}"`;
  
  // Resolve target column to its exact registry key to compare links reliably
  const targetColMeta = findColumn(tablesMeta, hop.targetTable, hop.targetColumn);
  const targetColumnKey = targetColMeta ? targetColMeta.key : hop.targetColumn;

  const link = (col.linksTo || []).find(
    l => l.targetTable === hop.targetTable && 
         (l.targetColumn === targetColumnKey || 
          findColumn(tablesMeta, hop.targetTable, l.targetColumn)?.key === targetColumnKey)
  );
  if (!link) return `no registered link ${prevTableKey}.${hop.fromColumnKey} → ${hop.targetTable}.${hop.targetColumn}`;
  return null;
}

// ---- Public composable -----------------------------------------------------
export function useQueryTemplates(apiBase) {
  const templates = ref([]);

  function getAuthHeaders(extra = {}) {
    const user = JSON.parse(localStorage.getItem('sg_admin_user') || 'null');
    const headers = { ...extra };
    if (user && user.en) {
      headers['x-user-en'] = String(user.en);
    }
    return headers;
  }

  async function refresh() {
    if (!apiBase) return;
    try {
      const res = await fetch(`${apiBase}/api/templates`, {
        headers: getAuthHeaders()
      });
      const json = await res.json();
      if (json.success) {
        templates.value = json.data || [];
      } else {
        console.error('[QueryTemplates] Refresh failed:', json.message);
      }
    } catch (err) {
      console.error('[QueryTemplates] Network error refreshing templates:', err);
    }
  }

  async function saveTemplate(input) {
    const now = new Date().toISOString();
    const tpl = {
      id: input.id || newId(),
      name: (input.name || '').trim() || 'Untitled Template',
      description: (input.description || '').trim(),
      rootTable: input.rootTable,
      rootColumn: input.rootColumn,
      rootOperator: input.rootOperator || 'like',
      rootConditions: sanitizeConditions(input.rootConditions),
      hops: Array.isArray(input.hops) ? input.hops.map(h => ({
        fromColumnKey: h.fromColumnKey,
        fromStepIdx: h.fromStepIdx,
        targetTable: h.targetTable,
        targetColumn: h.targetColumn,
      })) : [],
      stepsChain: [],
      favoriteColumns: Array.isArray(input.favoriteColumns) ? input.favoriteColumns : [],
      createdAt: input.createdAt || now,
      updatedAt: now,
      visibility: input.visibility || 'public',
      allowedUsers: Array.isArray(input.allowedUsers) ? input.allowedUsers : [],
    };
    tpl.stepsChain = [tpl.rootTable, ...tpl.hops.map(h => h.targetTable)];

    try {
      const res = await fetch(`${apiBase}/api/templates`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(tpl),
      });
      const json = await res.json();
      if (json.success) {
        const idx = templates.value.findIndex(t => t.id === tpl.id);
        if (idx >= 0) {
          templates.value[idx] = tpl;
        } else {
          templates.value.unshift(tpl);
        }
        return tpl;
      } else {
        console.error('[QueryTemplates] Save template error:', json.message);
        return null;
      }
    } catch (err) {
      console.error('[QueryTemplates] Network error saving template:', err);
      return null;
    }
  }

  async function updateTemplate(id, patch) {
    const idx = templates.value.findIndex(t => t.id === id);
    if (idx < 0) return null;

    const merged = { ...templates.value[idx], ...patch, updatedAt: new Date().toISOString() };
    if (patch.hops || patch.rootTable) {
      merged.stepsChain = [merged.rootTable, ...(merged.hops || []).map(h => h.targetTable)];
    }

    try {
      const res = await fetch(`${apiBase}/api/templates/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (json.success) {
        const updatedRecord = json.data || merged;
        templates.value[idx] = updatedRecord;
        return updatedRecord;
      } else {
        console.error('[QueryTemplates] Update template error:', json.message);
        return null;
      }
    } catch (err) {
      console.error('[QueryTemplates] Network error updating template:', err);
      return null;
    }
  }

  async function deleteTemplate(id) {
    try {
      const res = await fetch(`${apiBase}/api/templates/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const json = await res.json();
      if (json.success) {
        templates.value = templates.value.filter(t => t.id !== id);
        return true;
      } else {
        console.error('[QueryTemplates] Delete template error:', json.message);
        return false;
      }
    } catch (err) {
      console.error('[QueryTemplates] Network error deleting template:', err);
      return false;
    }
  }

  // Initial load
  if (apiBase) {
    refresh();
  }

  /**
   * Capture current TraceabilityFlow chain into a (yet-unsaved) template draft.
   *
   * @param {object} args
   * @param {object} args.searchForm    — TraceabilityFlow.searchForm.value
   * @param {Array}  args.chainSteps    — TraceabilityFlow.chainSteps.value
   * @param {Array}  args.tablesMeta    — TraceabilityFlow.tablesMeta.value
   * @returns {object|null}             draft template (no id) or null if chain invalid
   */
  function buildTemplateFromCurrentChain({ searchForm, chainSteps, tablesMeta, visibleCombinedCols }) {
    if (!chainSteps?.length) return null;

    const root = chainSteps[0];
    const rootTableKey = root.table || searchForm.table;
    const conds = Array.isArray(root._searchConditions) && root._searchConditions.length
      ? root._searchConditions
      : (Array.isArray(searchForm.conditions) ? searchForm.conditions : []);
    const firstCond = conds[0];
    if (!rootTableKey || !firstCond?.column) return null;

    const hops = [];
    for (let i = 1; i < chainSteps.length; i++) {
      const cur = chainSteps[i];
      const parentIdx = (cur._pivotFromStepIdx !== undefined) ? cur._pivotFromStepIdx : i - 1;
      const prev = chainSteps[parentIdx];
      const prevTableKey = prev.table || prev.targetTable;

      // Translate physical fromDbColumn (stored on the pivot step) back to a
      // registry column KEY by looking at the previous step's table metadata.
      const prevTbl = findTable(tablesMeta, prevTableKey);
      if (!prevTbl) return null;
      const fromCol = prevTbl.columns.find(c => c.dbColumn === cur._joinFromDbColumn || c.key === cur._joinFromDbColumn || c.label === cur._joinFromDbColumn);
      if (!fromCol) return null;

      hops.push({
        fromColumnKey: fromCol.key,
        fromStepIdx: parentIdx,
        targetTable: cur.targetTable || cur.table,
        targetColumn: cur._joinToColumn,
      });
    }

    return {
      rootTable: rootTableKey,
      rootColumn: firstCond.column,                                    // legacy / back-compat
      rootOperator: firstCond.operator === 'eq' ? 'eq' : 'like',         // legacy / back-compat
      rootConditions: sanitizeConditions(conds),                         // FULL multi-condition snapshot
      hops,
      stepsChain: [rootTableKey, ...hops.map(h => h.targetTable)],
      favoriteColumns: visibleCombinedCols || [],
    };
  }

  return {
    templates,
    refresh,
    saveTemplate,
    updateTemplate,
    deleteTemplate,
    buildTemplateFromCurrentChain,
  };
}

/**
 * Re-index hop.fromStepIdx values after a hop at removedIdx is deleted.
 * Steps after the removed one shift down by 1; any hop that pointed to the
 * removed step is re-pointed to its predecessor (removedIdx - 1, min 0).
 */
export function recalculateHops(hops, removedIdx) {
  // removedIdx is the position in stepsChain (1-based hop index = removedIdx - 1)
  return hops
    .filter((_, i) => i !== removedIdx - 1)
    .map(h => {
      let idx = h.fromStepIdx ?? 0;
      if (idx === removedIdx) idx = Math.max(0, removedIdx - 1);
      else if (idx > removedIdx) idx -= 1;
      return { ...h, fromStepIdx: idx };
    });
}

// ============================================================================
// Automated Chained Query Executor
// ----------------------------------------------------------------------------
// Updates the parent's chainSteps via an `updateChainSteps(newSteps)` callback
// rather than mutating a ref directly. This avoids Vue 3's shallowRef
// auto-unwrap pitfall when the ref is passed as a prop into a child component
// (writing to `props.chainSteps.value` silently no-ops on the unwrapped Array).
// ============================================================================

const ALLOWED_OPS = ['like', 'eq', 'in', 'between', 'gte', 'lte'];

function splitMultiValue(text) {
  if (!text) return [];
  return text
    .split(/[\n,]+/)
    .map(v => v.trim())
    .filter(v => v.length > 0);
}

/**
 * Convert a UI-shape condition (from the Master Chain Conditions Editor) into
 * the API-shape condition expected by /api/search. Returns:
 *   { ok: true,  apiCond, label }   or
 *   { ok: false, error }
 *
 * Mirrors the logic of TraceabilityFlow.vue's main search builder so behaviour
 * is identical between manual searches and template runs.
 */
function buildApiCondition(cond, columnsMeta) {
  if (!cond?.column) return { ok: false, error: 'missing column' };
  if (!ALLOWED_OPS.includes(cond.operator)) return { ok: false, error: `bad operator "${cond.operator}"` };

  const colMeta = columnsMeta.find(c => c.key === cond.column);
  const colLabel = colMeta?.label || cond.column;
  const isDate = (colMeta?.label || cond.column).toLowerCase().includes('date')
    || cond.column.toLowerCase().includes('date');

  // IN
  if (cond.operator === 'in') {
    const values = Array.isArray(cond.values) && cond.values.length
      ? cond.values
      : splitMultiValue(cond.multiValue);
    if (!values.length) return { ok: false, error: `"${colLabel}" IN: ต้องระบุอย่างน้อย 1 ค่า` };
    return {
      ok: true,
      apiCond: { column: cond.column, operator: 'in', values },
      label: { col: colLabel, op: 'IN', val: `(${values.length} values)` },
    };
  }

  // BETWEEN — supports either dateRange[2] (Date Picker) or value+value2
  if (cond.operator === 'between') {
    let v1 = '', v2 = '';
    if (isDate && Array.isArray(cond.dateRange) && cond.dateRange.length === 2) {
      [v1, v2] = cond.dateRange;
    } else {
      v1 = (cond.value || '').trim();
      v2 = (cond.value2 || '').trim();
    }
    if (!v1 || !v2) return { ok: false, error: `"${colLabel}" BETWEEN: ต้องระบุครบทั้งจาก-ถึง` };
    return {
      ok: true,
      apiCond: { column: cond.column, operator: 'between', value: v1, value2: v2 },
      label: { col: colLabel, op: 'BETWEEN', val: `${v1} ~ ${v2}` },
    };
  }

  // gte / lte — date columns may use dateRange[0] as a shortcut
  if (cond.operator === 'gte' || cond.operator === 'lte') {
    let v = (cond.value || '').trim();
    if (!v && isDate && Array.isArray(cond.dateRange) && cond.dateRange[0]) v = cond.dateRange[0];
    if (!v) return { ok: false, error: `"${colLabel}" ${cond.operator.toUpperCase()}: ต้องระบุค่า` };
    return {
      ok: true,
      apiCond: { column: cond.column, operator: cond.operator, value: v },
      label: { col: colLabel, op: cond.operator.toUpperCase(), val: v },
    };
  }

  // like / eq
  let v = (cond.value || '').trim();
  if (!v && isDate && Array.isArray(cond.dateRange) && cond.dateRange[0]) v = cond.dateRange[0];
  if (!v) return { ok: false, error: `"${colLabel}": ต้องระบุค่า` };
  return {
    ok: true,
    apiCond: { column: cond.column, operator: cond.operator, value: v },
    label: { col: colLabel, op: cond.operator.toUpperCase(), val: v },
  };
}

/**
 * @param {object}   args
 * @param {object}   args.template          — QueryTemplate
 * @param {Array}    [args.dynamicConditions] — UI-shape conditions from the Master Chain Editor.
 *                                              If empty/undefined, falls back to template.rootConditions, then
 *                                              to a single { rootColumn, rootOperator } stub (legacy v1 templates).
 * @param {number}   [args.startStepIdx]    — Index to begin execution (default 0)
 * @param {Array}    [args.dynamicConditions] — UI-shape conditions
 * @param {Array}    args.tablesMeta        — /api/tables response
 * @param {function} args.updateChainSteps  — (newStepsArray) => void;
 * @param {string}   args.apiBase           — e.g. 'http://localhost:9090'
 * @param {function} [args.onMessage]       — (level, text) => void
 * @param {function} [args.onStepStart]     — (stepIndex, label) => void
 * @param {function} [args.onStepDone]      — (stepIndex, step)  => void
 * @param {function} [args.markRaw]
 * @param {function} [args.nextUid]
 * @returns {Promise<{ ok: boolean, interruptedAt?: number, reason?: string }>}
 */
export async function runTemplateChain({
  template,
  startStepIdx = 0,
  dynamicConditions,
  tablesMeta,
  updateChainSteps,
  apiBase,
  onMessage = () => { },
  onStepStart = () => { },
  onStepDone = () => { },
  markRaw = (x) => x,
  nextUid = () => Date.now() + Math.random(),
  bypassLargeDatasetLimit = false,
}) {
  if (typeof updateChainSteps !== 'function') {
    throw new Error('runTemplateChain: updateChainSteps callback is required');
  }
  if (!template || !template.rootTable) {
    onMessage('error', 'Template is invalid (missing root table)');
    return { ok: false, reason: 'invalid-template' };
  }

  // ── STEP 0: Prepare placeholders for ALL steps in stepsChain ──────────────────
  const steps = [];
  for (let i = 0; i < template.stepsChain.length; i++) {
    const tKey = template.stepsChain[i];
    const tbl = findTable(tablesMeta, tKey);
    steps.push(makePlaceholder({
      label: tbl?.label || tKey,
      columnLabel: '',
      operator: '',
      value: '',
      table: tKey,
      nextUid,
    }));
  }
  
  // reset host chain at start with placeholders
  updateChainSteps(steps.slice());

  const startTKey = template.stepsChain[startStepIdx];
  const startTbl = findTable(tablesMeta, startTKey);
  if (!startTbl) {
    onMessage('error', `ไม่พบตารางสำหรับ Step ${startStepIdx + 1} (${startTKey}) ใน registry`);
    return { ok: false, reason: 'table-not-found' };
  }

  // ── Resolve which conditions to run with ──────────────────────────
  let uiConds = Array.isArray(dynamicConditions) && dynamicConditions.length
    ? dynamicConditions
    : [{
        column: startTbl.columns[0]?.key || '',
        operator: 'like',
        value: '', value2: '', multiValue: '', dateRange: [],
      }];

  // ── Validate + build API conditions ────────────────────────────────────────
  const apiConditions = [];
  const labelParts = [];
  for (let i = 0; i < uiConds.length; i++) {
    const built = buildApiCondition(uiConds[i], startTbl.columns);
    if (!built.ok) {
      onMessage('warning', `เงื่อนไขที่ ${i + 1}: ${built.error}`);
      return { ok: false, reason: 'invalid-condition' };
    }
    apiConditions.push(built.apiCond);
    labelParts.push(built.label);
  }
  if (!apiConditions.length) {
    onMessage('warning', 'กรุณาระบุอย่างน้อย 1 เงื่อนไขสำหรับการค้นหา');
    return { ok: false, reason: 'no-conditions' };
  }

  const colLabels = labelParts.map(l => l.col).join(' + ');
  const valLabels = labelParts.map(l => l.val).join(' & ');
  const opLabel = apiConditions.length > 1 ? 'multi' : apiConditions[0].operator;

  const flush = () => updateChainSteps(steps.slice());

  // ── Execute search on the start step ─────────────────────────────────────────
  onStepStart(startStepIdx, startTbl.label);

  let rootJson;
  try {
    // ponytail: batch large IN conditions at frontend before hitting API — solves 400K payload error
    rootJson = await runSearchBatched(apiBase, startTKey, apiConditions, onMessage);
  } catch (err) {
    failStep(steps, startStepIdx, 'API error');
    flush();
    onMessage('error', `เชื่อมต่อ API ไม่สำเร็จที่ขั้นตอนการค้นหาเริ่มต้น (${startTbl.label})`);
    return { ok: false, reason: 'network', interruptedAt: startStepIdx };
  }
  if (!rootJson?.success) {
    failStep(steps, startStepIdx, rootJson?.message || 'unknown');
    flush();
    onMessage('error', rootJson?.message || 'Search failed');
    return { ok: false, reason: 'api-error', interruptedAt: startStepIdx };
  }

  finalizeStep(steps, startStepIdx, {
    ...rootJson.data,
    rows: markRaw(rootJson.data.rows || []),
    columnLabel: colLabels,
    value: valLabels,
    operator: opLabel,
  });
  flush();
  onStepDone(startStepIdx, steps[startStepIdx]);

  if (rootJson.data.total === 0) {
    onMessage('error', `Chain interrupted at step "${startTbl.label}" - No data found`);
    return { ok: false, reason: 'no-data', interruptedAt: startStepIdx };
  }

  // ── 🚀 Auto Backend Mode for Large Datasets ──────────────────────────────────
  const rootRowCount = rootJson.data.rows?.length || 0;
  if (rootRowCount > LARGE_DATASET_THRESHOLD && !bypassLargeDatasetLimit) {
    onMessage('info', `ตรวจพบข้อมูลขนาดใหญ่: ${rootRowCount.toLocaleString()} แถว — จะใช้ Backend Pivot Mode`);

    // Mark all remaining steps as placeholders (will be filled by backend)
    for (let i = startStepIdx + 1; i < steps.length; i++) {
      steps[i].loading = true;
      steps[i].label = 'รอ Backend Pivot...';
    }
    flush();

    // Return with special flag indicating backend mode needed
    return {
      ok: true,
      useBackendMode: true,
      rootRowCount,
      interruptedAt: startStepIdx
    };
  }

  // ── Propagation Phase (BFS Bidirectional Pivoting) ─────────────────────────
  const resolved = new Set([startStepIdx]);
  const stepRows = [];
  stepRows[startStepIdx] = rootJson.data.rows || [];

  const edges = template.hops.map((hop, hopIdx) => ({
    parentIdx: hop.fromStepIdx ?? hopIdx,
    childIdx: hopIdx + 1,
    hop,
  }));

  let progress = true;
  while (progress) {
    progress = false;

    for (const edge of edges) {
      const pResolved = resolved.has(edge.parentIdx);
      const cResolved = resolved.has(edge.childIdx);

      // Scenario A: Parent is resolved, Child is not (Forward Pivot)
      if (pResolved && !cResolved) {
        const srcIdx = edge.parentIdx;
        const tgtIdx = edge.childIdx;
        const srcRows = stepRows[srcIdx];
        const hop = edge.hop;
        const tgtTbl = findTable(tablesMeta, hop.targetTable);
        const prevTableKey = template.stepsChain[srcIdx];
        const fromDbCol = resolveFromDbColumn(tablesMeta, prevTableKey, hop.fromColumnKey);

        const sourceValues = [...new Set(
          srcRows
            .map(r => r[fromDbCol])
            .filter(v => v != null && v !== '')
            .map(v => String(v).trim())
        )];

        steps[tgtIdx].columnLabel = hop.targetColumn;
        steps[tgtIdx].operator = 'pivot';
        steps[tgtIdx].value = `${sourceValues.length} values from "${fromDbCol}"`;
        flush();
        onStepStart(tgtIdx, tgtTbl?.label || hop.targetTable);

        if (sourceValues.length === 0) {
          failStep(steps, tgtIdx, 'no source values');
          flush();
          onMessage('error', `Chain interrupted at step "${tgtTbl?.label || hop.targetTable}" - No data found`);
          return { ok: false, reason: 'no-source-values', interruptedAt: tgtIdx };
        }

        const pivotRes = await runPivotBatch(apiBase, sourceValues, hop.targetTable, hop.targetColumn, tgtTbl?.label);
        if (!pivotRes.ok) {
          failStep(steps, tgtIdx, pivotRes.error);
          flush();
          onMessage('error', `Chain interrupted at step "${tgtTbl?.label || hop.targetTable}" - ${pivotRes.error}`);
          return { ok: false, reason: 'api-error', interruptedAt: tgtIdx };
        }

        finalizeStep(steps, tgtIdx, {
          ...pivotRes.data,
          tableLabel: pivotRes.data.targetTableLabel,
          rows: markRaw(pivotRes.data.rows),
          columnLabel: hop.targetColumn,
          operator: 'pivot',
          value: `${sourceValues.length} values from "${fromDbCol}"`,
          _joinFromDbColumn: fromDbCol,
          _joinToColumn: hop.targetColumn,
          _pivotFromStepIdx: srcIdx,
        });
        flush();
        onStepDone(tgtIdx, steps[tgtIdx]);

        stepRows[tgtIdx] = pivotRes.data.rows || [];
        resolved.add(tgtIdx);

        // ⚠️ Check if this step exceeded threshold (child steps can have more rows than master)
        const rowCount = stepRows[tgtIdx].length;
        if (rowCount > LARGE_DATASET_THRESHOLD && !bypassLargeDatasetLimit) {
          onMessage('warning', `⚠️ Step ${tgtIdx + 1} มี ${rowCount.toLocaleString()} แถว — เกินขีดจำกัด browser!`);

          // Stop further pivots
          return {
            ok: true,
            useBackendMode: true,
            rootRowCount: rowCount,
            interruptedAt: tgtIdx,
            largestStepIndex: tgtIdx
          };
        }

        progress = true;
        break; // Re-evaluate in BFS order
      }

      // Scenario B: Child is resolved, Parent is not (Backward Pivot)
      else if (!pResolved && cResolved) {
        const srcIdx = edge.childIdx;
        const tgtIdx = edge.parentIdx;
        const srcRows = stepRows[srcIdx];
        const hop = edge.hop;
        
        const parentTableKey = template.stepsChain[tgtIdx];
        const parentTbl = findTable(tablesMeta, parentTableKey);
        
        const childTableKey = template.stepsChain[srcIdx];
        const childDbCol = resolveFromDbColumn(tablesMeta, childTableKey, hop.targetColumn);

        const sourceValues = [...new Set(
          srcRows
            .map(r => r[childDbCol])
            .filter(v => v != null && v !== '')
            .map(v => String(v).trim())
        )];

        steps[tgtIdx].columnLabel = hop.fromColumnKey;
        steps[tgtIdx].operator = 'pivot';
        steps[tgtIdx].value = `${sourceValues.length} values from "${childDbCol}" (backward)`;
        flush();
        onStepStart(tgtIdx, parentTbl?.label || parentTableKey);

        if (sourceValues.length === 0) {
          failStep(steps, tgtIdx, 'no source values');
          flush();
          onMessage('error', `Chain interrupted at step "${parentTbl?.label || parentTableKey}" - No data found`);
          return { ok: false, reason: 'no-source-values', interruptedAt: tgtIdx };
        }

        const pivotRes = await runPivotBatch(apiBase, sourceValues, parentTableKey, hop.fromColumnKey, parentTbl?.label);
        if (!pivotRes.ok) {
          failStep(steps, tgtIdx, pivotRes.error);
          flush();
          onMessage('error', `Chain interrupted at step "${parentTbl?.label || parentTableKey}" - ${pivotRes.error}`);
          return { ok: false, reason: 'api-error', interruptedAt: tgtIdx };
        }

        finalizeStep(steps, tgtIdx, {
          ...pivotRes.data,
          tableLabel: pivotRes.data.targetTableLabel,
          rows: markRaw(pivotRes.data.rows),
          columnLabel: hop.fromColumnKey,
          operator: 'pivot',
          value: `${sourceValues.length} values from "${childDbCol}" (backward)`,
          _joinFromDbColumn: hop.fromColumnKey,
          _joinToColumn: hop.targetColumn,
          _pivotFromStepIdx: srcIdx,
        });
        flush();
        onStepDone(tgtIdx, steps[tgtIdx]);

        stepRows[tgtIdx] = pivotRes.data.rows || [];
        resolved.add(tgtIdx);
        progress = true;
        break; // Re-evaluate in BFS order
      }
    }
  }

  onMessage('success', `Template "${template.name}" finished — ${template.stepsChain.length} steps`);
  return { ok: true };
}

/**
 * Frontend-side search batching for large IN conditions.
 * Splits IN condition into BATCH_SIZE chunks, calls /api/search per chunk, merges results.
 * Prevents "too many placeholders" error when importing 400K+ values.
 *
 * @param {string} apiBase
 * @param {string} table — table key
 * @param {Array} conditions — API conditions; at most one has operator='in'
 * @param {function} onMessage — (level, text) => void
 * @returns {Promise<{success: boolean, data?: {...}, message?: string}>}
 */
async function runSearchBatched(apiBase, table, conditions, onMessage) {
  const inCondIdx = conditions.findIndex(c => c.operator === 'in');

  // No IN condition or small IN → single request
  if (inCondIdx === -1 || (conditions[inCondIdx].values?.length || 0) <= PIVOT_BATCH_SIZE.value) {
    const res = await fetch(`${apiBase}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, conditions }),
    });
    return res.json();
  }

  // Large IN → batch it
  const inCond = conditions[inCondIdx];
  const otherConds = conditions.filter((_, i) => i !== inCondIdx);
  const allValues = inCond.values || [];
  const batchSize = PIVOT_BATCH_SIZE.value;
  const batches = [];
  for (let i = 0; i < allValues.length; i += batchSize) {
    batches.push(allValues.slice(i, i + batchSize));
  }

  onMessage?.('info', `กำลังค้นหา ${allValues.length.toLocaleString()} รายการ แบ่งเป็น ${batches.length} ชุดๆ ละ ${batchSize} รายการ...`);

  const allRows = [];
  let availablePivots = null;
  let tableLabel = '';

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batchValues = batches[batchIdx];
    const batchConds = [
      ...otherConds,
      { ...inCond, values: batchValues }
    ];

    const res = await fetch(`${apiBase}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, conditions: batchConds }),
    });
    const json = await res.json();

    if (!json.success) {
      return json; // fail fast on first batch error
    }

    allRows.push(...(json.data.rows || []));
    if (!availablePivots) availablePivots = json.data.availablePivots;
    if (!tableLabel) tableLabel = json.data.tableLabel;

    onMessage?.('info', `ชุดที่ ${batchIdx + 1}/${batches.length} เสร็จแล้ว (${json.data.total.toLocaleString()} rows)`);
  }

  // Merge result
  return {
    success: true,
    data: {
      table,
      tableLabel,
      total: allRows.length,
      rows: allRows,
      availablePivots,
    }
  };
}

/**
 * Helper to execute a pivot query in batches to avoid MySQL 5.0 IN-clause limitations.
 * Aggregates all batch results into a single object with unified rows.
 */
async function runPivotBatch(apiBase, sourceValues, targetTable, targetColumn, targetTableLabel = '') {
  const batches = [];
  const batchSize = PIVOT_BATCH_SIZE.value;
  for (let i = 0; i < sourceValues.length; i += batchSize) {
    batches.push(sourceValues.slice(i, i + batchSize));
  }

  const allRows = [];
  let availablePivots = [];

  for (const batchValues of batches) {
    try {
      const res = await fetch(`${apiBase}/api/pivot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetTable,
          targetColumn,
          sourceValues: batchValues,
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        if (Array.isArray(json.data.rows)) {
          // ❌ OLD: allRows.push(...json.data.rows); — causes stack overflow for large arrays
          // ✅ NEW: use concat or for-loop
          for (let i = 0; i < json.data.rows.length; i++) {
            allRows.push(json.data.rows[i]);
          }
        }
        if (Array.isArray(json.data.availablePivots)) {
          availablePivots = json.data.availablePivots;
        }
      } else {
        return { ok: false, error: json.message || 'API error during batch pivot' };
      }
    } catch (err) {
      console.error('[QueryTemplates] Batch pivot network error:', err);
      return { ok: false, error: 'Network error during batch pivot' };
    }
  }

  return {
    ok: true,
    data: {
      targetTable,
      targetTableLabel: targetTableLabel || targetTable,
      rows: allRows,
      total: allRows.length,
      availablePivots,
    }
  };
}

// ---- internal step-buffer helpers ------------------------------------------
function makePlaceholder({ label, columnLabel, operator, value, table, targetTable, nextUid }) {
  return {
    table,
    targetTable,
    tableLabel: label,
    columnLabel,
    operator,
    value,
    rows: [],
    total: 0,
    availablePivots: [],
    _uid: nextUid(),
    _chainLoading: true,
    _chainError: null,
  };
}

function finalizeStep(steps, idx, patch) {
  steps[idx] = { ...steps[idx], ...patch, _chainLoading: false, _chainError: null };
}

function failStep(steps, idx, reason) {
  steps[idx] = { ...steps[idx], _chainLoading: false, _chainError: reason, total: 0, rows: [] };
}
