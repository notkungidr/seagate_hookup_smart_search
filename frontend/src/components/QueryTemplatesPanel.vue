<template>
  <div class="qt-panel">
    <!-- ── Top bar: Template picker + Save/Manage ─────────────────────────── -->
    <div class="qt-run-bar">
      <el-select
        id="select-saved-template"
        v-model="selectedId"
        placeholder="เลือก Template เพื่อใช้งาน..."
        size="default"
        class="qt-select"
        clearable
        filterable
      >
        <el-option
          v-for="tpl in templates"
          :key="tpl.id"
          :label="tpl.name"
          :value="tpl.id"
        >
          <div class="qt-opt">
            <span class="qt-opt-name">{{ tpl.name }}</span>
            <span class="qt-opt-chain">{{ tpl.stepsChain.join(' → ') }}</span>
          </div>
        </el-option>
      </el-select>

      <el-button
        v-if="adminUser?.permission === 'admin'"
        id="btn-save-current-path"
        size="default"
        :disabled="!canSaveCurrent"
        @click="openSaveModal"
        title="บันทึก path ปัจจุบันเป็น Template"
      >
        <el-icon><Plus /></el-icon>&nbsp;Save current path
      </el-button>

      <el-button
        v-if="adminUser?.permission === 'admin'"
        size="default"
        :disabled="!templates.length"
        @click="manageOpen = true"
      >
        <el-icon><Setting /></el-icon>&nbsp;Manage
      </el-button>
    </div>

    <!-- ── Master Chain Conditions Editor (premium glassmorphic card) ────── -->
    <div v-if="selectedTemplate" class="qt-master-card">
      <div class="qt-master-header">
        <div class="qt-master-title">
          <span class="qt-master-icon">📋</span>
          <div class="qt-master-title-text">
            <div class="qt-master-name">{{ selectedTemplate.name }}</div>
            <div class="qt-master-desc" v-if="selectedTemplate.description">
              {{ selectedTemplate.description }}
            </div>
          </div>
        </div>
        <el-button size="small" text @click="deselectTemplate" title="ยกเลิกการเลือก">
          <el-icon><Close /></el-icon>
        </el-button>
      </div>

      <div class="qt-chain-pills qt-chain-pills--master">
        <template v-for="(t, i) in selectedTemplate.stepsChain" :key="i">
          <span 
            class="qt-pill"
            :class="{ 'qt-pill--active-master': i === selectedStartStepIdx }"
            style="cursor: pointer;"
            @click="selectedStartStepIdx = i"
            :title="`เลือกเป็นจุดตั้งต้นในการรัน (Step ${i + 1})`"
          >
            <span v-if="i > 0 && selectedTemplate.hops[i - 1]?.fromStepIdx !== undefined && selectedTemplate.hops[i - 1]?.fromStepIdx !== i - 1" style="background: rgba(114, 46, 209, 0.15); color: #722ed1; border: 1px solid rgba(114, 46, 209, 0.3); border-radius: 4px; padding: 0px 4px; font-size: 10px; font-weight: bold; margin-right: 4px;">⌥ S{{ selectedTemplate.hops[i - 1].fromStepIdx + 1 }}</span>
            {{ tableLabel(t) }}
          </span>
          <span v-if="i < selectedTemplate.stepsChain.length - 1" class="qt-arrow">→</span>
        </template>
      </div>

      <div class="qt-conditions-block">
        <div class="qt-conditions-title">
          🎯 ปรับแต่งเงื่อนไขเริ่มต้น
          <span class="qt-conditions-sub">(Master Chain Conditions — {{ tableLabel(selectedTemplate.stepsChain[selectedStartStepIdx] || selectedTemplate.rootTable) }})</span>
        </div>

        <div
          v-for="(cond, idx) in templateConditions"
          :key="idx"
          class="qt-condition-row"
        >
          <div class="qt-condition-head">
            <span class="qt-condition-no">#{{ idx + 1 }}</span>
            <el-button
              v-if="templateConditions.length > 1"
              size="small"
              text
              type="danger"
              @click="removeCondition(idx)"
            >
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>

          <div class="qt-condition-fields">
            <div class="qt-condition-row-top">
              <div class="qt-field">
                <label class="qt-field-label">คอลัมน์</label>
                <el-select v-model="cond.column" size="default" filterable style="width:100%">
                  <el-option
                    v-for="col in rootColumns"
                    :key="col.key"
                    :label="col.label"
                    :value="col.key"
                  />
                </el-select>
              </div>

              <div class="qt-field">
                <label class="qt-field-label">Operator</label>
                <el-select v-model="cond.operator" size="default" @change="onOperatorChange(cond)" style="width:100%">
                  <el-option label="LIKE" value="like" />
                  <el-option label="=" value="eq" />
                  <el-option label="IN (multi)" value="in" />
                  <el-option label="BETWEEN" value="between" />
                  <el-option label="≥ (gte)" value="gte" />
                  <el-option label="≤ (lte)" value="lte" />
                </el-select>
              </div>
            </div>

            <div class="qt-field qt-field--value">
              <label class="qt-field-label">ค่า</label>

              <!-- IN: textarea + counter -->
              <div v-if="cond.operator === 'in'">
                <el-input
                  v-model="cond.multiValue"
                  type="textarea"
                  :rows="2"
                  placeholder="คั่นด้วยขึ้นบรรทัดใหม่ หรือเครื่องหมายจุลภาค (,)"
                  size="default"
                />
                <div class="qt-in-count">{{ (cond.values && cond.values.length) ? cond.values.length.toLocaleString() : splitMulti(cond.multiValue).length }} ค่า</div>
              </div>

              <!-- BETWEEN -->
              <template v-else-if="cond.operator === 'between'">
                <div v-if="isDateColumnKey(cond.column)">
                  <el-date-picker
                    v-model="cond.dateRange"
                    type="daterange"
                    range-separator="ถึง"
                    start-placeholder="วันที่เริ่มต้น"
                    end-placeholder="วันที่สิ้นสุด"
                    value-format="YYYY-MM-DD"
                    size="default"
                    style="width:100%"
                  />
                  <!-- Quick Date Presets for Date Range -->
                  <div class="date-preset-bar">
                    <span class="preset-btn" @click="applyDatePreset(cond, 'today')">วันนี้</span>
                    <span class="preset-btn" @click="applyDatePreset(cond, 'yesterday')">เมื่อวาน</span>
                    <span class="preset-btn" @click="applyDatePreset(cond, 'last7')">7 วัน</span>
                    <span class="preset-btn" @click="applyDatePreset(cond, 'last30')">30 วัน</span>
                    <span class="preset-btn" @click="applyDatePreset(cond, 'thisMonth')">เดือนนี้</span>
                  </div>
                </div>
                <div v-else class="qt-between-pair">
                  <el-input v-model="cond.value"  placeholder="จาก..." size="default" />
                  <span class="qt-between-sep">~</span>
                  <el-input v-model="cond.value2" placeholder="ถึง..." size="default" />
                </div>
              </template>

              <!-- gte/lte/like/eq on date column -->
              <template v-else-if="isDateColumnKey(cond.column)">
                <el-date-picker
                  v-model="cond.value"
                  type="date"
                  placeholder="เลือกวันที่"
                  value-format="YYYY-MM-DD"
                  size="default"
                  style="width:100%"
                />
                <!-- Quick Date Presets for Single Date -->
                <div class="date-preset-bar">
                  <span class="preset-btn" @click="applyDatePreset(cond, 'today')">วันนี้</span>
                  <span class="preset-btn" @click="applyDatePreset(cond, 'yesterday')">เมื่อวาน</span>
                  <span class="preset-btn" @click="applyDatePreset(cond, 'last7')">7 วัน</span>
                  <span class="preset-btn" @click="applyDatePreset(cond, 'last30')">30 วัน</span>
                  <span class="preset-btn" @click="applyDatePreset(cond, 'thisMonth')">เดือนนี้</span>
                </div>
              </template>

              <!-- default: text input -->
              <el-input
                v-else
                v-model="cond.value"
                :placeholder="cond.operator === 'like' ? 'ค้นหาแบบ partial...' : 'ระบุค่า'"
                size="default"
                @keyup.enter="onRun"
              />
            </div>
          </div>
        </div>

        <el-button
          link
          type="primary"
          size="small"
          @click="addCondition"
          :disabled="!rootColumns.length"
        >
          ➕ เพิ่มเงื่อนไข
        </el-button>
      </div>

      <div class="qt-master-actions">
        <el-button 
          v-if="adminUser?.permission === 'admin'"
          id="btn-save-favorite-columns"
          size="default" 
          type="warning" 
          plain 
          @click="updateFavoriteColumns" 
          title="บันทึกการซ่อน/แสดงคอลัมน์ปัจจุบันเก็บไว้ใน Template นี้"
        >
          📌 บันทึกคอลัมน์โปรด
        </el-button>
        <el-button size="default" @click="deselectTemplate">ยกเลิกการเลือก</el-button>
        <el-button
          id="btn-run-chain"
          type="primary"
          size="default"
          class="qt-run-btn"
          :disabled="!canRun"
          :loading="running"
          @click="onRun"
        >
          <el-icon><VideoPlay /></el-icon>&nbsp;Run Chain
        </el-button>
      </div>
    </div>

    <!-- ── Save / Edit Modal ──────────────────────────────────────────────── -->
    <el-dialog
      v-model="saveOpen"
      :title="editingId ? 'แก้ไข Template — Interactive Flow Architect' : 'บันทึก Path เป็น Template'"
      width="80%"
      align-center
    >
      <el-form :model="draft" label-position="top">
        <el-form-item label="ชื่อ Template" required>
          <el-input v-model="draft.name" placeholder="เช่น Unit Trace Route" maxlength="60" show-word-limit />
        </el-form-item>
        <el-form-item label="คำอธิบาย">
          <el-input
            v-model="draft.description"
            type="textarea"
            :rows="2"
            placeholder="(ออปชัน) อธิบายว่า Template นี้ใช้ตอนไหน"
            maxlength="200"
            show-word-limit
          />
        </el-form-item>

        <!-- 🔒 Visibility and Sharing Configuration -->
        <el-form-item label="🔒 การแชร์ / สิทธิ์การเข้าถึง (Visibility)">
          <el-select v-model="draft.visibility" style="width: 100%;">
            <el-option label="🌍 สาธารณะ (Public - เห็นและใช้งานได้ทุกคน)" value="public" />
            <el-option label="🔒 ส่วนตัว (Private - เห็นเฉพาะคุณ)" value="private" />
            <el-option label="👤 จำกัดบุคคล (Restricted - เฉพาะพนักงานที่กำหนด)" value="restricted" />
          </el-select>
        </el-form-item>

        <!-- Allowed Users input when visibility is restricted -->
        <el-form-item v-if="draft.visibility === 'restricted'" label="👤 พนักงานที่แชร์สิทธิ์ให้ (Allowed ENs)">
          <el-select
            v-model="draft.allowedUsers"
            multiple
            filterable
            remote
            allow-create
            default-first-option
            reserve-keyword
            placeholder="พิมพ์ชื่อหรือรหัสพนักงานเพื่อค้นหา..."
            :remote-method="remoteSearchEmployees"
            :loading="searchLoading"
            style="width: 100%;"
          >
            <el-option
              v-for="item in employeeSuggestions"
              :key="item.en"
              :label="item.display"
              :value="item.en"
            />
          </el-select>
          <div style="font-size: 11px; color: #909399; margin-top: 6px;">พิมพ์ชื่อหรือรหัสพนักงานเพื่อดึงข้อมูลตรงจากระบบฐานข้อมูล</div>
        </el-form-item>
        <el-form-item label="Interactive Flow Architect">
          <div class="fa-flow-container">
            <!-- Root step (read-only label) -->
            <div class="fa-root-step">
              <span class="fa-step-badge fa-step-badge--root">S1</span>
              <span class="fa-step-label">{{ tableLabel(draft.rootTable) || '—' }}</span>
              <span class="fa-step-tag">Root</span>
            </div>

            <!-- Hop rows -->
            <div v-for="(hop, hi) in draft.hops" :key="hi" class="fa-hop-row">
              <div class="fa-hop-connector">
                <span class="fa-connector-line"></span>
                <span class="fa-step-badge">S{{ hi + 2 }}</span>
              </div>
              <div class="fa-hop-card">
                <div class="fa-hop-fields">
                  <!-- From Step -->
                  <div class="fa-field">
                    <label class="fa-label">จาก Step</label>
                    <el-select v-model="hop.fromStepIdx" size="small" style="width:100%" @change="syncDraftChain">
                      <el-option v-for="si in hi + 1" :key="si - 1" :value="si - 1"
                        :label="`S${si}: ${tableLabel(draft.stepsChain[si - 1] || '')}`" />
                    </el-select>
                  </div>
                  <!-- From Column -->
                  <div class="fa-field">
                    <label class="fa-label">คอลัมน์ต้นทาง</label>
                    <el-select v-model="hop.fromColumnKey" size="small" filterable style="width:100%">
                      <el-option
                        v-for="col in columnsOf(draft.stepsChain[hop.fromStepIdx ?? hi])"
                        :key="col.key" :value="col.key" :label="col.label" />
                    </el-select>
                  </div>
                  <!-- Target Table -->
                  <div class="fa-field">
                    <label class="fa-label">ตารางปลายทาง</label>
                    <el-select v-model="hop.targetTable" size="small" filterable style="width:100%" @change="onHopTargetChange(hop)">
                      <el-option v-for="t in props.tablesMeta" :key="t.key" :value="t.key" :label="t.label" />
                    </el-select>
                  </div>
                  <!-- Target Column -->
                  <div class="fa-field">
                    <label class="fa-label">คอลัมน์ปลายทาง</label>
                    <el-select v-model="hop.targetColumn" size="small" filterable style="width:100%">
                      <el-option
                        v-for="col in columnsOf(hop.targetTable)"
                        :key="col.key" :value="col.key" :label="col.label" />
                    </el-select>
                  </div>
                </div>
                <el-button size="small" type="danger" text @click="removeHop(hi)" title="ลบขั้นนี้">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>
            </div>

            <!-- Add hop button wrapper -->
            <div class="fa-add-btn-wrapper">
              <el-button link type="primary" size="small" @click="addHop">
                ➕ เพิ่มขั้นตอน
              </el-button>
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="saveOpen = false">ยกเลิก</el-button>
        <el-button type="primary" @click="commitSave" :disabled="!draft.name?.trim()">
          {{ editingId ? 'อัปเดต' : 'บันทึก' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- ── Manage Drawer ──────────────────────────────────────────────────── -->
    <el-drawer v-model="manageOpen" title="จัดการ Saved Templates" size="460px">
      <div v-if="!templates.length" class="qt-empty">ยังไม่มี Template ที่บันทึกไว้</div>
      <div v-else class="qt-list">
        <div v-for="tpl in templates" :key="tpl.id" class="qt-list-item">
          <div class="qt-list-main">
            <div class="qt-list-name">{{ tpl.name }}</div>
            <div class="qt-list-desc" v-if="tpl.description">{{ tpl.description }}</div>
            <div class="qt-chain-pills qt-chain-pills--mini">
              <template v-for="(t, i) in tpl.stepsChain" :key="i">
                <span class="qt-pill qt-pill--mini">
                  <span v-if="i > 0 && tpl.hops[i - 1]?.fromStepIdx !== undefined && tpl.hops[i - 1]?.fromStepIdx !== i - 1" style="background: rgba(114, 46, 209, 0.15); color: #722ed1; border: 1px solid rgba(114, 46, 209, 0.3); border-radius: 3px; padding: 0px 3px; font-size: 9px; font-weight: bold; margin-right: 3px;">⌥ S{{ tpl.hops[i - 1].fromStepIdx + 1 }}</span>
                  {{ tableLabel(t) }}
                </span>
                <span v-if="i < tpl.stepsChain.length - 1" class="qt-arrow">→</span>
              </template>
            </div>
            <div class="qt-list-meta">
              สร้าง: {{ formatDate(tpl.createdAt) }}
              <span v-if="tpl.updatedAt && tpl.updatedAt !== tpl.createdAt">
                · แก้ไข: {{ formatDate(tpl.updatedAt) }}
              </span>
            </div>
          </div>
          <div class="qt-list-actions">
            <el-button size="small" @click="openRenameModal(tpl)">
              <el-icon><Edit /></el-icon>
            </el-button>
            <el-popconfirm
              title="ลบ Template นี้?"
              confirm-button-text="ลบ"
              cancel-button-text="ยกเลิก"
              @confirm="onDelete(tpl.id)"
            >
              <template #reference>
                <el-button size="small" type="danger" plain>
                  <el-icon><Delete /></el-icon>
                </el-button>
              </template>
            </el-popconfirm>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, computed, watch, markRaw } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { VideoPlay, Plus, Setting, Edit, Delete, Close } from '@element-plus/icons-vue';
import { useQueryTemplates, runTemplateChain, recalculateHops } from '../composables/useQueryTemplates';

const props = defineProps({
  apiBase:      { type: String, required: true },
  tablesMeta:   { type: Array,  required: true },
  chainSteps:   { type: [Array, Object], required: true }, // shallowRef gets auto-unwrapped to a raw Array — accept either
  searchForm:   { type: Object, required: true },
  nextUid:      { type: Function, required: true },
  visibleCombinedCols: { type: Array, required: true },
  adminUser:    { type: Object, default: null }
});

const emit = defineEmits(['chain-started', 'chain-finished', 'update:chainSteps', 'open-save-api-dialog']);

const {
  templates,
  saveTemplate,
  updateTemplate,
  deleteTemplate,
  buildTemplateFromCurrentChain,
} = useQueryTemplates(props.apiBase);

// ── Run state ───────────────────────────────────────────────────────────────
const selectedId        = ref('');
const running           = ref(false);
const templateConditions = ref([]); // UI-shape conditions for the master/root table
const selectedStartStepIdx = ref(0);

const selectedTemplate = computed(
  () => templates.value.find(t => t.id === selectedId.value) || null
);

// chainSteps is a shallowRef on the parent, but Vue auto-unwraps it to a raw
// Array when passed as a prop. Read defensively.
function readChain() {
  const cs = props.chainSteps;
  return Array.isArray(cs) ? cs : (Array.isArray(cs?.value) ? cs.value : []);
}
const canSaveCurrent = computed(() => readChain().length > 0);

// Columns of the selected template's start step table (searchable only)
const rootColumns = computed(() => {
  const tpl = selectedTemplate.value;
  if (!tpl) return [];
  const startTable = tpl.stepsChain[selectedStartStepIdx.value] || tpl.rootTable;
  const tbl = props.tablesMeta.find(t => t.key === startTable);
  return tbl ? tbl.columns.filter(c => c.searchable) : [];
});

// Run button is enabled only when at least one row has a value of some kind
const canRun = computed(() => {
  if (!selectedTemplate.value || running.value) return false;
  const rows = templateConditions.value;
  if (!rows.length) return false;
  return rows.every(c => {
    if (!c.column) return false;
    if (c.operator === 'in')      return (c.values && c.values.length > 0) || splitMulti(c.multiValue).length > 0;
    if (c.operator === 'between') return (c.dateRange?.length === 2) || (c.value && c.value2);
    return !!(c.value || (c.dateRange && c.dateRange[0]));
  });
});

function splitMulti(s) { return (s || '').split(/[\n,]+/).map(v => v.trim()).filter(Boolean); }

function tableLabel(tableKey) {
  const t = props.tablesMeta.find(x => x.key === tableKey);
  return t ? t.label : tableKey;
}
function isDateColumnKey(key) {
  if (!key) return false;
  const normalized = key.toLowerCase();
  if (normalized.includes('user_reg') || normalized.includes('user_upd') || normalized.includes('userreg') || normalized.includes('userupd')) {
    return false;
  }
  return normalized.includes('date') || normalized.includes('time') || normalized.includes('crdt') || normalized === 'reg' || normalized === 'upd';
}

function applyDatePreset(cond, preset) {
  const today = new Date();
  const formatDateStr = (date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const todayStr = formatDateStr(today);

  if (preset === 'today') {
    cond.operator = 'eq';
    cond.value = todayStr;
    cond.value2 = '';
    cond.multiValue = '';
    cond.dateRange = [];
  } else if (preset === 'yesterday') {
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const yesterdayStr = formatDateStr(yesterday);
    cond.operator = 'lte';
    cond.value = yesterdayStr;
    cond.value2 = '';
    cond.multiValue = '';
    cond.dateRange = [];
  } else if (preset === 'last7') {
    const last7 = new Date();
    last7.setDate(today.getDate() - 7);
    const last7Str = formatDateStr(last7);
    cond.operator = 'between';
    cond.value = '';
    cond.value2 = '';
    cond.multiValue = '';
    cond.dateRange = [last7Str, todayStr];
  } else if (preset === 'last30') {
    const last30 = new Date();
    last30.setDate(today.getDate() - 30);
    const last30Str = formatDateStr(last30);
    cond.operator = 'between';
    cond.value = '';
    cond.value2 = '';
    cond.multiValue = '';
    cond.dateRange = [last30Str, todayStr];
  } else if (preset === 'thisMonth') {
    cond.operator = 'eq';
    cond.value = todayStr;
    cond.value2 = '';
    cond.multiValue = '';
    cond.dateRange = [];
  }
}
function formatDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

// Reset selectedStartStepIdx when template changes
watch(selectedTemplate, () => {
  selectedStartStepIdx.value = 0;
});

// ── Seed templateConditions when user picks a template or start step index ───
watch([selectedTemplate, selectedStartStepIdx], ([newTpl, startIdx]) => {
  if (newTpl) {
    const startTable = newTpl.stepsChain[startIdx] || newTpl.rootTable;
    const isRoot = startIdx === 0;
    const startCols = columnsOf(startTable).filter(c => c.searchable);
    const conds = (isRoot && newTpl.rootConditions?.length)
      ? JSON.parse(JSON.stringify(newTpl.rootConditions))
      : [{
          column:     startCols[0]?.key || '',
          operator:   'like',
          value: '', value2: '', multiValue: '', dateRange: [],
        }];
    // Robust fallback: ensure single date fields sync to cond.value
    for (const cond of conds) {
      if (isDateColumnKey(cond.column) && !cond.value && cond.dateRange?.[0]) {
        cond.value = cond.dateRange[0];
      }
    }
    templateConditions.value = conds;
  } else {
    templateConditions.value = [];
  }
}, { immediate: true });

function addCondition() {
  templateConditions.value.push({
    column:     rootColumns.value[0]?.key || '',
    operator:   'like',
    value: '', value2: '', multiValue: '', dateRange: [],
  });
}
function removeCondition(idx) {
  if (templateConditions.value.length > 1) templateConditions.value.splice(idx, 1);
}
function onOperatorChange(cond) {
  // Reset value fields when operator changes to avoid stale state
  cond.value = ''; cond.value2 = ''; cond.multiValue = ''; cond.dateRange = [];
}
function deselectTemplate() {
  selectedId.value = '';
}

// ── Run chain ──────────────────────────────────────────────────────────────
async function onRun(bypassLimit = false) {
  if (!selectedTemplate.value) return ElMessage.warning('กรุณาเลือก Template');
  if (!canRun.value) return ElMessage.warning('กรุณากรอกเงื่อนไขให้ครบทุกแถว');

  running.value = true;
  emit('chain-started', selectedTemplate.value);

  const result = await runTemplateChain({
    template:           selectedTemplate.value,
    startStepIdx:       selectedStartStepIdx.value,
    dynamicConditions:  templateConditions.value,
    tablesMeta:         props.tablesMeta,
    updateChainSteps:   (newSteps) => emit('update:chainSteps', newSteps),
    apiBase:            props.apiBase,
    markRaw,
    nextUid:            props.nextUid,
    bypassLargeDatasetLimit: bypassLimit,
    onMessage: (level, text) => {
      const fn = ElMessage[level] || ElMessage.info;
      fn(text);
    },
  });

  running.value = false;

  // ⚠️ Check if backend mode needed (large dataset detected)
  if (result?.useBackendMode && result.rootRowCount > 200000) {
    try {
      await ElMessageBox.confirm(
        `ตรวจพบข้อมูลขนาดใหญ่มาก: ${result.rootRowCount.toLocaleString()} แถว\n\nแนะนำให้เซฟเป็น API Endpoint เพื่อรันงานหลังบ้าน (ประสิทธิภาพสูงสุด)\nหรือกด Bypass เพื่อดึงข้อมูลเข้าบราวเซอร์ทันที (หน้าเว็บอาจค้างชั่วขณะ)`,
        'คำเตือนข้อมูลขนาดใหญ่',
        {
          type: 'warning',
          confirmButtonText: 'Save as API Endpoint',
          cancelButtonText: 'Bypass (รันบนบราวเซอร์)',
          distinguishCancelAndClose: true,
        }
      );

      // User confirmed → open save dialog
      emit('open-save-api-dialog');

    } catch (action) {
      if (action === 'cancel') {
        onRun(true);
      }
    }
  }

  emit('chain-finished', { ...result, template: selectedTemplate.value });
}

// ── Save / Edit Modal ──────────────────────────────────────────────────────
const saveOpen   = ref(false);
const editingId  = ref('');
const draft      = ref({ name: '', description: '', rootTable: '', rootColumn: '', rootOperator: 'like', rootConditions: [], hops: [], stepsChain: [], favoriteColumns: [], visibility: 'public', allowedUsers: [] });

// Real-time Employee Autocomplete
const searchLoading = ref(false);
const employeeSuggestions = ref([]);

function authHeaders(extra = {}) {
  const h = { ...extra };
  const en = props.adminUser?.en || '';
  if (en) h['x-user-en'] = String(en);
  return h;
}

async function remoteSearchEmployees(query) {
  if (!query || query.trim() === '') {
    employeeSuggestions.value = [];
    return;
  }

  searchLoading.value = true;
  try {
    const cleanQuery = query.trim();
    const isNumeric = /^\d+$/.test(cleanQuery);
    const paramKey = isNumeric ? 'en' : 'eName';
    
    const res = await fetch(`${props.apiBase}/api/v1/trace/api-hr-autocompleted?${paramKey}=${encodeURIComponent(cleanQuery)}`, {
      headers: authHeaders()
    });
    const result = await res.json();
    if (result && Array.isArray(result.data)) {
      employeeSuggestions.value = result.data.map(item => {
        const en = item.en || item.EN || '';
        const name = item.e_name || item.eName || item.E_NAME || '';
        const dept = item.dept || item.DEPT || item.section || '';
        return {
          en: String(en),
          name: String(name),
          display: `${en} - ${name} (${dept})`
        };
      });
    } else {
      employeeSuggestions.value = [];
    }
  } catch (err) {
    console.error('Employee autocomplete fetch failed:', err);
    employeeSuggestions.value = [];
  } finally {
    searchLoading.value = false;
  }
}

function openSaveModal() {
  const captured = buildTemplateFromCurrentChain({
    searchForm: props.searchForm.value || props.searchForm,
    chainSteps: readChain(),
    tablesMeta: props.tablesMeta,
    visibleCombinedCols: props.visibleCombinedCols,
  });
  if (!captured) {
    ElMessage.warning('ไม่สามารถจับ path ปัจจุบันได้ — โปรดทำ Search/Pivot อย่างน้อย 1 ครั้งก่อน');
    return;
  }
  editingId.value = '';
  draft.value = { name: '', description: '', visibility: 'public', allowedUsers: [], ...captured };
  employeeSuggestions.value = [];
  saveOpen.value = true;
}
function openRenameModal(tpl) {
  editingId.value = tpl.id;
  draft.value = {
    name: tpl.name, description: tpl.description,
    rootTable: tpl.rootTable, rootColumn: tpl.rootColumn, rootOperator: tpl.rootOperator,
    rootConditions: tpl.rootConditions || [],
    hops: JSON.parse(JSON.stringify(tpl.hops || [])),
    stepsChain: tpl.stepsChain.slice(),
    favoriteColumns: tpl.favoriteColumns || [],
    visibility: tpl.visibility || 'public',
    allowedUsers: Array.isArray(tpl.allowedUsers) ? [...tpl.allowedUsers] : [],
  };
  employeeSuggestions.value = (tpl.allowedUsers || []).map(en => ({
    en: String(en),
    name: String(en),
    display: `${en}`
  }));
  saveOpen.value = true;
}
async function commitSave() {
  if (!draft.value.name?.trim()) return;
  if (editingId.value) {
    const updated = await updateTemplate(editingId.value, {
      name: draft.value.name.trim(),
      description: draft.value.description?.trim() || '',
      hops: draft.value.hops,
      stepsChain: draft.value.stepsChain,
      favoriteColumns: draft.value.favoriteColumns,
      visibility: draft.value.visibility || 'public',
      allowedUsers: draft.value.allowedUsers || [],
    });
    if (updated) {
      ElMessage.success('อัปเดต Template เรียบร้อย');
    } else {
      ElMessage.error('อัปเดต Template ล้มเหลว');
    }
  } else {
    const tpl = await saveTemplate(draft.value);
    if (tpl) {
      selectedId.value = tpl.id;
      ElMessage.success('บันทึก Template เรียบร้อย');
    } else {
      ElMessage.error('บันทึก Template ล้มเหลว');
    }
  }
  saveOpen.value = false;
}

async function updateFavoriteColumns() {
  if (!selectedTemplate.value) return;
  const tplId = selectedTemplate.value.id;
  const currentFavs = [...props.visibleCombinedCols];
  
  const updated = await updateTemplate(tplId, {
    favoriteColumns: currentFavs,
  });
  if (updated) {
    ElMessage.success('📌 บันทึกคอลัมน์โปรดเรียบร้อยแล้ว!');
  } else {
    ElMessage.error('บันทึกคอลัมน์โปรดล้มเหลว');
  }
}

async function onDelete(id) {
  const success = await deleteTemplate(id);
  if (success) {
    if (selectedId.value === id) selectedId.value = '';
    ElMessage.success('ลบ Template แล้ว');
  } else {
    ElMessage.error('ลบ Template ล้มเหลว');
  }
}

const manageOpen = ref(false);

// ── Interactive Flow Architect helpers ────────────────────────────────────────
function columnsOf(tableKey) {
  if (!tableKey) return [];
  const tbl = props.tablesMeta.find(t => t.key === tableKey);
  return tbl ? tbl.columns : [];
}

function syncDraftChain() {
  draft.value.stepsChain = [draft.value.rootTable, ...draft.value.hops.map(h => h.targetTable)];
}

function onHopTargetChange(hop) {
  const cols = columnsOf(hop.targetTable);
  hop.targetColumn = cols[0]?.key || '';
  syncDraftChain();
}

function addHop() {
  const lastTable = draft.value.stepsChain[draft.value.stepsChain.length - 1] || draft.value.rootTable;
  const firstTarget = props.tablesMeta[0];
  const newHop = {
    fromStepIdx: draft.value.stepsChain.length - 1,
    fromColumnKey: columnsOf(lastTable)[0]?.key || '',
    targetTable: firstTarget?.key || '',
    targetColumn: columnsOf(firstTarget?.key)[0]?.key || '',
  };
  draft.value.hops = [...draft.value.hops, newHop];
  syncDraftChain();
}

function removeHop(hi) {
  draft.value.hops = recalculateHops(draft.value.hops, hi + 1);
  syncDraftChain();
}

function applyQuickPasteValues(lines, filename) {
  if (!selectedTemplate.value) return false;
  const cond = templateConditions.value[0];
  if (cond) {
    cond.operator = 'in';
    if (filename) {
      cond.values = [...lines];
      cond.filename = filename;
      cond.multiValue = `[นำเข้า ${lines.length.toLocaleString()} รายการจากไฟล์]`;
    } else {
      cond.values = [];
      cond.filename = '';
      cond.multiValue = lines.join('\n');
    }
    return true;
  }
  return false;
}

// Programmatically select a template (used by the Query Templates launchpad
// cards in TraceabilityFlow so a card click loads it into this panel's
// Master Chain Conditions editor instead of running immediately).
function selectTemplate(id) {
  selectedId.value = id;
}

defineExpose({
  selectedTemplate,
  selectedStartStepIdx,
  templateConditions,
  onRun,
  applyQuickPasteValues,
  selectTemplate,
});
</script>

<style scoped>
.qt-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  background: linear-gradient(135deg, #1c2333 0%, #232b3d 100%);
  border: 1px solid #2d3548;
  border-radius: 10px;
}

.qt-run-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.qt-sn-input { flex: 1 1 240px; min-width: 220px; max-width: 360px; }
.qt-select   { flex: 1 1 220px; min-width: 200px; max-width: 320px; }

.qt-opt { display: flex; flex-direction: column; line-height: 1.2; padding: 2px 0; }
.qt-opt-name  { font-weight: 600; }
.qt-opt-chain { font-size: 11px; color: #909399; }

.qt-preview {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  font-size: 12px; color: #c0c4cc;
}
.qt-preview-label { font-weight: 600; color: #e6e8eb; }
.qt-preview-desc  { font-style: italic; color: #909399; }

.qt-chain-pills { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.qt-chain-pills--readonly { padding: 6px 10px; background: #161b27; border-radius: 6px; }
.qt-chain-pills--mini { margin-top: 4px; }

.qt-pill {
  display: inline-block;
  padding: 2px 8px;
  background: #2a3247;
  border: 1px solid #3a4565;
  border-radius: 12px;
  font-size: 11px;
  color: #d6d9e0;
}
.qt-pill--active-master {
  background: #67c23a !important;
  border-color: #67c23a !important;
  color: #ffffff !important;
  font-weight: bold;
  box-shadow: 0 0 10px rgba(103, 194, 58, 0.4);
}
.qt-pill--mini { font-size: 10px; padding: 1px 6px; }
.qt-arrow { color: #67c23a; font-weight: 700; }

.qt-list { display: flex; flex-direction: column; gap: 8px; padding: 4px 0; }
.qt-list-item {
  display: flex; gap: 8px; padding: 10px;
  border: 1px solid #2d3548; border-radius: 8px; background: #1a2030;
}
.qt-list-main { flex: 1; min-width: 0; }
.qt-list-name { font-weight: 600; color: #e6e8eb; }
.qt-list-desc { font-size: 12px; color: #909399; margin-top: 2px; }
.qt-list-meta { font-size: 11px; color: #606266; margin-top: 4px; }
.qt-list-actions { display: flex; gap: 6px; align-items: flex-start; }

.qt-empty { padding: 24px; text-align: center; color: #909399; }
.qt-muted { color: #606266; font-style: italic; }

/* ── Master Chain Conditions Card ─────────────────────────────────────── */
.qt-master-card {
  background: linear-gradient(135deg, rgba(64,158,255,0.08) 0%, rgba(103,194,58,0.06) 100%);
  border: 1px solid rgba(64,158,255,0.35);
  border-radius: 12px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  backdrop-filter: blur(6px);
  box-shadow: 0 4px 18px rgba(64,158,255,0.10);
}
.qt-master-header {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;
}
.qt-master-title { display: flex; gap: 10px; align-items: flex-start; min-width: 0; }
.qt-master-icon { font-size: 20px; line-height: 1; }
.qt-master-title-text { min-width: 0; }
.qt-master-name { font-size: 14px; font-weight: 700; color: #e6e8eb; }
.qt-master-desc { font-size: 12px; color: #909399; margin-top: 2px; font-style: italic; }

.qt-chain-pills--master { padding: 6px 8px; background: rgba(0,0,0,0.18); border-radius: 6px; }

.qt-conditions-block {
  background: rgba(0,0,0,0.22);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.qt-conditions-title {
  font-size: 13px;
  font-weight: 600;
  color: #e6e8eb;
}
.qt-conditions-sub { font-size: 11px; color: #909399; font-weight: 400; margin-left: 4px; }

.qt-condition-row {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.qt-condition-head {
  display: flex; justify-content: space-between; align-items: center;
}
.qt-condition-no { font-size: 11px; font-weight: 700; color: #67c23a; }
.qt-condition-fields {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.qt-condition-row-top {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 8px;
  width: 100%;
}
.qt-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.qt-field--value { width: 100%; }
.qt-field-label { font-size: 11px; color: #909399; }
.qt-in-count { font-size: 11px; color: #67c23a; margin-top: 2px; }
.qt-between-pair { display: flex; align-items: center; gap: 6px; }
.qt-between-sep { color: #909399; font-weight: 600; }

.qt-master-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255,255,255,0.06);
}
.qt-run-btn {
  background: linear-gradient(135deg, #409eff 0%, #67c23a 100%) !important;
  border: none !important;
  font-weight: 600;
  box-shadow: 0 2px 10px rgba(64,158,255,0.30);
}
.qt-run-btn:hover:not(.is-disabled) {
  filter: brightness(1.08);
  box-shadow: 0 4px 16px rgba(64,158,255,0.40);
}

@media (max-width: 720px) {
  .qt-condition-row-top { grid-template-columns: 1fr; }
}

/* ── Interactive Flow Architect ───────────────────────────────────────── */
.fa-flow-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
.fa-root-step {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px;
  background: #eef9eb;
  border: 1px solid #b3e19d;
  border-radius: 8px;
  width: 100%;
  box-sizing: border-box;
  box-shadow: 0 2px 8px rgba(103,194,58,0.08);
}
.fa-step-badge {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border-radius: 50%;
  background: #303133; border: 1px solid #303133;
  font-size: 11px; font-weight: 700; color: #ffffff; flex-shrink: 0;
}
.fa-step-badge--root { background: #67c23a; border-color: #67c23a; color: #ffffff; }
.fa-step-label { font-size: 14px; font-weight: 700; color: #1f2d3d; flex: 1; }
.fa-step-tag { font-size: 10px; font-weight: 700; color: #2f7c1d; background: rgba(103,194,58,0.15); border: 1px solid rgba(103,194,58,0.3); border-radius: 4px; padding: 2px 8px; }

.fa-hop-row {
  display: flex;
  gap: 0;
  margin-top: 2px;
  width: 100%;
  box-sizing: border-box;
}
.fa-hop-connector {
  display: flex; flex-direction: column; align-items: center;
  width: 36px; flex-shrink: 0; padding-top: 2px;
}
.fa-connector-line {
  width: 2px; height: 16px; background: #c0c4cc; margin-bottom: 4px;
}
.fa-hop-card {
  flex: 1; display: flex; gap: 10px; align-items: center;
  background: #f0f7ff;
  border: 1px solid #a0cfff;
  border-radius: 8px; padding: 10px 14px; margin-bottom: 6px;
  box-sizing: border-box;
  box-shadow: 0 2px 10px rgba(64,158,255,0.08);
}
.fa-hop-fields {
  flex: 1; display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
}
.fa-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.fa-label { font-size: 11px; font-weight: 700; color: #303133; }
.fa-add-btn-wrapper {
  margin-top: 6px;
  padding-left: 36px;
}

@media (max-width: 1100px) {
  .fa-hop-fields { grid-template-columns: 1fr 1fr; }
}

/* ── Date Preset Shortcuts ── */
.date-preset-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 5px;
}

.preset-btn {
  font-size: 11px;
  padding: 2px 6px;
  background: #f4f4f5;
  color: #606266;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid #dcdfe6;
  user-select: none;
  transition: all 0.2s ease;
}

.preset-btn:hover {
  background: #ecf5ff;
  color: #409eff;
  border-color: #c6e2ff;
}
</style>
