<template>
  <el-dialog
    :model-value="modelValue"
    title="🗂️ Bilingual Database Registry Manager"
    width="90%"
    class="registry-manager-dialog"
    destroy-on-close
    @update:model-value="$emit('update:modelValue', $event)"
    @open="initManager"
  >
    <div v-loading="loadingList" class="registry-manager-content">
      <!-- PANEL 1: Left Sidebar - Table List -->
      <div class="sidebar-panel">
        <div class="panel-header">
          <span class="panel-title">Database Tables</span>
          <el-button type="primary" size="small" class="add-btn" @click="startCreateNew">
            ✨ Add Table
          </el-button>
        </div>
        
        <div class="search-box">
          <el-input
            v-model="searchQuery"
            placeholder="Search tables..."
            clearable
            prefix-icon="Search"
          />
        </div>

        <div class="table-list-wrapper">
          <!-- All Tables (Dynamic Only) -->
          <div class="section-title-group">Database Tables</div>
          <div v-if="filteredDynamicTables.length === 0" class="empty-dynamic-hint">
            No tables registered yet. Click "Add Table" to create one.
          </div>
          <div
            v-for="t in filteredDynamicTables"
            :key="`${t.tableName}_${t.connectionKey}`"
            :class="['table-item dynamic-item', { active: selectedTable && selectedTable.id === t.id }]"
            @click="selectItem(t)"
          >
            <div class="item-header">
              <span class="item-name">{{ t.key }}</span>
              <div class="item-actions">
                <el-button
                  type="danger"
                  size="small"
                  link
                  class="delete-item-btn"
                  @click.stop="confirmDelete(t)"
                >
                  🗑️
                </el-button>
              </div>
            </div>
            <div class="item-label">{{ t.label }}</div>
            <div class="item-db-info">{{ t.tableName }} • {{ t.connectionKey || t.database || 'seagate' }}</div>
          </div>
        </div>
      </div>

      <!-- PANEL 2: Center Panel - Table Configuration -->
      <div class="center-panel">
        <div class="panel-header">
          <span class="panel-title">
            {{ isEditingNew ? '🛠️ New Dynamic Table Setup' : '⚙️ Table Details & Config' }}
          </span>
        </div>

        <div v-if="!selectedTable && !isEditingNew" class="empty-state-pane">
          <span class="empty-icon">🗂️</span>
          <h3>Select a Table from the sidebar</h3>
          <p>You can configure display labels, auto-detect schemas, test custom raw SQL, and map drill-down pivot chains between databases.</p>
        </div>

        <div v-else class="form-pane-inner">
          <el-form :model="form" label-position="top" class="config-form">
            <!-- Table Info Group -->
            <div class="form-row">
              <el-form-item label="Table Key / Registry ID (Unique)" required class="form-col">
                <el-input
                  v-model="form.key"
                  placeholder="e.g. my_custom_scan"
                  :disabled="!isEditingNew"
                  @input="onKeyInput"
                />
                <span class="input-hint">A-Z, a-z, 0-9 and _ only.</span>
              </el-form-item>

              <el-form-item label="Physical DB Table Name" required class="form-col">
                <el-input v-model="form.tableName" placeholder="e.g. t_scan_bonding_data" />
              </el-form-item>
            </div>

            <div class="form-row">
              <el-form-item label="Display Label (Bilingual / Thai / Eng)" required class="form-col">
                <el-input v-model="form.label" placeholder="e.g. Bonding Data (ข้อมูลประกบ)" />
              </el-form-item>

              <el-form-item label="Target Server Connection" required class="form-col">
                <el-select v-model="form.connectionKey" placeholder="Select Server">
                  <el-option label="Seagate Production (seagate)" value="seagate" />
                  <el-option label="ACA Production (ACA)" value="ACA" />
                  <el-option label="Bitintra Shared Server (Bitintra)" value="Bitintra" />
                  <el-option label="BITR" value="BITR" />
                  <el-option label="BITR_IMM" value="BITR_IMM" />
                  <el-option label="BITR_SM" value="BITR_SM" />
                  <el-option label="WORKFLOW" value="WORKFLOW" />
                  <el-option label="BIT" value="dbBIT" />
                  <el-option label="WMS" value="dbWMS" />
                  <el-option label="HR" value="dbHr" />
                  <el-option label="Seagate Development (SeagateDev)" value="SeagateDev" />
                  <el-option label="SGCOIL (wdhu-db02)" value="SGCOIL" />
                  <el-option label="HGSTACA (wdhu-db02)" value="HGSTACA" />
                  <el-option label="SEAPRINT (sgfc-db02)" value="SEAPRINT" />
                  <el-option label="SOFT (sgfc-db02)" value="SOFT" />
                </el-select>
              </el-form-item>
            </div>

            <!-- Custom SQL Toggle -->
            <div class="custom-sql-toggle-area">
              <el-checkbox v-model="form.useCustomSql" border size="large">
                🖥️ Use Custom Raw SQL Query Template
              </el-checkbox>
              <p class="section-desc-hint">
                Enable this if you need custom filters, cross-DB query syntax, hardcoded parameters, or joins.
              </p>
            </div>

            <!-- Custom SQL Textarea -->
            <el-collapse-transition>
              <div v-if="form.useCustomSql" class="custom-sql-box">
                <el-form-item label="Custom SQL Template" required>
                  <el-input
                    v-model="form.customSqlStr"
                    type="textarea"
                    :rows="6"
                    placeholder="SELECT * FROM BIT.my_custom_table WHERE customer = 'Seagate:ACA' AND `?col` IN (?)"
                  />
                  <div class="sql-hint-bubble">
                    <strong>Syntax Rules:</strong>
                    <ul>
                      <li>Use <code>?col</code> for column auto-injection.</li>
                      <li>Use <code>IN (?)</code> for dynamic search arrays.</li>
                      <li>Do not include trailing semicolons (;).</li>
                    </ul>
                  </div>

                  <!-- Case Studies and Tutorials for Custom SQL (Thai/English) -->
                  <div class="custom-sql-tutorial-panel">
                    <el-collapse class="custom-sql-collapse">
                      <el-collapse-item name="case-studies">
                        <template #title>
                          <span class="tutorial-title-header">💡 2 ตัวอย่างยอดฮิตในการตั้งค่า Custom SQL (Bilingual Case Studies)</span>
                        </template>
                        <div class="tutorial-cases-content">
                          <!-- Case 1: JOIN 4 Tables -->
                          <div class="tutorial-case-block">
                            <h4 class="case-badge-title"><span class="badge-number">Case 1</span> JOIN 4 ตารางย่อยฝั่ง ACA (Traceability Line)</h4>
                            <p class="case-description">
                              ใช้สำหรับเชื่อมโยงประวัติบอร์ด/ชิ้นงานที่เกิดจากการ JOIN ตารางต่างๆ เข้าด้วยกัน เช่น
                              <code>STORELOT_FG_DETAIL</code> ➔ <code>PROD_LOT_DETAIL</code> ➔ <code>PACK_DETAIL</code> ➔ <code>ACA_SCAN1</code>
                            </p>
                            <div class="rule-warning-alert">
                              ⚠️ <strong>กฎเหล็กป้องกัน Syntax Error:</strong> ห้ามเขียน <code>store_lot = IN (?)</code> เด็ดขาด! ให้เปลี่ยนตัวแปรตรงที่ใช้ค้นหาเป็น <code>?col IN (?)</code> เพื่อให้ระบบรองรับการสลับคอลัมน์คัดกรอง หรือกดปุ่ม Pivot จากหน้าจอได้ 100%
                            </div>
                            <div class="code-copy-wrapper">
                              <pre class="tutorial-code"><code>SELECT
  ACA.STORELOT_FG_DETAIL.store_lot, 
  ACA.STORELOT_FG_DETAIL.prod_lot, 
  ACA.STORELOT_FG_DETAIL.qty, 
  ACA.PROD_LOT_DETAIL.pack_id, 
  ACA.ACA_SCAN1.serial_no,
  ACA.ACA_SCAN1.pt_ref
