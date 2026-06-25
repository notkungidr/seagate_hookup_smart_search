<template>
  <el-dialog
    :model-value="modelValue"
    title="Export Data"
    width="720px"
    :close-on-click-modal="true"
    destroy-on-close
    class="export-dialog"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="export-dialog-content">
      <div class="export-warning-banner" v-if="totalSelectedRows > 50000 && exportFormat === 'xlsx'">
        <span class="warning-icon">!</span>
        <div>
          <strong>Large data set: {{ totalSelectedRows.toLocaleString() }} rows</strong>
          <p>Standard .xlsx may open slowly. Use Binary .xlsb or CSV for faster handling.</p>
        </div>
      </div>

      <div class="export-format-section">
        <span class="section-title">File Format</span>
        <div class="format-options-group">
          <div class="format-card" :class="{ 'is-selected': exportFormat === 'xlsb' }" @click="$emit('set-format', 'xlsb')">
            <div class="format-card-header">
              <span class="format-badge recommended">Recommended</span>
              <span class="format-extension">.xlsb</span>
            </div>
            <div class="format-card-body">
              <strong>Binary Excel Workbook</strong>
              <p>Best for large exports. Smaller files and faster Excel open time.</p>
            </div>
          </div>

          <div class="format-card" :class="{ 'is-selected': exportFormat === 'csv' }" @click="$emit('set-format', 'csv')">
            <div class="format-card-header">
              <span class="format-badge instant">Fastest</span>
              <span class="format-extension">.csv</span>
            </div>
            <div class="format-card-body">
              <strong>CSV with UTF-8 BOM</strong>
              <p>Single-sheet export that opens quickly and supports Thai text.</p>
            </div>
          </div>

          <div class="format-card" :class="{ 'is-selected': exportFormat === 'xlsx' }" @click="$emit('set-format', 'xlsx')">
            <div class="format-card-header">
              <span class="format-extension">.xlsx</span>
            </div>
            <div class="format-card-body">
              <strong>Standard Excel Sheet</strong>
              <p>Useful for smaller exports and normal workbook workflows.</p>
            </div>
          </div>
        </div>
      </div>

      <div class="export-preset-section">
        <span class="section-title">Presets</span>
        <div class="preset-buttons">
          <el-button size="default" type="primary" plain @click="$emit('set-preset', 'combined')" :disabled="chainSteps.length <= 1">
            Combined only
          </el-button>
          <el-button size="default" type="success" plain @click="$emit('set-preset', 'all')" :disabled="exportFormat === 'csv'">
            All sheets
          </el-button>
          <el-button size="default" type="info" plain @click="$emit('set-preset', 'steps')" :disabled="exportFormat === 'csv'">
            Step sheets
          </el-button>
        </div>
        <div v-if="exportFormat === 'csv'" class="format-note">
          CSV supports one sheet per export.
        </div>
      </div>

      <div class="export-selector-section">
        <span class="section-title">Sheets</span>
        <div class="sheet-select-list">
          <div
            v-if="chainSteps.length > 1"
            class="sheet-select-item combined-item"
            :class="{ 'is-selected': exportOptions.includeCombined }"
            @click="$emit('toggle-combined')"
          >
            <el-checkbox :model-value="exportOptions.includeCombined" @change="$emit('toggle-combined')" @click.stop />
            <span class="sheet-icon">C</span>
            <div class="sheet-info">
              <span class="sheet-label">Combined Sheet</span>
              <span class="sheet-count">{{ combinedData.length.toLocaleString() }} rows</span>
            </div>
          </div>

          <div
            v-for="(step, idx) in chainSteps"
            :key="'export-step-' + step._uid"
            class="sheet-select-item"
            :class="{ 'is-selected': exportOptions.selectedSteps.includes(idx), 'is-empty': step.total === 0 }"
            @click="$emit('toggle-step', idx)"
          >
            <el-checkbox :model-value="exportOptions.selectedSteps.includes(idx)" @change="$emit('toggle-step', idx)" @click.stop />
            <span class="sheet-icon">{{ step.total === 0 ? '0' : idx + 1 }}</span>
            <div class="sheet-info">
              <span class="sheet-label">Step {{ idx + 1 }}: {{ step.tableLabel }}</span>
              <span class="sheet-count">{{ getFilteredRows(idx).length.toLocaleString() }} rows</span>
            </div>
          </div>
        </div>
      </div>

      <div class="export-summary-box">
        <div class="summary-row">
          <span>Sheets:</span>
          <strong>{{ totalSelectedSheets }}</strong>
        </div>
        <div class="summary-row">
          <span>Total rows:</span>
          <strong :style="totalSelectedRows > 1000000 ? 'color:#f56c6c' : (totalSelectedRows > 500000 ? 'color:#e6a23c' : 'color:#67c23a')">
            {{ totalSelectedRows.toLocaleString() }}
          </strong>
        </div>
        <div class="summary-status-badge" :class="exportStatusClass">
          {{ exportStatusText }}
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button size="large" @click="$emit('update:modelValue', false)">Cancel</el-button>
        <el-button type="success" size="large" :disabled="totalSelectedSheets === 0" @click="$emit('confirm')">
          Download
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
defineProps({
  modelValue: { type: Boolean, required: true },
  exportFormat: { type: String, required: true },
  exportOptions: { type: Object, required: true },
  chainSteps: { type: Array, required: true },
  combinedData: { type: Array, required: true },
  totalSelectedRows: { type: Number, required: true },
  totalSelectedSheets: { type: Number, required: true },
  exportStatusClass: { type: String, required: true },
  exportStatusText: { type: String, required: true },
  getFilteredRows: { type: Function, required: true },
});

