import { computed, reactive, watch } from 'vue';

export function useChainTracker(chainSteps) {
  const currentPage = reactive({});
  const pageSize = reactive({});
  const localFilters = reactive({});
  const debouncedFilters = reactive({});
  const localFilterTimers = {};

  watch(localFilters, (filters) => {
    Object.keys(filters).forEach((idx) => {
      clearTimeout(localFilterTimers[idx]);
      localFilterTimers[idx] = setTimeout(() => {
        debouncedFilters[idx] = filters[idx];
        currentPage[idx] = 1;
      }, 300);
    });
  }, { deep: true });

  function initStepPaging(idx) {
    currentPage[idx] = 1;
    pageSize[idx] = 50;
    localFilters[idx] = '';
    debouncedFilters[idx] = '';
  }

  function pruneStepPaging(length) {
    Object.keys(currentPage).forEach((key) => {
      if (Number(key) >= length) clearStepPaging(key);
    });
  }

  function ensureStepPaging(length) {
    for (let idx = 0; idx < length; idx++) {
      if (currentPage[idx] === undefined) initStepPaging(idx);
    }
  }

  function clearStepPaging(idx) {
    delete currentPage[idx];
    delete pageSize[idx];
    delete localFilters[idx];
    delete debouncedFilters[idx];
  }

  function clearStepPagingFrom(startIdx, endExclusive = chainSteps.value.length + 5) {
    for (let idx = startIdx; idx < endExclusive; idx++) {
      clearStepPaging(idx);
    }
  }

  function resetStepTracking() {
    Object.keys(currentPage).forEach(clearStepPaging);
  }

  const filteredRowsByStep = computed(() => chainSteps.value.map((step, idx) => {
    if (!step?.rows) return [];
    const filter = (debouncedFilters[idx] || '').trim().toLowerCase();
    if (!filter) return step.rows;
    return step.rows.filter((row) => Object.values(row).some((value) => (
      value !== null && value !== undefined && String(value).toLowerCase().includes(filter)
    )));
  }));

  function getFilteredRows(idx) {
    return filteredRowsByStep.value[idx] || [];
  }

  function getPaginatedRows(idx) {
    const rows = getFilteredRows(idx);
    const page = currentPage[idx] || 1;
    const size = pageSize[idx] || 50;
    return rows.slice((page - 1) * size, page * size);
  }

  return {
    currentPage,
    pageSize,
    localFilters,
    debouncedFilters,
    initStepPaging,
    pruneStepPaging,
    ensureStepPaging,
    clearStepPagingFrom,
    resetStepTracking,
    getFilteredRows,
    getPaginatedRows,
  };
}