FROM ACA.STORELOT_FG_DETAIL
INNER JOIN ACA.PROD_LOT_DETAIL ON PROD_LOT_DETAIL.prod_lot = STORELOT_FG_DETAIL.prod_lot
INNER JOIN ACA.PACK_DETAIL ON PACK_DETAIL.pack_id = PROD_LOT_DETAIL.pack_id
INNER JOIN ACA.ACA_SCAN1 ON ACA_SCAN1.pt_no = PACK_DETAIL.pt_no
WHERE 1=1 AND ?col IN (?)</code></pre>
                            </div>
                          </div>

                          <!-- Case 2: Cross-DB / External Servers -->
                          <div class="tutorial-case-block">
                            <h4 class="tutorial-badge-title blue"><span class="badge-number">Case 2</span> ค้นหาข้ามเซิร์ฟเวอร์ (เช่น Bitintra Shared Database)</h4>
                            <p class="case-description">
                              ต้องการเชื่อมโยงไปหาตารางที่อยู่บนฐานข้อมูลอื่น เช่น <code>BIT.ACA_BONDING_DATA</code>
                            </p>
                            <div class="rule-info-alert">
                              💡 <strong>วิธีการเชื่อมโยง:</strong> 
                              <ol>
                                <li>ที่ช่อง <strong>Target Server Connection</strong> ให้เลือก <code>Bitintra Shared Server (Bitintra)</code></li>
                                <li>ที่ช่อง <strong>Physical DB Table Name</strong> ด้านบน ให้ป้อนเฉพาะ <code>ACA_BONDING_DATA</code> (ห้ามใส่ <code>BIT.</code> หรือจุด <code>.</code> เพื่อผ่านการตรวจสอบความปลอดภัยของ SQL Injection)</li>
                              </ol>
                            </div>
                            <div class="code-copy-wrapper">
                              <pre class="tutorial-code"><code>SELECT * FROM BIT.ACA_BONDING_DATA WHERE customer = 'Seagate:ACA' AND ?col IN (?)</code></pre>
                            </div>
                          </div>
                        </div>
                      </el-collapse-item>
                    </el-collapse>
                  </div>
                </el-form-item>

                <!-- Test Section -->
                <div class="sql-test-console">
                  <div class="console-action-row">
                    <el-input
                      v-model="testParamValue"
                      placeholder="Mock Test Parameter Value (e.g. lot number)"
                      style="width: 280px; margin-right: 12px;"
                    />
                    <el-button type="warning" :loading="testingSql" @click="testRawQuery">
                      ⚡ Test Query
                    </el-button>
                  </div>

                  <!-- Mini Console Response -->
                  <div v-if="testResult || testingSql" class="mini-console">
                    <div class="console-header">
                      <span>Live SQL Query Response (Capped Limit 5)</span>
                      <span v-if="testResult" class="latency">{{ testTookMs }}ms</span>
                    </div>
                    <div v-loading="testingSql" class="console-body-wrapper">
                      <div v-if="testResultError" class="console-error-msg">
                        ❌ Error: {{ testResultError }}
                      </div>
                      <div v-else-if="testResult && testResult.length === 0" class="console-empty">
                        🔍 No rows matched. Query executed successfully.
                      </div>
                      <el-table
                        v-else-if="testResult && testResult.length"
                        :data="testResult"
                        size="small"
                        border
                        stripe
                        style="width: 100%"
                        max-height="180"
                      >
                        <el-table-column
                          v-for="col in Object.keys(testResult[0])"
                          :key="col"
                          :prop="col"
                          :label="col"
                          min-width="120"
                          show-overflow-tooltip
                        />
                      </el-table>
                    </div>
                  </div>
                </div>
              </div>
            </el-collapse-transition>
          </el-form>
        </div>
      </div>

      <!-- PANEL 3: Right Panel - Column and Pivot Links Config -->
      <div class="right-panel">
        <div class="panel-header">
          <span class="panel-title">🔗 Columns & Pivot Link Mapping</span>
          <el-button
            v-if="selectedTable || isEditingNew"
            type="success"
            size="small"
            :loading="detecting"
            @click="autoDetectColumns"
          >
            🔍 Auto-Detect Columns
          </el-button>
        </div>

        <div v-if="!selectedTable && !isEditingNew" class="empty-state-pane">
          <span class="empty-icon">🔗</span>
          <h3>Columns will be listed here</h3>
          <p>Auto-detect columns from the DB instantly, rename display headers, adjust Thai translations, and configure drill-down targets.</p>
        </div>

        <div v-else class="columns-pane-inner">
          <div v-if="form.columns.length === 0" class="no-columns-alert">
            💡 No columns registered. Click <strong>🔍 Auto-Detect Columns</strong> above to pull schema from your database!
          </div>

          <div v-else class="column-list-container">
            <div
              v-for="(col, index) in form.columns"
              :key="col.tempId || col.dbColumn"
              class="column-card"
            >
              <!-- Column basic info -->
              <div class="col-card-header" style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 6px; flex: 1; margin-right: 8px;">
                  <span class="db-col-name" style="white-space: nowrap; color: #409eff;">💻 Column:</span>
                  <el-input
                    v-model="col.dbColumn"
                    placeholder="Physical column or Table.Column"
                    size="small"
                    style="flex: 1;"
                  />
                </div>
                <el-checkbox
                  v-model="col.searchable"
                  label="Searchable"
                />
              </div>

              <div class="col-inputs-row" style="display: flex; gap: 8px;">
                <el-input
                  v-model="col.label"
                  placeholder="Bilingual Column Header Label"
                  style="flex: 1;"
                >
                  <template #prepend>Label Header</template>
                </el-input>
                <el-select
                  v-model="col.dataType"
                  placeholder="Column Type"
                  style="width: 140px;"
                >
                  <el-option label="🔤 TEXT" value="text" />
                  <el-option label="📅 DATE" value="date" />
                </el-select>
              </div>

              <!-- Column Link targets list -->
              <div class="pivot-links-section">
                <div class="pivot-links-header">
                  <span>Drill-down Pivot Targets (linksTo)</span>
                  <el-button
                    v-if="selectedTable || isEditingNew"
                    type="primary"
                    size="small"
                    link
                    @click="initAddLink(col)"
                  >
                    ➕ Add Pivot target
                  </el-button>
                </div>

                <div v-if="!col.linksTo || col.linksTo.length === 0" class="no-links-hint">
                  No pivot links configured for this column.
                </div>
                <div v-else class="links-list">
                  <div v-for="(link, lIdx) in col.linksTo" :key="lIdx" class="link-pill">
                    <span class="link-target-text">
                      🎯 {{ link.targetTable }} ({{ link.targetColumn }})
                      <span class="link-lbl-bubble">"{{ link.label }}"</span>
                    </span>
                    <el-button
                      v-if="selectedTable || isEditingNew"
                      type="danger"
                      size="small"
                      link
                      class="delete-link-btn"
                      @click="removeLink(col, lIdx)"
                    >
                      ❌
                    </el-button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Pivot link creator modal (Cascading builder) -->
    <el-dialog
      v-model="linkDialogVisible"
      title="🔗 Add Pivot Link Target"
      width="480px"
      append-to-body
      class="link-builder-modal"
    >
      <el-form label-position="top">
        <el-form-item label="Target Table" required>
          <el-select
            v-model="linkForm.targetTable"
            placeholder="Select target table"
            filterable
            style="width: 100%;"
            @change="onLinkTargetTableChange"
          >
            <el-option-group
              v-for="group in groupedAllTables"
              :key="group.key"
              :label="group.label"
            >
              <el-option
                v-for="t in group.tables"
                :key="`${t.key}_${t.connectionKey}`"
                :label="`${t.key} - ${t.label} (${t.connectionKey})`"
                :value="JSON.stringify({ table: t.key, server: t.connectionKey })"
              />
            </el-option-group>
          </el-select>
        </el-form-item>

        <el-form-item label="Target Table Column (Cascading)" required>
          <el-select
            v-model="linkForm.targetColumn"
            placeholder="Select target column"
            style="width: 100%;"
            :disabled="!linkForm.targetTable"
          >
            <el-option
              v-for="col in targetTableColumns"
              :key="col.key || col.dbColumn"
              :label="`${col.label} (${col.dbColumn})`"
              :value="col.key || col.dbColumn"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="Pivot Button Display Label (Bilingual)" required>
          <el-input v-model="linkForm.label" placeholder="e.g. → Show Scan Details" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="linkDialogVisible = false">Cancel</el-button>
          <el-button type="primary" @click="savePivotLink">Confirm Link</el-button>
        </div>
      </template>
    </el-dialog>

    <template #footer>
      <div class="dialog-footer-main">
        <el-button @click="$emit('update:modelValue', false)">Close Manager</el-button>
        <el-button
          v-if="selectedTable || isEditingNew"
          type="primary"
          size="large"
          class="save-table-btn"
          :loading="saving"
          @click="saveTableConfig"
        >
          💾 Save Registry Config
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { isDateColumnName } from '../composables/useCombinedRows';

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  apiBase: { type: String, required: true },
});

