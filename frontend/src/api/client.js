/**
 * Type-safe API client (scaffold) — powered by zod-fetch.
 * ---------------------------------------------------------------------------
 * READY-TO-USE for NEW features. Existing components still use raw `fetch(...)`
 * and are intentionally left untouched. Adopt this gradually: when you build a
 * new feature that calls the backend, define a Zod schema for the response and
 * call it through `apiGet` / `apiPost` below. The response is validated at the
 * network boundary, so a backend shape change surfaces here as a clear Zod
 * error instead of an `undefined` deep inside a Vue template.
 *
 * Conventions mirrored from the existing code:
 *   - Base URL comes from the same `apiBase` prop/value used across components
 *     (see TraceabilityFlow.vue `API_BASE`). Pass it in explicitly.
 *   - Auth header `x-user-en` is read from localStorage['sg_admin_user'],
 *     exactly like ApiManagerDialog.vue `authHeaders()`.
 *
 * NOTE: frontend is plain JS, so the benefit is RUNTIME validation (+ JSDoc
 * editor hints), not compile-time types.
 */
import { z } from 'zod';
import { createZodFetcher } from 'zod-fetch';

// zod-fetch wraps the global fetch; response is parsed then validated by schema.
const zodFetch = createZodFetcher();

/** Build auth headers the same way ApiManagerDialog.vue does. */
export function authHeaders(extra = {}) {
  const h = { ...extra };
  try {
    const admin = JSON.parse(localStorage.getItem('sg_admin_user') || 'null');
    if (admin?.en) h['x-user-en'] = String(admin.en);
  } catch {
    /* malformed storage — proceed without the header */
  }
  return h;
}

/**
 * GET + validate.
 * @template T
 * @param {import('zod').ZodType<T>} schema  Zod schema for the response JSON
 * @param {string} url                       full URL (e.g. `${apiBase}/api/...`)
 * @param {RequestInit} [init]               extra fetch options
 * @returns {Promise<T>}
 */
export function apiGet(schema, url, init = {}) {
  return zodFetch(schema, url, {
    ...init,
    headers: authHeaders(init.headers),
  });
}

/**
 * POST JSON + validate.
 * @template T
 * @param {import('zod').ZodType<T>} schema  Zod schema for the response JSON
 * @param {string} url                       full URL
 * @param {unknown} body                     request body (JSON-serialized)
 * @param {RequestInit} [init]               extra fetch options
 * @returns {Promise<T>}
 */
export function apiPost(schema, url, body, init = {}) {
  return zodFetch(schema, url, {
    method: 'POST',
    ...init,
    headers: authHeaders({ 'Content-Type': 'application/json', ...(init.headers || {}) }),
    body: JSON.stringify(body),
  });
}

// Re-export zod so feature modules can `import { z } from '@/api/client'`.
export { z };
