---
name: vue3-component
description: >-
  Base skill for writing and editing Vue 3 components and composables. Use
  whenever creating a new .vue file, refactoring an existing one, building a
  composable (use* function), or wiring component state, props/emits, or
  reactivity. Defaults to <script setup> + Composition API. General-purpose —
  not tied to any single project's domain.
---

# Vue 3 Component & Composable — Base Skill

Write idiomatic Vue 3 using `<script setup>` and the Composition API. Match the
surrounding file's existing style (import order, naming, spacing) before
applying any preference below.

## Component skeleton (`<script setup>`)
Order blocks: `<template>` → `<script setup>` → `<style scoped>`.

```vue
<template>
  <div class="my-widget">{{ label }}</div>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
  items: { type: Array, default: () => [] },   // arrays/objects MUST use a factory default
});
const emit = defineEmits(['update:modelValue', 'submit']);

const open = ref(false);
const label = computed(() => props.modelValue || 'empty');

function commit(val) {
  emit('update:modelValue', val);   // mutate parent state via emit, never write props
}
</script>

<style scoped>
.my-widget { padding: 8px; }
</style>
```

## Reactivity rules
- `ref()` for primitives and when you reassign the whole value; `reactive()` for
  objects you mutate in place. Don't mix both views of one piece of state.
- A `ref` reassignment must go through `.value` in script. In template it
  auto-unwraps — don't write `.value` there.
- `computed()` for derived values — never duplicate derived state into a
  separate `ref` you update by hand; it drifts.
- `watch(source, cb)` for side effects on change; `watchEffect` when you want it
  to run once immediately and re-run on any tracked dep. Prefer `computed` over
  `watch` when you only need a derived value.

## Props & emits (one-way data flow)
- Props are read-only. To "change a prop", `emit('update:xxx', newValue)` and let
  the parent own the state (`v-model:xxx` or `@update:xxx`).
- Object/array prop defaults MUST be a factory: `default: () => []`. A literal
  `[]`/`{}` is shared across all instances — a real bug.
- Declare every emit in `defineEmits`. Undeclared emits are silent no-ops in
  strict setups and hurt readability.

### shallowRef / shallowReactive pitfall
- If a parent holds state in `shallowRef([])` (common for large arrays/perf) and
  passes it as a prop, Vue auto-unwraps it to the raw value in the child.
  Assigning `props.theRef.value = newArr` inside the child is a **silent no-op**.
- Fix: the child emits an update event (`emit('update:items', newArr)`) and the
  parent reassigns, OR pass an `updateX(newVal)` callback prop the child calls.
  Keep data flowing one way. Never reach into a parent ref from a child.

## Composables (`use*` functions)
- Name `useXxx`, return refs/computed/functions — an object of named members, not
  a positional array (unless mimicking a known API).
- Accept dependencies as arguments (callbacks, refs) instead of importing
  singletons, so they stay testable and reusable.
- Don't call lifecycle hooks (`onMounted`, etc.) conditionally — call them at the
  top level of the composable so Vue can register them.
- Side effects that need teardown: register cleanup in `onScopeDispose` or return
  a `stop()` the caller invokes.

## v-for / keys / conditionals
- Every `v-for` needs a stable, unique `:key` — prefer an id, not the array
  index (index keys break on reorder/insert).
- Don't put `v-if` and `v-for` on the same element. Wrap with `<template v-for>`
  + inner `v-if`, or filter via a `computed`.

## Lists, async & UX
- Guard async UI with loading/error refs; reset them in `finally`.
- Use `nextTick()` when you must read/measure the DOM right after a state change.
- For long lists, key correctly and consider not making every row deeply
  reactive (`shallowRef`/`markRaw` for big static datasets).

## Style & accessibility
- Prefer `<style scoped>`. Reach for `:deep()` only to style child-component
  internals deliberately.
- Interactive elements need real semantics: `<button>` for actions, `:disabled`
  while pending, `aria-*`/labels on custom controls, visible focus states.

## Before finishing
- Confirm the component still builds (`npm run build`) when changes are
  non-trivial.
- No leftover `console.log`, no unused imports/refs.
- Reused logic (3rd repeat) → extract a composable rather than copy-paste.