const emit = defineEmits(['update:modelValue', 'saved']);

// Manager and lists state
const allTables = ref([]);

// จัดกลุ่มตารางสำหรับ Pivot Link Target dropdown
const groupedAllTables = computed(() => {
  const groups = [
    { label: '🏭 Seagate Production', key: 'seagate', tables: [] },
    { label: '🔩 ACA Production', key: 'ACA', tables: [] },
    { label: '📦 WMS & Logistics', key: 'WMS', tables: [] },
    { label: '🏢 HR & Personnel', key: 'HR', tables: [] },
    { label: '🔧 HGST Operations', key: 'HGST', tables: [] },
    { label: '🌐 Bitintra & Workflow', key: 'Bitintra', tables: [] },
    { label: '⚙️ Development & Testing', key: 'Dev', tables: [] },
    { label: '📋 Other', key: 'Other', tables: [] },
  ];

  allTables.value.forEach(t => {
    const connKey = t.connectionKey || t.database || 'seagate';
    if (connKey === 'seagate' || t.key.toLowerCase().includes('scan') || t.key.toLowerCase().includes('soldering') || t.key.toLowerCase().includes('baking')) {
      groups[0].tables.push(t);
    } else if (connKey === 'ACA' || t.key.toLowerCase().includes('aca')) {
      groups[1].tables.push(t);
    } else if (connKey === 'dbWMS' || t.key.toLowerCase().includes('wms') || t.key.toLowerCase().includes('shipment') || t.key.toLowerCase().includes('pack')) {
      groups[2].tables.push(t);
    } else if (connKey === 'dbHr' || t.key.toLowerCase().includes('hr_') || t.key.toLowerCase().includes('personal')) {
      groups[3].tables.push(t);
    } else if (connKey === 'HGSTACA' || connKey === 'SGCOIL' || t.key.toLowerCase().includes('hgst')) {
      groups[4].tables.push(t);
    } else if (connKey === 'Bitintra' || connKey === 'BITR' || connKey === 'BITR_IMM' || connKey === 'BITR_SM' || connKey === 'WORKFLOW' || connKey === 'dbBIT') {
      groups[5].tables.push(t);
    } else if (connKey === 'SeagateDev' || t.key.toLowerCase().includes('dev') || t.key.toLowerCase().includes('test')) {
      groups[6].tables.push(t);
    } else {
      groups[7].tables.push(t);
    }
  });

  return groups.filter(g => g.tables.length > 0);
});

