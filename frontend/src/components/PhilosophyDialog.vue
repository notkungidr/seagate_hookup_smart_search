<template>
  <el-dialog
    :model-value="modelValue"
    title="Why Staircase Drill-Down?"
    width="80%"
    class="philosophy-dialog"
    destroy-on-close
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="ph-dialog-content">
      <div class="ph-intro-section">
        <div class="ph-intro-glowing-icon">↔</div>
        <div class="ph-intro-text">
          <h3>Traceability should move step by step, not load every process at once.</h3>
          <p>
            This system searches one process table at a time, then pivots only the filtered values to the next table.
            That keeps MySQL 5.x stable, makes missing WIP easier to isolate, and lets engineers move forward or backward through the production chain.
          </p>
        </div>
      </div>

      <div class="ph-comparison-grid">
        <div class="ph-card traditional-card">
          <div class="ph-card-badge red-badge">Old: Single-Shot</div>
          <h4 class="ph-card-title">One large query joins everything together.</h4>
          <ul class="ph-card-points">
            <li><strong>Slow and fragile:</strong> large joins can hit timeout and overload the database.</li>
            <li><strong>Hard to adjust:</strong> new tables or alternate keys force custom SQL changes.</li>
            <li><strong>Hard to inspect:</strong> WIP loss is hidden inside one wide result set.</li>
          </ul>
        </div>

        <div class="ph-card smart-card">
          <div class="ph-card-badge green-badge">Current: Staircase</div>
          <h4 class="ph-card-title">Each step searches, filters, then pivots to the next table.</h4>
          <ul class="ph-card-points">
            <li><strong>Fast:</strong> every hop queries an indexed table with bounded input values.</li>
            <li><strong>Flexible:</strong> links come from `tableRegistry.ts`, so new paths do not require frontend rewrites.</li>
            <li><strong>Auditable:</strong> every step remains visible and can be filtered before continuing.</li>
          </ul>
        </div>
      </div>

      <div class="ph-visual-flow">
        <span class="visual-title">How a chain runs</span>
        <div class="ph-flow-steps">
          <div class="ph-flow-item">
            <span class="flow-num">1</span>
            <strong>Master Chain</strong>
            <span>Search the starting table.</span>
          </div>
          <div class="ph-flow-arrow">→</div>
          <div class="ph-flow-item filter-bg">
            <span class="flow-num">2</span>
            <strong>Local Filter</strong>
            <span>Keep only relevant rows.</span>
          </div>
          <div class="ph-flow-arrow">→</div>
          <div class="ph-flow-item pivot-bg">
            <span class="flow-num">3</span>
            <strong>Pivot</strong>
            <span>Send filtered values using physical DB keys.</span>
          </div>
          <div class="ph-flow-arrow">→</div>
          <div class="ph-flow-item combined-bg">
            <span class="flow-num">4</span>
            <strong>Combined View</strong>
            <span>Merge chain results for export.</span>
          </div>
        </div>
        <div class="ph-flow-footer">
          Critical rule: pivot extraction must use `fromDbColumn`, and bulk pivot calls must remain batched at 100 values.
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button type="primary" size="large" style="min-width: 160px;" @click="$emit('update:modelValue', false)">
          Understood
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
defineProps({
  modelValue: { type: Boolean, required: true },
});

defineEmits(['update:modelValue']);
</script>

