// Enables ts-reset across the backend.
// ts-reset patches global JS API types to be safer, e.g.:
//   - JSON.parse(...) / Response.json() return `unknown` instead of `any`
//     (forces you to validate DB-row / API JSON before use)
//   - array.filter(Boolean) correctly narrows out null/undefined/false
//   - array.includes() accepts wider types without silently widening
//
// This is type-only: it changes what the editor/tsc see, NOT runtime behavior.
// Bun strips types at run time and there is no `tsc` build gate, so any new
// red squiggles are advisory — fix them incrementally, nothing breaks at run time.
import "@total-typescript/ts-reset";