const dynamicRegistry = ref([]);
const loadingList = ref(false);
const searchQuery = ref('');
const selectedTable = ref(null);
const isEditingNew = ref(false);

// Form configurations
const form = ref({
  id: '',
  key: '',
  tableName: '',
  label: '',
  connectionKey: 'seagate',
  useCustomSql: false,
  customSqlStr: '',
  columns: [],
  isActive: true,
});

// Dynamic validation
function onKeyInput() {
  form.value.key = form.value.key.replace(/[^A-Za-z0-9_]/g, '');
}

// 🆕 Auth Header Helper: pulls validated EN from storage
function getAuthHeaders() {
  const user = JSON.parse(localStorage.getItem('sg_admin_user') || 'null');
  return {
    'Content-Type': 'application/json',
    'x-user-en': user ? user.en : '',
  };
}

// Columns auto-detection state
const detecting = ref(false);

// SQL testing state
const testingSql = ref(false);
const testParamValue = ref('');
const testResult = ref(null);
const testResultError = ref('');
const testTookMs = ref(0);

// Pivot Link builder state
const linkDialogVisible = ref(false);
const activeLinkColumn = ref(null);
const linkForm = ref({
  targetTable: '',
  targetServer: '',
  targetColumn: '',
  label: '',
});

const targetTableColumns = computed(() => {
  if (!linkForm.value.targetTable) return [];

  // Parse JSON value: { table: "...", server: "..." }
  let tableKey, serverKey;
  try {
    const parsed = JSON.parse(linkForm.value.targetTable);
    tableKey = parsed.table;
    serverKey = parsed.server;
  } catch (e) {
    // Fallback for old format (plain string)
    tableKey = linkForm.value.targetTable;
    serverKey = linkForm.value.targetServer;
  }

  // Find the specific table by key AND connectionKey
  const target = allTables.value.find(t =>
    t.key === tableKey &&
    (!serverKey || t.connectionKey === serverKey)
  );

  return target ? target.columns || [] : [];
});

function onLinkTargetTableChange() {
  // Parse the JSON value: { table: "...", server: "..." }
  try {
    const parsed = JSON.parse(linkForm.value.targetTable);
    linkForm.value.targetServer = parsed.server;
    linkForm.value.targetColumn = '';

    // Suggest a default label
    const target = allTables.value.find(t => t.key === parsed.table && t.connectionKey === parsed.server);
    linkForm.value.label = `→ ${target ? target.label : parsed.table}`;
  } catch (e) {
    // Fallback for old format (plain string)
    linkForm.value.targetServer = '';
    linkForm.value.targetColumn = '';
    const target = allTables.value.find(t => t.key === linkForm.value.targetTable);
    linkForm.value.label = `→ ${target ? target.label : linkForm.value.targetTable}`;
  }
}

// Sidebar filters
const filteredStaticTables = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  const staticTables = allTables.value.filter(t => !t.isDynamic);
  if (!q) return staticTables;
  return staticTables.filter(t =>
    t.key.toLowerCase().includes(q) ||
    t.label.toLowerCase().includes(q) ||
    t.tableName.toLowerCase().includes(q) ||
    (t.connectionKey && t.connectionKey.toLowerCase().includes(q)) ||
    (t.database && t.database.toLowerCase().includes(q))
  );
});

const filteredDynamicTables = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  const dynamicTables = allTables.value.filter(t => t.isDynamic);
  if (!q) return dynamicTables;
  return dynamicTables.filter(t =>
    t.key.toLowerCase().includes(q) ||
    t.label.toLowerCase().includes(q) ||
    t.tableName.toLowerCase().includes(q) ||
    (t.connectionKey && t.connectionKey.toLowerCase().includes(q))
  );
});

// Fetching lists on dialog open
async function initManager() {
  selectedTable.value = null;
  isEditingNew.value = false;
  resetForm();
  await loadTables();
}