defineEmits([
  'update:modelValue',
  'set-format',
  'set-preset',
  'toggle-combined',
  'toggle-step',
  'confirm',
]);
</script>

<style scoped>
:deep(.export-dialog) {
  border-radius: 16px !important;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.15) !important;
  overflow: hidden;
}
.export-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.export-warning-banner {
  display: flex;
  gap: 12px;
  background: #fdf6ec;
  border-left: 4px solid #e6a23c;
  padding: 12px 16px;
  border-radius: 8px;
}
.warning-icon {
  font-size: 1rem;
  font-weight: 800;
  color: #e6a23c;
}
.export-warning-banner strong {
  color: #e6a23c;
  font-size: 0.88rem;
  display: block;
  margin-bottom: 4px;
}
.export-warning-banner p,
.format-note {
  margin: 0;
  font-size: 0.78rem;
  color: #8c6f3d;
  line-height: 1.4;
}
.section-title {
  font-size: 0.82rem;
  font-weight: 700;
  color: #606266;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.export-format-section,
.export-preset-section,
.export-selector-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.format-options-group {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.format-card {
  background: white;
  border: 2px solid #e4e7ed;
  border-radius: 12px;
  padding: 14px;
  cursor: pointer;
  transition: all 0.25s ease;
  min-height: 120px;
}
.format-card:hover {
  border-color: #c0c4cc;
  transform: translateY(-2px);
}
.format-card.is-selected {
  border-color: #409eff;
  background: #f2f8ff;
  box-shadow: 0 4px 14px rgba(64, 158, 255, 0.15);
}
.format-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.format-extension {
  font-size: 1.1rem;
  font-weight: 700;
  color: #909399;
  font-family: monospace;
}
.format-badge {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
}
.format-badge.recommended {
  background: #ecf5ff;
  color: #409eff;
  border: 1px solid #b3d8ff;
}
.format-badge.instant {
  background: #f0f9eb;
  color: #67c23a;
  border: 1px solid #c2e7b0;
}
.format-card-body strong {
  font-size: 0.82rem;
  color: #303133;
}
.format-card-body p {
  margin: 4px 0 0;
  font-size: 0.72rem;
  color: #909399;
  line-height: 1.35;
}
.preset-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.sheet-select-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 8px;
  background: #fafafa;
}
.sheet-select-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: white;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  cursor: pointer;
}
.sheet-select-item:hover {
  border-color: #c0c4cc;
  background: #f5f7fa;
}
.sheet-select-item.is-selected {
  border-color: #409eff;
  background: #ecf5ff;
}
.sheet-select-item.is-empty {
  opacity: 0.6;
}
.sheet-icon {
  width: 24px;
  text-align: center;
  font-weight: 700;
  color: #409eff;
}
.sheet-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sheet-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #303133;
}
.sheet-count {
  font-size: 0.75rem;
  color: #909399;
}
.export-summary-box {
  background: #f4f4f5;
  border-radius: 10px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.summary-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.82rem;
  color: #606266;
}
.summary-status-badge {
  margin-top: 6px;
  padding: 8px;
  border-radius: 6px;
  font-size: 0.78rem;
  text-align: center;
  font-weight: 600;
}
.badge-success {
  background: #e1f3d8;
  color: #67c23a;
}
.badge-warning {
  background: #faecd8;
  color: #e6a23c;
}
.badge-danger {
  background: #fde2e2;
  color: #f56c6c;
}
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
@media (max-width: 768px) {
  .format-options-group {
    grid-template-columns: 1fr;
  }
}
</style>