<style scoped>
:deep(.philosophy-dialog) {
  border-radius: 16px !important;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.22) !important;
  overflow: hidden;
  max-width: 1400px;
}
:deep(.philosophy-dialog .el-dialog__header) {
  background: linear-gradient(135deg, hsl(218, 75%, 18%) 0%, hsl(230, 70%, 12%) 100%);
  margin-right: 0;
  padding: 22px 28px;
}
:deep(.philosophy-dialog .el-dialog__title),
:deep(.philosophy-dialog .el-dialog__headerbtn .el-dialog__close) {
  color: white;
}
:deep(.philosophy-dialog .el-dialog__title) {
  font-weight: 700;
  font-size: 1.3rem;
}
:deep(.philosophy-dialog .el-dialog__body) {
  padding: 28px !important;
}
.ph-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.ph-intro-section {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  background: linear-gradient(135deg, #f0f4f8, #e8f0fe);
  padding: 16px 20px;
  border-radius: 12px;
  border-left: 5px solid #409eff;
}
.ph-intro-glowing-icon {
  font-size: 2rem;
  background: white;
  padding: 8px 12px;
  border-radius: 50%;
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.15);
}
.ph-intro-text h3 {
  margin: 0 0 6px;
  font-size: 1.1rem;
  font-weight: 700;
  color: #1a202c;
}
.ph-intro-text p {
  margin: 0;
  font-size: 0.88rem;
  color: #4a5568;
  line-height: 1.6;
}
.ph-comparison-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.ph-card {
  background: white;
  border: 2px solid #e4e7ed;
  border-radius: 12px;
  padding: 18px;
}
.traditional-card {
  border-color: #fde2e2;
  background: #fffcfc;
}
.smart-card {
  border-color: #e1f3d8;
  background: #fcfdfb;
}
.ph-card-badge {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 4px 12px;
  border-radius: 20px;
  width: fit-content;
  margin-bottom: 12px;
  text-transform: uppercase;
}
.red-badge {
  background: #fde2e2;
  color: #f56c6c;
  border: 1px solid #fbc4c4;
}
.green-badge {
  background: #e1f3d8;
  color: #67c23a;
  border: 1px solid #c2e7b0;
}
.ph-card-title {
  margin: 0 0 14px;
  font-size: 1.05rem;
  font-weight: 700;
  color: #2d3748;
}
.ph-card-points {
  margin: 0;
  padding-left: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 0.85rem;
  color: #4a5568;
  line-height: 1.6;
}
.ph-visual-flow {
  background: #f7fafc;
  border: 1px solid #edf2f7;
  border-radius: 12px;
  padding: 16px 20px;
}
.visual-title {
  display: block;
  font-size: 0.9rem;
  font-weight: 700;
  color: #4a5568;
  margin-bottom: 16px;
  text-align: center;
}
.ph-flow-steps {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.ph-flow-item {
  flex: 1;
  background: white;
  border: 1.5px solid #cbd5e0;
  border-radius: 10px;
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  position: relative;
  min-height: 110px;
}
.ph-flow-item .flow-num {
  position: absolute;
  top: -8px;
  left: 50%;
  transform: translateX(-50%);
  background: #718096;
  color: white;
  font-size: 0.7rem;
  font-weight: 700;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid white;
}
.ph-flow-item strong {
  font-size: 0.85rem;
  color: #2d3748;
  margin-top: 4px;
  margin-bottom: 6px;
}
.ph-flow-item span {
  font-size: 0.74rem;
  color: #718096;
  line-height: 1.35;
}
.filter-bg {
  border-color: #e6a23c;
  background: #fdfaf6;
}
.filter-bg .flow-num {
  background: #e6a23c;
}
.pivot-bg {
  border-color: #67c23a;
  background: #f8fdf6;
}
.pivot-bg .flow-num {
  background: #67c23a;
}
.combined-bg {
  border-color: #409eff;
  background: #f4f9ff;
}
.combined-bg .flow-num {
  background: #409eff;
}
.ph-flow-arrow {
  font-size: 1.3rem;
  color: #a0aec0;
  font-weight: bold;
}
.ph-flow-footer {
  background: #ecf5ff;
  border-radius: 8px;
  padding: 10px 16px;
  font-size: 0.82rem;
  color: #409eff;
  line-height: 1.5;
}
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
@media (max-width: 768px) {
  .ph-comparison-grid {
    grid-template-columns: 1fr;
  }
  .ph-flow-steps {
    flex-direction: column;
  }
  .ph-flow-arrow {
    transform: rotate(90deg);
  }
}
</style>