async function loadTables() {
  loadingList.value = true;
  try {
    // 1. Fetch tables from /api/tables (all dynamic now)
    const tablesRes = await fetch(`${props.apiBase}/api/tables`);
    const tablesResult = await tablesRes.json();

    // 2. Fetch raw dynamic tables from /api/registry/tables to map actual IDs
    const registryRes = await fetch(`${props.apiBase}/api/registry/tables`);
    const registryResult = await registryRes.json();

    if (tablesResult.success && registryResult.success) {
      dynamicRegistry.value = registryResult.data || [];

      // All tables are dynamic now — just map IDs
      allTables.value = (tablesResult.data || []).map(t => {
        const match = dynamicRegistry.value.find(dr =>
          dr.tableName === t.tableName && dr.connectionKey === t.connectionKey
        );
        return {
          ...t,
          id: match ? match.id : '',
          customSql: match ? match.customSql : null,
          isDynamic: true, // All tables are dynamic
        };
      });
    }
  } catch (err) {
    console.error('Failed to load tables:', err);
    ElMessage.error('Failed to load table list.');
  } finally {
    loadingList.value = false;
  }
}

// Resetting Form
function resetForm() {
  form.value = {
    id: '',
    key: '',
    tableName: '',
    label: '',
    connectionKey: 'seagate',
    useCustomSql: false,
    customSqlStr: '',
    columns: [],
    isActive: true,
  };
  testResult.value = null;
  testResultError.value = '';
  testParamValue.value = '';
}

// Select Sidebar Table
function selectItem(item) {
  isEditingNew.value = false;
  resetForm();
  selectedTable.value = item;

  // Populate config form
  form.value.id = item.id || '';
  form.value.key = item.key;
  form.value.tableName = item.tableName;
  form.value.label = item.label;
  
  if (item.isDynamic) {
    const registryData = dynamicRegistry.value.find(dr => dr.id === item.id);
    if (registryData) {
      form.value.connectionKey = registryData.connectionKey || 'seagate';
      form.value.useCustomSql = !!registryData.customSql;
      form.value.customSqlStr = registryData.customSql ? registryData.customSql.customSql || '' : '';
      
      // Parse columns from dynamicRegistry shape to list
      form.value.columns = Object.entries(registryData.columns || {}).map(([key, col]) => ({
        tempId: `col_${Math.random()}`,
        key,
        dbColumn: col.dbColumn,
        label: col.label,
        searchable: !!col.searchable,
        dataType: col.dataType || (isDateColumnName(col.dbColumn) ? 'date' : 'text'),
        linksTo: Array.isArray(col.linksTo) ? [...col.linksTo] : [],
      }));
    }
  } else {
    // Static core tables (which don't have shadow overrides yet)
    form.value.connectionKey = item.database || 'seagate';
    form.value.useCustomSql = !!item.customSql;
    form.value.customSqlStr = '';
    
    // Map static columns
    form.value.columns = (item.columns || []).map(col => ({
      tempId: `col_${Math.random()}`,
      key: col.key,
      dbColumn: col.dbColumn,
      label: col.label,
      searchable: !!col.searchable,
      dataType: col.dataType || (isDateColumnName(col.dbColumn) ? 'date' : 'text'),
      linksTo: Array.isArray(col.linksTo) ? [...col.linksTo] : [],
    }));
  }
}

// Start New Dynamic Table Creation
function startCreateNew() {
  selectedTable.value = null;
  isEditingNew.value = true;
  resetForm();
}

// Auto-Detect Columns
async function autoDetectColumns() {
  if (!form.value.tableName) {
    ElMessage.warning('Please enter the physical Table Name first.');
    return;
  }
  
  detecting.value = true;
  try {
    const res = await fetch(`${props.apiBase}/api/registry/preview-columns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connectionKey: form.value.connectionKey,
        tableName: form.value.tableName,
      })
    });
    
    const result = await res.json();
    if (result.success && Array.isArray(result.data)) {
      // Map columns
      form.value.columns = result.data.map(col => {
        // Derive camelCase key from snake_case db column
        const colKey = col.dbColumn.replace(/_([a-z])/g, (m, c) => c.toUpperCase());
        
        return {
          tempId: `col_${Math.random()}`,
          key: colKey,
          dbColumn: col.dbColumn,
          label: col.label,
          searchable: !!col.searchable,
          dataType: col.dataType || (isDateColumnName(col.dbColumn) ? 'date' : 'text'),
          linksTo: [],
        };
      });

      // ✅ Auto-fill Table Key from physical table name if currently empty (new table mode)
      // Strip DB prefix: "BIT.ACA_BONDING_DATA" → "ACA_BONDING_DATA"
      if (isEditingNew.value && !form.value.key) {
        const rawName = form.value.tableName;
        const tblPart = rawName.includes('.') ? rawName.split('.').pop() : rawName;
        form.value.key = tblPart.replace(/[^A-Za-z0-9_]/g, '');
        ElMessage.info(`Table Key auto-filled as "${form.value.key}" — you can rename it if needed.`);
      }

      ElMessage.success(`Successfully auto-detected ${form.value.columns.length} columns!`);
    } else {
      ElMessage.error(result.message || 'Auto-detect columns failed. Check table presence.');
    }
  } catch (err) {
    console.error(err);
    ElMessage.error('Connection error during schema discovery.');
  } finally {
    detecting.value = false;
  }
}

// Test custom query SQL safely
async function testRawQuery() {
  if (!form.value.customSqlStr) {
    ElMessage.warning('Please write a custom SQL query to test.');
    return;
  }
  
  testingSql.value = true;
  testResult.value = null;
  testResultError.value = '';
  
  // Replace ?col and IN (?) to run a test execute
  let testSql = form.value.customSqlStr;
  testSql = testSql.replace(/`\??col`/gi, '`test_column`');
  testSql = testSql.replace(/\??col\b/gi, '`test_column`');
  
  let params = [];
  if (testParamValue.value) {
    params = [testParamValue.value];
    if (testSql.includes('(?)')) {
      testSql = testSql.replace(/\(\?\)/g, '(?)');
    }
  } else {
    // Dummy param
    params = ['1'];
  }

  try {
    const res = await fetch(`${props.apiBase}/api/registry/test-query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connectionKey: form.value.connectionKey,
        sql: form.value.customSqlStr.replace(/`\??col`/gi, '`1`').replace(/\??col\b/gi, '`1`'), // safe test replacing column template literally
        params: params,
      })
    });
    
    const result = await res.json();
    if (res.status === 200 && result.success) {
      testResult.value = result.data || [];
      testTookMs.value = result.tookMs || 0;
    } else {
      testResultError.value = result.message || 'SQL execution failed.';
    }
  } catch (err) {
    console.error(err);
    testResultError.value = 'Network or server timeout executing query.';
  } finally {
    testingSql.value = false;
  }
}

