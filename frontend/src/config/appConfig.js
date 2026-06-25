import { ref } from 'vue';

// Default value (fallback if backend cannot be reached)
export const PIVOT_BATCH_SIZE = ref(5000);

export async function fetchAppConfig(apiBase) {
  try {
    const res = await fetch(`${apiBase}/api/config`);
    const json = await res.json();
    if (json.success && json.config && json.config.pivotBatchSize) {
      PIVOT_BATCH_SIZE.value = Number(json.config.pivotBatchSize);
      console.log(`[Config] Centralized BATCH_SIZE updated from backend:`, PIVOT_BATCH_SIZE.value);
    }
  } catch (err) {
    console.warn('[Config] Failed to fetch config from backend, using default value:', PIVOT_BATCH_SIZE.value, err);
  }
}
