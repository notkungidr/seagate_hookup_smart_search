/**
 * Zod schemas for backend responses (scaffold / starter set).
 * ---------------------------------------------------------------------------
 * Add a schema here each time a new feature consumes an endpoint. These are
 * EXAMPLES wired to the real response envelope; extend as needed.
 *
 * Backend convention: most endpoints return `{ success, data, message }`.
 */
import { z } from 'zod';

/**
 * Standard success envelope used by most backend routes.
 * Usage: envelope(z.array(MyRow))  ->  { success, data: MyRow[], message? }
 * @template T
 * @param {import('zod').ZodType<T>} dataSchema
 */
export const envelope = (dataSchema) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    message: z.string().optional(),
  });

/** GET /api/config — central batch-size config (see appConfig.js). */
export const AppConfigResponse = z.object({
  success: z.boolean(),
  config: z
    .object({
      pivotBatchSize: z.union([z.number(), z.string()]).optional(),
    })
    .partial()
    .optional(),
});

/**
 * GET /api/v1/endpoints — Saved API directory list.
 * Loose by design (passthrough) so new backend fields don't break the client;
 * only the fields the UI relies on are asserted.
 */
export const SavedEndpoint = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    apiGroup: z.string().optional(),
    visibility: z.enum(['public', 'restricted']).optional(),
    createdBy: z.string().optional(),
  })
  .passthrough();

export const EndpointListResponse = envelope(z.array(SavedEndpoint));

/**
 * Trace rows from GET/POST /api/v1/trace/:id are dynamically keyed
 * (physical column names per combineSteps), so model a row as an open record.
 */
export const TraceRow = z.record(z.string(), z.unknown());
export const TraceResponse = z.array(TraceRow);