// Pivot Links setup
function initAddLink(col) {
  activeLinkColumn.value = col;
  linkForm.value = {
    targetTable: '',
    targetServer: '',
    targetColumn: '',
    label: '',
  };
  linkDialogVisible.value = true;
}

function savePivotLink() {
  if (!linkForm.value.targetTable || !linkForm.value.targetColumn || !linkForm.value.label) {
    ElMessage.warning('Please fill in all pivot configuration options.');
    return;
  }

  // Parse targetTable (JSON format: { table: "...", server: "..." })
  let actualTable, actualServer;
  try {
    const parsed = JSON.parse(linkForm.value.targetTable);
    actualTable = parsed.table;
    actualServer = parsed.server;
  } catch (e) {
    // Fallback for old format
    actualTable = linkForm.value.targetTable;
    actualServer = linkForm.value.targetServer || '';
  }

  if (!activeLinkColumn.value.linksTo) {
    activeLinkColumn.value.linksTo = [];
  }

  activeLinkColumn.value.linksTo.push({
    targetTable: actualTable,
    targetServer: actualServer,
    targetColumn: linkForm.value.targetColumn,
    label: linkForm.value.label,
  });

  linkDialogVisible.value = false;
  ElMessage.success('Pivot linkage target added successfully.');
}

function removeLink(col, lIdx) {
  col.linksTo.splice(lIdx, 1);
}

// CRUD Save Config
const saving = ref(false);

