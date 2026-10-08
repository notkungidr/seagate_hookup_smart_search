import { computed, markRaw, ref, watch } from 'vue';
import { isDateColumnName } from '../utils/dateTime.js';

// re-export เพื่อ back-compat (TraceabilityFlow  import จากที่นี่อยู่)
export { isDateColumnName };

const POSSIBLE_JOIN_KEYS = [
  'hookup', 'DCM', 'serial_no', 'dcm', 'SERIAL_NO', 'HOOKUP',
  'Hookup (SN)', 'DCM (SN)', 'Serial No (SN)', 'Lot', 'Prod Lot', 'PT No', 'TL (SN)'
];

export function useCombinedRows({
  chainSteps,
  tablesMeta,
  getFilteredRows,
  getGridColumns,
}) {
  const manualCombineMasterIdx = ref(-1);
  const combinedPage = ref(1);
  const combinedPageSize = ref(50);
  const combinedFilterText = ref('');
  const debouncedCombinedFilter = ref('');
  const combinedColFilters = ref({});

  // ponytail: hard cap — multi-million row fan-out OOMs the tab ("this page is having a problem"); 100k = 2x the 50k export limit
  const MAX_COMBINED_ROWS = 100000;
  const combinedTruncated = ref(false);
  // { stepIdx: droppedMatchCount } — sibling branches ที่ถูกบีบเหลือ match แรก (ดู buildCombinedRows)
  const combinedFanOutSuppressed = ref({});

  let combinedFilterTimer = null;
  watch(combinedFilterText, (value) => {
    clearTimeout(combinedFilterTimer);
    combinedFilterTimer = setTimeout(() => {
      debouncedCombinedFilter.value = value;
      combinedPage.value = 1;
    }, 300);
  });

  // Watch column filters deeply and automatically reset page to 1 on input changes
  watch(combinedColFilters, () => {
    combinedPage.value = 1;
  }, { deep: true });

  const combinedResult = computed(() => buildCombinedRows());
  const combinedData = computed(() => combinedResult.value.rows);
  const combinedColSteps = computed(() => combinedResult.value.colSteps);
  const combinedColOrigins = computed(() => combinedResult.value.colOrigins || {});
  const combinedCols = computed(() => combinedData.value.length ? Object.keys(combinedData.value[0]) : []);

  // Initialize new columns filter states as empty arrays or null for date columns
  watch(combinedCols, (newCols) => {
    newCols.forEach((col) => {
      if (combinedColFilters.value[col] === undefined) {
        combinedColFilters.value[col] = isDateColumnName(col) ? null : [];
      }
    });
  }, { deep: true, immediate: true });
  const filteredCombinedData = computed(() => {
    let rows = combinedData.value;
    
    // 1. Apply global search filter
    const globalQ = debouncedCombinedFilter.value.trim().toLowerCase();
    if (globalQ) {
      rows = rows.filter((row) => Object.values(row).some((value) => (
        value !== null && value !== undefined && String(value).toLowerCase().includes(globalQ)
      )));
    }

    // 2. Apply column-specific filters
    const colFilters = combinedColFilters.value;
    const activeCols = Object.keys(colFilters).filter(col => {
      const val = colFilters[col];
      if (isDateColumnName(col)) {
        return Array.isArray(val) && val.length === 2 && val[0] && val[1];
      }
      if (Array.isArray(val)) return val.length > 0;
      return val && String(val).trim() !== '';
    });
    if (activeCols.length > 0) {
      rows = rows.filter((row) => {
        return activeCols.every((col) => {
          const filterValue = colFilters[col];
          if (isDateColumnName(col)) {
            if (Array.isArray(filterValue) && filterValue.length === 2 && filterValue[0] && filterValue[1]) {
              const rowVal = String(row[col] ?? '').trim();
              if (!rowVal) return false;
              // Extract date component (YYYY-MM-DD) from timestamp
              const rowDateStr = rowVal.substring(0, 10);
              const [start, end] = filterValue;
              return rowDateStr >= start && rowDateStr <= end;
            }
            return true;
          }
          if (Array.isArray(filterValue)) {
            if (filterValue.length === 0) return true;
            const val = String(row[col] ?? '').trim().toLowerCase();
            return filterValue.some(fv => String(fv).trim().toLowerCase() === val);
          } else {
            const query = String(filterValue).trim().toLowerCase();
            const val = String(row[col] ?? '').toLowerCase();
            return val.includes(query);
          }
        });
      });
    }

    return rows;
  });
  const paginatedCombinedData = computed(() => {
    const page = combinedPage.value;
    const size = combinedPageSize.value;
    return filteredCombinedData.value.slice((page - 1) * size, page * size);
  });

  function detectJoinKey(rows) {
    if (!rows?.length) return null;
    const keys = Object.keys(rows[0]);
    return POSSIBLE_JOIN_KEYS.find((key) => keys.includes(key)) ?? keys[0] ?? null;
  }

  function resolveDbColumn(tableKey, key, rows) {
    if (!tableKey || !key) return key;
    const table = tablesMeta.value.find((item) => item.key === tableKey);
    const col = table?.columns.find((item) => item.key === key || item.dbColumn === key || item.label === key);
    const resolved = col ? col.label : key;
    // ponytail: table ที่อยู่แค่ static TABLE_REGISTRY (เช่น scan1) ไม่มีใน tablesMeta → ได้ key ดิบ 'hookup'
    // แต่ rows ถูก key ด้วย label 'Hookup (SN)' → lookup ว่างทั้ง step ตรวจกับ key จริงของ rows ก่อนคืนค่า
    const rowKeys = rows?.length ? Object.keys(rows[0]) : null;
    if (!rowKeys || rowKeys.includes(resolved)) return resolved;
    const lower = String(key).toLowerCase();
    const exact = rowKeys.find((k) => k.toLowerCase() === lower);
    if (exact) return exact;
    // label มักเป็น "Hookup (SN)" / "PT No" — เทียบแบบตัดวงเล็บ/ช่องว่าง/underscore
    const norm = (s) => String(s).toLowerCase().replace(/\s*\(.*?\)\s*/g, '').replace(/[\s_]/g, '');
    return rowKeys.find((k) => norm(k) === norm(key)) ?? resolved;
  }

  function getJoinColumns(parentIdx, childIdx, parentRows, childRows) {
    const stepA = chainSteps.value[parentIdx];
    const stepB = chainSteps.value[childIdx];
    
    let leftCol = '';
    let rightCol = '';

    if (stepB && stepB._pivotFromStepIdx === parentIdx) {
      // Forward pivot: stepB was pivoted from stepA
      leftCol = stepB._joinFromDbColumn;
      rightCol = stepB._joinToColumn;
    } else if (stepA && stepA._pivotFromStepIdx === childIdx) {
      // Backward pivot: stepA was pivoted from stepB
      leftCol = stepA._joinFromDbColumn;
      rightCol = stepA._joinToColumn;
    } else {
      // Fallback: check child first then parent
      leftCol = stepB?._joinFromDbColumn || stepA?._joinFromDbColumn;
      rightCol = stepB?._joinToColumn || stepA?._joinToColumn;
    }

    // Resolve parent side column using stepA's metadata
    if (leftCol && stepA) {
      leftCol = resolveDbColumn(stepA.targetTable || stepA.table, leftCol, parentRows);
    } else {
      leftCol = detectJoinKey(parentRows);
    }

    // Resolve child side column using stepB's metadata
    if (rightCol && stepB) {
      rightCol = resolveDbColumn(stepB.targetTable || stepB.table, rightCol, childRows);
    } else {
      rightCol = detectJoinKey(childRows);
    }

    return { leftCol, rightCol };
  }

  function buildCombinedRows() {
    combinedTruncated.value = false;
    combinedFanOutSuppressed.value = {};
    if (!chainSteps.value.length) return { rows: [], colSteps: {}, colOrigins: {} };

    const steps = chainSteps.value
      .filter((step) => !step.isCombined)
      .map((step, idx) => ({ step, idx, rows: getFilteredRows(idx) }));
    if (!steps.length) return { rows: [], colSteps: {}, colOrigins: {} };

    let master = null;
    if (manualCombineMasterIdx.value >= 0 && manualCombineMasterIdx.value < chainSteps.value.length) {
      master = steps.find((item) => item.idx === manualCombineMasterIdx.value);
    }
    if (!master) {
      // ponytail: choose master that maximizes output rows (fan-out join semantics)
      // Root columns will be LEFT JOINed back and duplicated across child rows
      let maxRows = -1;
      steps.forEach((item) => {
        if (item.rows.length > maxRows) {
          maxRows = item.rows.length;
          master = item;
        }
      });
    }

    const baseRows = master?.rows || [];
    const baseIdx = master?.idx;
    const baseKey = detectJoinKey(baseRows);
    if (!baseRows.length || !baseKey) return { rows: [], colSteps: {}, colOrigins: {} };

    let baseColumns = Object.keys(baseRows[0]);

    const usedColumns = new Set();
    const usedColumnsLower = new Set(); // case-insensitive tracking
    const columnAliases = { [baseIdx]: {} };

    const colSteps = {};
    const colOrigins = {};
    // ponytail: prefix master ด้วย S{N}_ เหมือน step อื่น — ทุกคอลัมน์ใน export/UI บอกที่มาได้
    // ตรงกับ backend combineSteps ที่ prefix master อยู่แล้ว (endpointService.ts:1084)
    baseColumns.forEach((col) => {
      const alias = `S${baseIdx + 1}_${col}`;
      columnAliases[baseIdx][col] = alias;
      usedColumns.add(alias);
      usedColumnsLower.add(alias.toLowerCase());
      colSteps[alias] = baseIdx;
      colOrigins[alias] = col;
    });

    const outputRows = baseRows.map((row) => {
      const copy = {};
      for (const col of baseColumns) copy[columnAliases[baseIdx][col]] = row[col];
      return copy;
    });

    const joined = new Set([baseIdx]);
    const pending = steps.filter((item) => item.idx !== baseIdx);

    while (pending.length > 0) {
      const pendingIdx = pending.findIndex((item) => {
        const pivotFrom = item.step._pivotFromStepIdx;
        // Forward: is this step's parent already joined?
        if (pivotFrom !== undefined && joined.has(pivotFrom)) return true;
        // Adjacent fallback (no explicit pivot parent — linear chain)
        if (pivotFrom === undefined && (joined.has(item.idx - 1) || joined.has(item.idx + 1))) return true;
        // Reverse: is any step that was pivoted FROM this step already joined?
        // This enables walking UP the tree from a leaf/branch master back to the root.
        for (const jIdx of joined) {
          const jStep = chainSteps.value[jIdx];
          if (jStep && jStep._pivotFromStepIdx === item.idx) return true;
        }
        return false;
      });
      if (pendingIdx === -1) break;

      const { step, idx, rows } = pending.splice(pendingIdx, 1)[0];
      joined.add(idx);

      // Determine "connect-to" step: the already-joined step we join through
      let parentIdx = step._pivotFromStepIdx;
      if (parentIdx !== undefined && joined.has(parentIdx)) {
        // Forward direction: this step's pivot parent is already joined — use it
      } else {
        // Try reverse: find a child in `joined` that was pivoted FROM this step
        let reverseChild = null;
        for (const jIdx of joined) {
          if (jIdx === idx) continue;
          const jStep = chainSteps.value[jIdx];
          if (jStep && jStep._pivotFromStepIdx === idx) {
            reverseChild = jIdx;
            break;
          }
        }
        if (reverseChild !== null) {
          parentIdx = reverseChild;
        } else if (parentIdx === undefined) {
          parentIdx = joined.has(idx - 1) ? idx - 1 : idx + 1;
        }
        // else: parentIdx is set but not in joined — the join will fail gracefully below
      }
      const parentRows = steps.find((item) => item.idx === parentIdx)?.rows || [];

      let outputJoinCol;
      let incomingJoinCol;
      if (parentIdx < idx) {
        const { leftCol, rightCol } = getJoinColumns(parentIdx, idx, parentRows, rows);
        outputJoinCol = columnAliases[parentIdx]?.[leftCol];
        incomingJoinCol = rightCol;
      } else {
        const { leftCol, rightCol } = getJoinColumns(idx, parentIdx, rows, parentRows);
        outputJoinCol = columnAliases[parentIdx]?.[rightCol];
        incomingJoinCol = leftCol;
      }
      if (!outputJoinCol || !incomingJoinCol) continue;

      const statusCol = `S${idx + 1}_Status`;
      usedColumns.add(statusCol);
      colSteps[statusCol] = idx;

      // NOTE: getGridColumns applies _hiddenColumns for step card display,
      // but we must use ALL columns for the combined flat table join.
      let rowColumns = rows.length ? Object.keys(rows[0]) : (() => {
        const tableKey = step.targetTable || step.table;
        // Use raw column list from tablesMeta, bypassing _hiddenColumns
        const meta = tablesMeta?.value?.find(t => t.key === tableKey);
        return meta?.columns ? meta.columns.map(c => c.dbColumn) : getGridColumns(step);
      })();

      const aliases = {};
      columnAliases[idx] = aliases;
      rowColumns.forEach((col) => {
        // ponytail: ทุก step prefix S{N}_ รวม master (ดูบล็อก baseColumns ด้านบน)
        const alias = `S${idx + 1}_${col}`;
        aliases[col] = alias;
        usedColumns.add(alias);
        usedColumnsLower.add(alias.toLowerCase());
        colSteps[alias] = idx;
        colOrigins[alias] = col;
      });

      // ponytail: one-to-many lookup — each key maps to ARRAY of rows (fan-out support)
      // ประกาศ: key lowercase — SQL pivot match แบบ ci collation แต่ JS เป็น case-sensitive
      // (เช่น store_lot 'velx0BH...' vs LOT_NO 'VELX0BH...') ไม่ normalize แล้ว join หลุดทุกแถว
      const lookup = new Map();
      rows.forEach((row) => {
        const key = String(row[incomingJoinCol] ?? '').trim().toLowerCase();
        if (key) {
          if (!lookup.has(key)) lookup.set(key, []);
          lookup.get(key).push(row);
        }
      });

      // ponytail: sibling branch = อีก step ที่ pivot จาก parent เดียวกันและ join เข้ามาแล้ว
      // สองสายที่แตกจาก parent ตัวเดียวกันเป็น "ทางเลือก" ของ parent นั้น ไม่ใช่ลูกโซ่ต่อกัน
      // fan-out ทั้งสองข้างพร้อมกัน = cartesian (14,785 x 12,920/77 ≈ 2.5M แถวซ้ำ ไม่มีความหมาย)
      // เอา match แรกของสายที่มาทีหลัง แล้วรายงานจำนวนที่ตัดทิ้งให้ UI เตือน
      let siblingJoined = false;
      for (const jIdx of joined) {
        if (jIdx === idx || jIdx === parentIdx) continue;
        if (chainSteps.value[jIdx]?._pivotFromStepIdx === parentIdx) { siblingJoined = true; break; }
      }
      let suppressedMatches = 0;

      // ponytail: fan-out join — when incoming step has multiple rows per key, expand outputRows
      const expandedRows = [];
      let overflow = false;
      outputRows.forEach((outRow) => {
        if (overflow) return;
        const key = String(outRow[outputJoinCol] ?? '').trim().toLowerCase();
        let matches = key ? lookup.get(key) : undefined;
        if (siblingJoined && matches && matches.length > 1) {
          suppressedMatches += matches.length - 1;
          matches = [matches[0]];
        }

        if (matches && matches.length > 0) {
          // Fan-out: create one output row per match
          matches.forEach((match) => {
            if (expandedRows.length >= MAX_COMBINED_ROWS) { overflow = true; return; }
            const newRow = { ...outRow }; // clone current row
            newRow[statusCol] = 'MATCH';
            rowColumns.forEach((col) => {
              newRow[aliases[col]] = match[col];
            });
            expandedRows.push(newRow);
          });
        } else {
          // No match: keep original row with null columns
          outRow[statusCol] = 'NA (WIP)';
          rowColumns.forEach((col) => {
            outRow[aliases[col]] = null;
          });
          expandedRows.push(outRow);
        }
      });
      if (suppressedMatches > 0) {
        combinedFanOutSuppressed.value[idx] = suppressedMatches;
      }
      if (overflow) {
        // Keep the capped rows (data up to here is fully joined), mark the rest
        combinedTruncated.value = true;
        outputRows.slice(expandedRows.length).forEach((outRow) => {
          outRow[statusCol] = 'TRUNCATED';
          expandedRows.push(outRow);
        });
      }

      // Replace outputRows with expanded version
      // ponytail: loop push — spread into splice() dies on >~65k args (Maximum call stack)
      outputRows.length = 0;
      expandedRows.forEach((r) => outputRows.push(r));
    }

    return {
      rows: markRaw(outputRows),
      colSteps,
      colOrigins
    };
  }

  function getCombinedRows() {
    return filteredCombinedData.value;
  }

  function trimCombinedMaster(stepCount) {
    if (manualCombineMasterIdx.value >= stepCount) manualCombineMasterIdx.value = -1;
  }

  function resetCombinedState() {
    manualCombineMasterIdx.value = -1;
    combinedPage.value = 1;
    combinedPageSize.value = 50;
    combinedFilterText.value = '';
    debouncedCombinedFilter.value = '';
    const nextFilters = {};
    combinedCols.value.forEach((col) => {
      nextFilters[col] = isDateColumnName(col) ? null : [];
    });
    combinedColFilters.value = nextFilters;
  }

  const hasActiveCombinedFilters = computed(() => {
    if (combinedFilterText.value.trim() !== '') return true;
    return Object.keys(combinedColFilters.value).some((col) => {
      const val = combinedColFilters.value[col];
      if (isDateColumnName(col)) {
        return Array.isArray(val) && val.length === 2 && val[0] && val[1];
      }
      if (Array.isArray(val)) return val.length > 0;
      return val && String(val).trim() !== '';
    });
  });

  function clearAllCombinedFilters() {
    combinedFilterText.value = '';
    debouncedCombinedFilter.value = '';
    const nextFilters = {};
    combinedCols.value.forEach((col) => {
      nextFilters[col] = isDateColumnName(col) ? null : [];
    });
    combinedColFilters.value = nextFilters;
  }

  return {
    manualCombineMasterIdx,
    combinedPage,
    combinedPageSize,
    combinedFilterText,
    combinedColFilters,
    combinedData,
    combinedCols,
    combinedColSteps,
    combinedColOrigins,
    filteredCombinedData,
    paginatedCombinedData,
    combinedTruncated,
    combinedFanOutSuppressed,
    hasActiveCombinedFilters,
    buildCombinedRows,
    getCombinedRows,
    trimCombinedMaster,
    resetCombinedState,
    clearAllCombinedFilters,
  };
}
