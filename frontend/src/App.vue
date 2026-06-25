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