async function saveTableConfig() {
  // Validate inputs
  if (!form.value.key || !form.value.tableName || !form.value.label) {
    ElMessage.warning('Please fill out the Table Key, physical Table Name, and Display Label.');
    return;
  }
  // Guard: Table Key must not contain a dot or DB prefix
  if (form.value.key.includes('.')) {
    ElMessage.error('Table Key ต้องไม่มีจุด (.) กรุณาใช้เฉพาะ A-Z, a-z, 0-9 และ _ เช่น "ACA_BONDING_DATA" ไม่ใช่ "BIT.ACA_BONDING_DATA"');
    return;
  }
  if (form.value.columns.length === 0) {
    ElMessage.warning('Please configure at least one column (run Auto-Detect first).');
    return;
  }

  saving.value = true;
  try {
    // Map columns array back to Record<string, ColumnMeta> shape
    const mappedColumns = {};
    form.value.columns.forEach(col => {
      mappedColumns[col.key || col.dbColumn] = {
        dbColumn: col.dbColumn,
        label: col.label,
        searchable: !!col.searchable,
        dataType: col.dataType || 'text',
        linksTo: col.linksTo || [],
      };
    });

    const payload = {
      tableName: form.value.key, // Save key as the actual dynamic identifier slug
      label: form.value.label,
      connectionKey: form.value.connectionKey,
      customSql: form.value.useCustomSql ? {
        connectionKey: form.value.connectionKey,
        customSql: form.value.customSqlStr,
        multiQuery: false,
        multiQueryType: null,
      } : null,
      columns: mappedColumns,
      isActive: true,
    };

    let response;
    // Determine whether to create or update:
    // If form.value.id is present, it's an update.
    // NOTE: When shadowing a static table, the first time we save it, form.value.id is empty, so we POST it to register the new shadow record!
    if (!form.value.id) {
      // Create new shadow override record
      response = await fetch(`${props.apiBase}/api/registry/tables`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
    } else {
      // Update existing record
      response = await fetch(`${props.apiBase}/api/registry/tables/${form.value.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
    }

    const result = await response.json();
    if (result.success) {
      // Hot reload backend dynamic layer
      await fetch(`${props.apiBase}/api/registry/reload`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      
      ElMessage.success(
        !form.value.id 
          ? `Bilingual table registry "${form.value.key}" created & hot-loaded!`
          : `Table registry settings for "${form.value.key}" updated & hot-loaded!`
      );
      
      isEditingNew.value = false;
      
      // Reload lists and emit saved signal to refresh TraceabilityFlow
      await loadTables();
      
      // Select the active table to maintain pane focus
      const savedKey = payload.tableName;
      const found = allTables.value.find(t => t.key === savedKey);
      if (found) selectItem(found);

      emit('saved');
    } else {
      ElMessage.error(result.message || 'Failed to save configuration settings.');
    }
  } catch (err) {
    console.error(err);
    ElMessage.error('Server error saving table configuration.');
  } finally {
    saving.value = false;
  }
}

// Delete Dynamic Table
function confirmDelete(item) {
  const isShadowOverride = allTables.value.some(t => t.key === item.key && !t.isDynamic);
  
  ElMessageBox.confirm(
    isShadowOverride
      ? `ต้องการลบการตั้งค่าเขียนทับ (Shadow Override) ของตารางหลัก "${item.key}" หรือไม่? ระบบจะลบการเชื่อมโยงขยายที่ตั้งไว้ และย้อนกลับไปใช้ตรรกะดีฟอลต์ในโค้ดทันที`
      : `Are you sure you want to permanently delete custom dynamic chain "${item.key}"? This will physically unregister it from search/drill-down routing immediately.`,
    'Warning / คำเตือน',
    {
      confirmButtonText: isShadowOverride ? 'ลบและ Revert กลับค่าปกติ' : 'Permanently Delete',
      cancelButtonText: 'Cancel',
      type: 'warning',
    }
  ).then(async () => {
    try {
      const res = await fetch(`${props.apiBase}/api/registry/tables/${item.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const result = await res.json();
      if (result.success) {
        // Hot-reload
        await fetch(`${props.apiBase}/api/registry/reload`, {
          method: 'POST',
          headers: getAuthHeaders(),
        });
        
        ElMessage.success(
          isShadowOverride
            ? `ลบการตั้งค่าเขียนทับของ "${item.key}" เรียบร้อยแล้ว (ระบบย้อนกลับไปใช้ดีฟอลต์ดั้งเดิม)`
            : `Custom table registry "${item.key}" removed & hot-reloaded.`
        );
        
        if (selectedTable.value && selectedTable.value.key === item.key) {
          selectedTable.value = null;
          resetForm();
        }
        await loadTables();
        emit('saved');
      } else {
        ElMessage.error(result.message || 'Delete operation failed.');
      }
    } catch (err) {
      ElMessage.error('Server connection error during registry deletion.');
    }
  }).catch(() => {});
}

</script>

<style scoped>
:deep(.registry-manager-dialog) {
  border-radius: 20px !important;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.28) !important;
  overflow: hidden;
  max-width: 1700px;
  background: rgba(255, 255, 255, 0.95);
}

:deep(.registry-manager-dialog .el-dialog__header) {
  background: linear-gradient(135deg, hsl(235, 75%, 22%) 0%, hsl(245, 80%, 14%) 100%);
  margin-right: 0;
  padding: 22px 28px;
}

:deep(.registry-manager-dialog .el-dialog__title),
:deep(.registry-manager-dialog .el-dialog__headerbtn .el-dialog__close) {
  color: white;
}

:deep(.registry-manager-dialog .el-dialog__title) {
  font-weight: 700;
  font-size: 1.35rem;
}

:deep(.registry-manager-dialog .el-dialog__body) {
  padding: 0 !important;
}

.registry-manager-content {
  display: flex;
  height: 750px;
  background-color: #f6f8fb;
}

/* Sidebar List Panel Styling */
.sidebar-panel {
  width: 340px;
  background: white;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.panel-header {
  padding: 16px 20px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-title {
  font-weight: 700;
  font-size: 0.95rem;
  color: #1e293b;
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-box {
  padding: 12px 16px;
  background: #ffffff;
  border-bottom: 1px solid #f1f5f9;
}

.table-list-wrapper {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}

.section-title-group {
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  color: #64748b;
  padding: 12px 10px 6px 10px;
  letter-spacing: 0.05em;
}

.empty-dynamic-hint {
  font-size: 0.76rem;
  color: #94a3b8;
  padding: 12px 10px;
  text-align: center;
}

.table-item {
  padding: 14px 16px;
  border-radius: 12px;
  cursor: pointer;
  margin-bottom: 6px;
  transition: all 0.2s ease-in-out;
  border: 2px solid transparent;
  background: #f8fafc;
}

.table-item:hover {
  background: #f1f5f9;
  transform: translateY(-1px);
}

.table-item.active {
  background: #f0f7ff;
  border-color: #3b82f6;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.08);
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.item-name {
  font-weight: 700;
  font-size: 0.85rem;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 170px;
}

.badge {
  font-size: 0.65rem;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 6px;
  text-transform: uppercase;
}

.badge.static {
  color: #475569;
  background: #e2e8f0;
}

.badge.dynamic {
  color: #3b82f6;
  background: #eff6ff;
}

.item-label {
  font-size: 0.8rem;
  color: #334155;
  margin-bottom: 4px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-db-info {
  font-size: 0.7rem;
  color: #94a3b8;
  font-family: monospace;
}

.item-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.delete-item-btn {
  padding: 0 4px !important;
  font-size: 1rem !important;
  opacity: 0.5;
  transition: opacity 0.2s;
}

.delete-item-btn:hover {
  opacity: 1;
}

/* Center Form Config Panel Styling */
.center-panel {
  flex: 1;
  background: white;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.empty-state-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px;
  text-align: center;
  color: #64748b;
}

.empty-state-pane .empty-icon {
  font-size: 4rem;
  margin-bottom: 20px;
}

.empty-state-pane h3 {
  font-size: 1.2rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 10px;
}

.empty-state-pane p {
  font-size: 0.85rem;
  max-width: 420px;
  line-height: 1.6;
}

.form-pane-inner {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.static-lock-alert {
  margin-bottom: 24px;
  border-radius: 10px;
}

.config-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-row {
  display: flex;
  gap: 20px;
}

.form-col {
  flex: 1;
}

:deep(.config-form .el-form-item) {
  margin-bottom: 12px;
}

:deep(.config-form .el-form-item__label) {
  font-size: 0.78rem;
  font-weight: 700;
  color: #334155;
  padding-bottom: 4px;
}

.input-hint {
  font-size: 0.68rem;
  color: #94a3b8;
  margin-top: 2px;
  display: block;
}

.custom-sql-toggle-area {
  margin-top: 10px;
  background: #f8fafc;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
}

.section-desc-hint {
  font-size: 0.72rem;
  color: #64748b;
  margin: 6px 0 0 0;
}

.custom-sql-box {
  margin-top: 14px;
  background: #fafafa;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 18px;
}

.sql-hint-bubble {
  background: #f1f5f9;
  border-left: 4px solid #3b82f6;
  padding: 10px 14px;
  margin-top: 8px;
  border-radius: 0 8px 8px 0;
  font-size: 0.72rem;
  color: #334155;
}

.sql-hint-bubble strong {
  display: block;
  margin-bottom: 4px;
}

.sql-hint-bubble ul {
  margin: 0;
  padding-left: 16px;
}

/* SQL test console mini layout */
.sql-test-console {
  margin-top: 20px;
  border-top: 1px dashed #e2e8f0;
  padding-top: 18px;
}

.console-action-row {
  display: flex;
  margin-bottom: 14px;
}

.mini-console {
  background: #0f172a;
  border-radius: 12px;
  border: 1px solid #1e293b;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
}

.mini-console .console-header {
  background: #1e293b;
  color: #94a3b8;
  padding: 8px 16px;
  font-size: 0.7rem;
  font-family: monospace;
  display: flex;
  justify-content: space-between;
  font-weight: 700;
}

.mini-console .latency {
  color: #10b981;
}

.console-body-wrapper {
  padding: 12px;
  min-height: 80px;
}

.console-error-msg {
  color: #ef4444;
  font-family: monospace;
  font-size: 0.74rem;
  line-height: 1.5;
}

.console-empty {
  color: #94a3b8;
  text-align: center;
  font-size: 0.75rem;
  padding: 20px;
}

/* Panel 3: Right Panel - Column Editor Styling */
.right-panel {
  width: 440px;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
}

.right-panel .panel-header {
  background: #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
}

.columns-pane-inner {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.no-columns-alert {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1d4ed8;
  border-radius: 10px;
  padding: 16px;
  font-size: 0.78rem;
  line-height: 1.6;
}

.column-list-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.column-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.02);
}

.col-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.db-col-name {
  font-family: monospace;
  font-size: 0.8rem;
  font-weight: 700;
  color: #0f172a;
}

.col-inputs-row {
  margin-bottom: 12px;
}

:deep(.col-inputs-row .el-input-group__prepend) {
  background: #f8fafc;
  font-size: 0.7rem;
  color: #64748b;
  font-weight: 700;
}

/* Pivot Linkages list inside Column Cards */
.pivot-links-section {
  border-top: 1px solid #f1f5f9;
  padding-top: 10px;
  margin-top: 10px;
}

.pivot-links-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.pivot-links-header span {
  font-size: 0.72rem;
  font-weight: 700;
  color: #64748b;
}

.no-links-hint {
  font-size: 0.68rem;
  color: #94a3b8;
  font-style: italic;
}

.links-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.link-pill {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  padding: 6px 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.link-target-text {
  font-size: 0.72rem;
  font-family: monospace;
  color: #166534;
  display: flex;
  flex-direction: column;
}

.link-lbl-bubble {
  font-size: 0.65rem;
  color: #15803d;
  font-family: inherit;
  font-weight: bold;
}

.delete-link-btn {
  padding: 0 2px !important;
  font-size: 0.7rem !important;
}

/* Link builder modal styling */
.link-builder-modal :deep(.el-form-item__label) {
  font-size: 0.76rem;
  font-weight: 700;
  color: #475569;
}

/* Footers */
.dialog-footer-main {
  padding: 16px 28px;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.save-table-btn {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%) !important;
  border: none !important;
  box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);
  font-weight: 700;
}

.save-table-btn:hover {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%) !important;
  transform: translateY(-1px);
}

/* Custom SQL Tutorial Panel */
.custom-sql-tutorial-panel {
  margin-top: 12px;
}

.custom-sql-collapse {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: white;
  overflow: hidden;
}

.tutorial-title-header {
  font-size: 0.75rem;
  font-weight: 700;
  color: #1e3a8a;
  display: flex;
  align-items: center;
  gap: 6px;
}

:deep(.custom-sql-collapse .el-collapse-item__header) {
  background: #f8fafc;
  padding: 0 16px;
  font-size: 0.76rem;
  font-weight: 700;
  color: #1e3a8a;
  border-bottom: 1px solid #e2e8f0;
  height: 38px;
  line-height: 38px;
}

:deep(.custom-sql-collapse .el-collapse-item__content) {
  padding: 16px;
  background: #ffffff;
  color: #334155;
  font-size: 0.74rem;
}

.tutorial-cases-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tutorial-case-block {
  border: 1px solid #f1f5f9;
  background: #f8fafc;
  border-radius: 8px;
  padding: 12px;
}

.case-badge-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.76rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 6px 0;
}

.tutorial-badge-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.76rem;
  font-weight: 700;
  color: #1e3a8a;
  margin: 0 0 6px 0;
}

.badge-number {
  background: #dc2626;
  color: white;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 0.65rem;
  font-weight: 700;
}

.tutorial-badge-title.blue .badge-number {
  background: #2563eb;
}

.case-description {
  margin: 0 0 8px 0;
  font-size: 0.72rem;
  color: #475569;
  line-height: 1.4;
}

.rule-warning-alert {
  background: #fef2f2;
  border-left: 3px solid #ef4444;
  color: #991b1b;
  padding: 8px;
  margin-bottom: 8px;
  border-radius: 0 4px 4px 0;
  font-size: 0.7rem;
  line-height: 1.4;
}

.rule-info-alert {
  background: #eff6ff;
  border-left: 3px solid #3b82f6;
  color: #1e40af;
  padding: 8px;
  margin-bottom: 8px;
  border-radius: 0 4px 4px 0;
  font-size: 0.7rem;
  line-height: 1.4;
}

.rule-info-alert ol {
  margin: 4px 0 0 0;
  padding-left: 16px;
}

.code-copy-wrapper {
  background: #0f172a;
  border-radius: 6px;
  padding: 8px 12px;
  overflow-x: auto;
  border: 1px solid #1e293b;
}

.tutorial-code {
  margin: 0;
  font-family: monospace;
  font-size: 0.68rem;
  color: #e2e8f0;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
