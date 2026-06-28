<template>
  <div class="app-wrapper">
    <TraceabilityFlow />
  </div>
</template>

<script setup>
import TraceabilityFlow from './components/TraceabilityFlow.vue';
</script>

<style>
/* Global resets and styling to match modern UX guidelines */
:root {
  --bg-app: #f0f2f5;
  --bg-card: #ffffff;
  --text-primary: #303133;
  --text-secondary: #606266;
  --border-color: #e4e7ed;
  --shadow-color: rgba(0, 0, 0, 0.05);
  
  /* Nested & custom container styles */
  --bg-condition-card: #f8f9fa;
  --bg-stripe: #fafafa;
  --bg-hover: #f5f7fa;
  --bg-current-row: #ecf5ff;
  --bg-overlay: rgba(255, 255, 255, 0.78);
  
  --transition-speed: 0.3s;

  /* ── Design tokens (Tier 2): modern palette + type scale + spacing.
     ponytail: refresh Element Plus defaults (#409eff) to a Tailwind-style
     palette — a visible shift, not a zero-drift swap — then route the app's
     own colors through these tokens so the whole UI reads as one system. */
  --c-primary: #3b82f6;
  --c-success: #22c55e;
  --c-warning: #f59e0b;
  --c-danger:  #ef4444;
  --c-info:    #6b7280;
  --c-neutral: #64748b;

  --fs-xs:   0.72rem; /* 13px - captions, meta */
  --fs-sm:   0.8rem;  /* 14px - secondary text */
  --fs-base: 0.88rem; /* 16px - body / descriptions */
  --fs-md:   1rem;    /* 18px - emphasized / item titles */
  --fs-lg:   1.3rem;  /* 23px - section headings */
  --fs-xl:   1.6rem;  /* 29px - page title */

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;

  /* Element Plus theme override — refresh the default blue + semantic colors
     to match the token palette so every el-button/input/select/tag recolors. */
  --el-color-primary: #3b82f6;
  --el-color-primary-light-3: #6ba3f9;
  --el-color-primary-light-5: #9cc1fb;
  --el-color-primary-light-7: #c5d9fc;
  --el-color-primary-light-8: #d8e5fd;
  --el-color-primary-light-9: #ebf2fe;
  --el-color-primary-dark-2:  #2f68c5;
  --el-color-success: #22c55e;
  --el-color-success-light-3: #54d178;
  --el-color-success-light-9: #e9f9ef;
  --el-color-warning: #f59e0b;
  --el-color-warning-light-3: #f9b54f;
  --el-color-warning-light-9: #fdf4e3;
  --el-color-danger:  #ef4444;
  --el-color-danger-light-3: #f47676;
  --el-color-danger-light-9: #fdecec;
  --el-color-error:   #ef4444;
  --el-color-info:    #6b7280;
  --el-color-info-light-9: #f1f2f4;
  --el-border-radius-base: 8px;
}

html.dark {
  --bg-app: #0b111e;
  --bg-card: #151e33;
  --text-primary: #e4e7ed;
  --text-secondary: #a8abb2;
  --border-color: #2a354f;
  --shadow-color: rgba(0, 0, 0, 0.3);
  
  /* Nested & custom container styles */
  --bg-condition-card: #1b263e;
  --bg-stripe: #121824;
  --bg-hover: #1c263c;
  --bg-current-row: #1a365d;
  --bg-overlay: rgba(21, 30, 51, 0.78);
}

html, body {
  margin: 0;
  padding: 0;
  background-color: var(--bg-app);
  color: var(--text-primary);
  min-height: 100vh;
  font-family: 'Inter', 'Outfit', 'Helvetica Neue', Arial, sans-serif;
  font-size: 18px !important;
  transition: background-color var(--transition-speed) ease, color var(--transition-speed) ease;
}

.app-wrapper {
  padding: 20px 0;
}
</style>
