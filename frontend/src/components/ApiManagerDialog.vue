<template>
  <el-dialog
    :model-value="modelValue"
    title="🔌 API Endpoints Manager"
    width="85%"
    class="api-manager-dialog"
    destroy-on-close
    @update:model-value="$emit('update:modelValue', $event)"
    @open="loadEndpoints"
  >
    <div class="api-manager-content">
      <!-- Left: Endpoint List Sidebar -->
      <div class="endpoints-sidebar">
        <div class="sidebar-header">
          <span class="title">Saved Endpoints</span>
          <el-badge :value="filteredEndpoints.length" type="primary" class="count-badge" />
        </div>

        <div class="group-filter-bar">
          <el-tag
            v-for="g in groupTabs"
            :key="g.key"
            :type="activeGroup === g.key ? 'primary' : 'info'"
            :effect="activeGroup === g.key ? 'dark' : 'plain'"
            class="group-pill"
            @click="activeGroup = g.key"
          >
            {{ g.label }} <span class="pill-count">{{ g.count }}</span>
          </el-tag>
        </div>

        <div v-loading="loadingList" class="endpoints-list-wrapper">
          <div v-if="filteredEndpoints.length === 0" class="empty-sidebar">
            <span class="empty-icon">🔌</span>
            <p>No APIs in this group.</p>
            <span class="hint">{{ isAdmin ? 'Search data and click "Save as API" to create one.' : 'ติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์เข้าถึง API เพิ่ม' }}</span>
          </div>
          <div
            v-for="ep in filteredEndpoints"
            :key="ep.id"
            :class="['endpoint-item', { active: selectedEp && selectedEp.id === ep.id }]"
            @click="selectEndpoint(ep)"
          >
            <div class="ep-item-header">
              <span class="ep-name">{{ ep.name }}</span>
              <span class="ep-method">GET</span>
            </div>
            <div class="ep-item-id">/api/v1/trace/{{ ep.id }}</div>
            <div class="ep-item-tag-row">
              <el-tag size="small" effect="plain" type="info">{{ ep.apiGroup || 'General' }}</el-tag>
              <el-tag
                size="small"
                effect="plain"
                :type="ep.visibility === 'restricted' ? 'danger' : 'success'"
              >
                {{ ep.visibility === 'restricted' ? '🔒 Restricted' : '🌍 Public' }}
              </el-tag>
              <el-tag v-if="currentEn && ep.createdBy === currentEn" size="small" effect="plain" type="warning">👤 Mine</el-tag>
            </div>
            <div v-if="ep.description" class="ep-item-desc">{{ ep.description }}</div>
          </div>
        </div>
      </div>

      <!-- Right: Detailed Configuration, Dynamic Test Form & Preview -->
      <div class="endpoint-details-pane">
        <div v-if="!selectedEp" class="empty-details">
          <span class="empty-details-icon">⚡</span>
          <h3>Select an Endpoint from the sidebar</h3>
          <p>You can manage, generate PowerBI integrations, dynamically parameterize, test queries, and fetch raw cURL or Python code scripts here.</p>
        </div>
        <div v-else class="details-inner">
          <!-- Metadata Header -->
          <div class="details-header-card">
            <div class="details-title-row">
              <h2>{{ selectedEp.name }}</h2>
              <el-button
                v-if="canEditSelected"
                type="danger"
                size="small"
                plain
                @click="confirmDelete(selectedEp)"
              >
                🗑️ Delete API
              </el-button>
              <el-tag v-else size="small" type="info" effect="plain">🔍 Read-Only Sandbox</el-tag>
            </div>
            <p class="ep-desc">{{ selectedEp.description || 'No description provided.' }}</p>
            <div class="meta-info">
              <el-tag size="small" type="info">Endpoint ID: {{ selectedEp.id }}</el-tag>
              <el-tag size="small" type="success">Root Table: {{ selectedEp.config.rootTable }}</el-tag>
              <el-tag size="small" type="warning">Group: {{ selectedEp.apiGroup || 'General' }}</el-tag>
              <el-tag size="small" :type="selectedEp.visibility === 'restricted' ? 'danger' : 'success'">
                {{ selectedEp.visibility === 'restricted' ? '🔒 Restricted' : '🌍 Public' }}
              </el-tag>
              <el-tag v-if="selectedEp.createdBy" size="small" type="info">Created by: {{ selectedEp.createdBy }}</el-tag>
            </div>
          </div>



          <!-- Consumer-only: Smart Sandbox hero banner -->
          <div v-if="!canEditSelected" class="sandbox-hero-card">
            <div class="sandbox-hero-icon">🧪</div>
            <div class="sandbox-hero-body">
              <h3>Smart Sandbox Playground</h3>
              <p>
                ป้อนพารามิเตอร์ด้านล่าง ทดลองรันคิวรีสด ดูข้อมูลในตาราง และดาวน์โหลด CSV เพื่อนำไปใช้ใน Excel / PowerBI ได้ทันที
                — โหมดอ่านอย่างเดียว ไม่กระทบข้อมูลต้นทาง
              </p>
              <div class="sandbox-hero-actions">
                <el-button size="small" type="success" plain @click="downloadCsvDirect">📥 Download CSV</el-button>
              </div>
            </div>
          </div>

          <!-- Tabs for Parameter Form & Testing OR Code Snippets -->
          <el-tabs v-model="activeTab" class="details-tabs">
            <!-- Dynamic Test & Parameterizer Tab -->
            <el-tab-pane name="test">
              <template #label>
                <span class="tab-label-custom">
                  <svg class="tab-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  <span>Dynamic Query & Live Test</span>
                </span>
              </template>
              <div class="tab-content-grid">
                <!-- Parameters form -->
                <div class="params-column">
                  <div class="section-title">Query Parameters (Allowed)</div>
                  <p class="section-desc">Values below will be injected as filters to dynamically query the data.</p>
                  
                  <div v-if="allowedParamsList.length === 0" class="no-params-alert">
                    This endpoint does not define allowed query parameters. It will execute with its default root query.
                  </div>
                  <el-form v-else label-position="top" class="params-form">
                    <el-form-item
                      v-for="param in allowedParamsList"
                      :key="param"
                      :label="param"
                    >
                      <el-input
                        v-model="paramInputs[param]"
                        type="textarea"
                        :autosize="{ minRows: 1, maxRows: 6 }"
                        placeholder="Filter value (supports multiple lines/comma separated)..."
                        @input="updateUrls"
                      />
                    </el-form-item>
                  </el-form>
                </div>

                <!-- Integration URLs Card -->
                <div class="urls-column">
                  <div class="section-title">Live Dynamic Endpoint URLs</div>
                  <p class="section-desc">Use these URLs in PowerBI, Excel, or internal microservices.</p>

                  <div class="url-card json-card">
                    <div class="url-header">
                      <span class="format-badge json">GET - JSON</span>
                      <el-button type="primary" size="small" link @click="copyText(jsonUrl)">Copy URL</el-button>
                    </div>
                    <code class="url-text">{{ jsonUrl }}</code>
                  </div>

                  <div class="url-card csv-card">
                    <div class="url-header">
                      <span class="format-badge csv">GET - CSV (Excel / PowerBI)</span>
                      <el-button type="success" size="small" link @click="copyText(csvUrl)">Copy URL</el-button>
                    </div>
                    <code class="url-text">{{ csvUrl }}</code>
                  </div>

                  <div class="url-card post-json-card">
                    <div class="url-header">
                      <span class="format-badge post">POST - JSON Payload</span>
                      <el-button type="warning" size="small" link @click="copyText(postBodyJson)">Copy Body</el-button>
                    </div>
                    <div class="post-url-section">
                      <span class="post-method">POST</span>
                      <code class="post-url-text">{{ postUrl }}</code>
                    </div>
                    <pre class="post-body-pre"><code>{{ postBodyJson }}</code></pre>
                  </div>

                  <div class="test-controls">
                    <el-button
                      type="primary"
                      size="large"
                      style="flex: 1;"
                      :loading="testing"
                      @click="testEndpoint"
                    >
                      ⚡ Test Endpoint (Live Query)
                    </el-button>
                    <el-button
                      type="success"
                      size="large"
                      plain
                      @click="downloadCsvDirect"
                    >
                      📥 Download CSV
                    </el-button>
                  </div>
                </div>
              </div>

              <!-- Test Result Preview Box -->
              <div v-if="testResult || testing" class="preview-console-box">
                <div class="console-header">
                  <span class="title">Live Query Preview Console</span>
                  <div v-if="testResult" class="console-status">
                    <span class="status-indicator success"></span>
                    200 OK | {{ testResult.count }} Rows | {{ latency }}ms
                  </div>
                </div>
                <div v-loading="testing" class="console-body">
                  <div v-if="testResult">
                    <el-tabs v-model="consoleActiveTab" class="console-sub-tabs">
                      <el-tab-pane name="grid">
                        <template #label>
                          <span class="tab-label-custom">
                            <svg class="tab-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                              <line x1="3" y1="9" x2="21" y2="9" />
                              <line x1="3" y1="15" x2="21" y2="15" />
                              <line x1="10" y1="3" x2="10" y2="21" />
                            </svg>
                            <span>Grid Data Preview (Top 10)</span>
                          </span>
                        </template>
                        <el-table
                          v-if="testResult.data.length"
                          :data="testResult.data.slice(0, 10)"
                          size="small"
                          border
                          stripe
                          style="width: 100%"
                          max-height="300"
                        >
                          <el-table-column
                            v-for="col in Object.keys(testResult.data[0])"
                            :key="col"
                            :prop="col"
                            :label="col"
                            min-width="150"
                            show-overflow-tooltip
                          />
                        </el-table>
                        <el-empty v-else description="No rows returned by this query." />
                      </el-tab-pane>
                      <el-tab-pane name="json">
                        <template #label>
                          <span class="tab-label-custom">
                            <svg class="tab-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <polyline points="16 18 22 12 16 6" />
                              <polyline points="8 6 2 12 8 18" />
                            </svg>
                            <span>Raw JSON Output</span>
                          </span>
                        </template>
                        <pre class="json-pre"><code>{{ JSON.stringify(testResult, null, 2) }}</code></pre>
                      </el-tab-pane>
                    </el-tabs>
                  </div>
                </div>
              </div>
            </el-tab-pane>

            <!-- Access Permissions Tab -->
            <el-tab-pane v-if="canEditSelected" name="permissions">
              <template #label>
                <span class="tab-label-custom">
                  <svg class="tab-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <span>Access Permissions</span>
                </span>
              </template>
              
              <div class="tab-permissions-container" style="padding: 6px 4px;">
                <div class="section-title" style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 8px;">
                  <span>🛡️ ตั้งค่าสิทธิ์การเข้าถึงข้อมูล (Access Permissions)</span>
                  <el-button type="primary" size="default" :loading="savingAccess" @click="saveAccess">💾 Save Changes</el-button>
                </div>
                <p class="section-desc">Manage who can query this dynamic endpoint, change visibility, and specify group categories.</p>
                
                <el-form label-position="top" size="default" class="params-form" style="max-width: 650px; margin-top: 14px;">
                  <el-form-item label="หมวดหมู่กลุ่มระบบงาน (API Group / Department)">
                    <el-select
                      v-model="accessForm.apiGroup"
                      allow-create
                      filterable
                      default-first-option
                      style="width: 100%;"
                    >
                      <el-option v-for="g in API_GROUP_OPTIONS" :key="g" :label="g" :value="g" />
                    </el-select>
                  </el-form-item>
                  
                  <el-form-item label="สิทธิ์การมองเห็น (Visibility Mode)">
                    <el-radio-group v-model="accessForm.visibility">
                      <el-radio-button value="public">🌍 Public (ทุกคนดึงข้อมูลได้)</el-radio-button>
                      <el-radio-button value="restricted">🔒 Restricted (เฉพาะ EN ที่ระบุ)</el-radio-button>
                    </el-radio-group>
                  </el-form-item>
                  
                  <el-form-item v-if="accessForm.visibility === 'restricted'" label="รายชื่อพนักงานที่ได้รับสิทธิ์ดึงข้อมูล (Allowed ENs) - Autocomplete 🔍">
                    <el-select
                      v-model="accessForm.allowedUsers"
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
                    <div style="font-size: var(--fs-xs); color: var(--c-info); margin-top: 6px;">พิมพ์ชื่อหรือรหัสพนักงานเพื่อค้นหาแบบสด (Real-time Autocomplete) ดึงข้อมูลตรงจาก API personal ในระบบของเรา!</div>
                  </el-form-item>
                </el-form>
              </div>
            </el-tab-pane>

            <!-- Code Integration Tab -->
            <el-tab-pane v-if="isAdmin" name="code">
              <template #label>
                <span class="tab-label-custom">
                  <svg class="tab-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="16 18 22 12 16 6" />
                    <polyline points="8 6 2 12 8 18" />
                    <line x1="12" y1="2" x2="12" y2="22" stroke-linecap="round" />
                  </svg>
                  <span>Developer Code Integration</span>
                </span>
              </template>
              <div class="section-title">Ready-To-Run Code Integration Snippets</div>
              <p class="section-desc">Copy-paste these scripts into your development environment to pull this live API programmatically.</p>

              <el-tabs v-model="activeCodeLang" class="code-snippets-tabs" type="card">
                <el-tab-pane label="🐍 Python (Pandas)" name="python">
                  <div class="code-box-wrapper">
                    <div class="code-box-header">
                      <span>Python Script (Pandas DataFrame)</span>
                      <el-button type="primary" size="small" link @click="copyText(pythonSnippet)">Copy Code</el-button>
                    </div>
                    <pre class="code-pre"><code>{{ pythonSnippet }}</code></pre>
                  </div>
                </el-tab-pane>

                <el-tab-pane label="🌐 JavaScript (Fetch)" name="javascript">
                  <div class="code-box-wrapper">
                    <div class="code-box-header">
                      <span>JavaScript Client Fetch</span>
                      <el-button type="primary" size="small" link @click="copyText(jsSnippet)">Copy Code</el-button>
                    </div>
                    <pre class="code-pre"><code>{{ jsSnippet }}</code></pre>
                  </div>
                </el-tab-pane>

                <el-tab-pane label="🐚 Shell (cURL)" name="curl">
                  <div class="code-box-wrapper">
                    <div class="code-box-header">
                      <span>cURL Command Line</span>
                      <el-button type="primary" size="small" link @click="copyText(curlSnippet)">Copy Code</el-button>
                    </div>
                    <pre class="code-pre"><code>{{ curlSnippet }}</code></pre>
                  </div>
                </el-tab-pane>
              </el-tabs>
            </el-tab-pane>
          </el-tabs>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="$emit('update:modelValue', false)">Close</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  apiBase: { type: String, required: true },
});

defineEmits(['update:modelValue']);

const API_GROUP_OPTIONS = ['Yield Tracking', 'Coil Traceability', 'PCCA Rework', 'Logistics', 'General'];

const endpoints = ref([]);
const selectedEp = ref(null);
const loadingList = ref(false);
const activeTab = ref('test');
const consoleActiveTab = ref('grid');
const activeCodeLang = ref('python');
const activeGroup = ref('__ALL__');

// 🆕 RBAC viewer detection — pulls from localStorage (set by AdminLoginDialog and shared with TraceabilityFlow)
const adminUser = ref(JSON.parse(localStorage.getItem('sg_admin_user') || 'null'));
const currentEn = computed(() => adminUser.value?.en || '');
const isAdmin = computed(() => adminUser.value?.permission === 'admin');

function authHeaders(extra = {}) {
  const h = { ...extra };
  if (currentEn.value) h['x-user-en'] = String(currentEn.value);
  return h;
}

// Test & parameters state
const paramInputs = ref({});
const jsonUrl = ref('');
const csvUrl = ref('');
const testing = ref(false);
const testResult = ref(null);
const latency = ref(0);

// Access permissions form state (admin/owner only)
const accessForm = ref({ apiGroup: 'General', visibility: 'public', allowedUsers: [] });
const savingAccess = ref(false);

// Real-time Employee Autocomplete using dynamic api-hr-autocompleted saved endpoint!
const searchLoading = ref(false);
const employeeSuggestions = ref([]);

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
        // Resolve keys (case/underscore-insensitive)
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


const allowedParamsList = computed(() => {
  if (!selectedEp.value || !selectedEp.value.config) return [];
  return selectedEp.value.config.allowedParams || [];
});

const canEditSelected = computed(() => {
  if (!selectedEp.value) return false;
  if (isAdmin.value) return true;
  return !!currentEn.value && selectedEp.value.createdBy === currentEn.value;
});

const groupTabs = computed(() => {
  const counts = new Map();
  endpoints.value.forEach(ep => {
    const g = ep.apiGroup || 'General';
    counts.set(g, (counts.get(g) || 0) + 1);
  });
  const tabs = [
    { key: '__ALL__', label: 'All', count: endpoints.value.length },
  ];
  if (currentEn.value) {
    tabs.push({ key: '__MINE__', label: '👤 My APIs', count: endpoints.value.filter(e => e.createdBy === currentEn.value).length });
    tabs.push({ key: '__RESTRICTED__', label: '🔒 Restricted', count: endpoints.value.filter(e => e.visibility === 'restricted').length });
  }
  [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([g, c]) => {
    tabs.push({ key: g, label: g, count: c });
  });
  return tabs;
});

const filteredEndpoints = computed(() => {
  const g = activeGroup.value;
  if (g === '__ALL__') return endpoints.value;
  if (g === '__MINE__') return endpoints.value.filter(e => currentEn.value && e.createdBy === currentEn.value);
  if (g === '__RESTRICTED__') return endpoints.value.filter(e => e.visibility === 'restricted');
  return endpoints.value.filter(e => (e.apiGroup || 'General') === g);
});

async function loadEndpoints() {
  loadingList.value = true;
  selectedEp.value = null;
  testResult.value = null;
  // Refresh admin user from storage each time the dialog opens
  adminUser.value = JSON.parse(localStorage.getItem('sg_admin_user') || 'null');
  try {
    const res = await fetch(`${props.apiBase}/api/v1/endpoints`, { headers: authHeaders() });
    const result = await res.json();
    if (result.success) {
      endpoints.value = result.data || [];
      if (filteredEndpoints.value.length > 0) {
        selectEndpoint(filteredEndpoints.value[0]);
      }
    } else {
      ElMessage.error(result.message || 'Failed to load endpoints');
    }
  } catch (err) {
    console.error(err);
    ElMessage.error('Server connection error while loading endpoints');
  } finally {
    loadingList.value = false;
  }
}

function selectEndpoint(ep) {
  selectedEp.value = ep;
  testResult.value = null;
  activeTab.value = 'test';
  consoleActiveTab.value = 'grid';

  // Initialize parameter inputs
  paramInputs.value = {};
  if (ep.config && ep.config.allowedParams) {
    ep.config.allowedParams.forEach(p => {
      paramInputs.value[p] = '';
    });
  }

  // Initialize access form for admins/owners
  accessForm.value = {
    apiGroup: ep.apiGroup || 'General',
    visibility: ep.visibility === 'restricted' ? 'restricted' : 'public',
    allowedUsers: Array.isArray(ep.allowedUsers) ? [...ep.allowedUsers] : [],
  };

  // Seed employee suggestions with currently allowed users so they render correctly
  employeeSuggestions.value = (ep.allowedUsers || []).map(en => ({
    en: String(en),
    name: String(en),
    display: `${en}`
  }));

  updateUrls();
}

async function saveAccess() {
  if (!selectedEp.value) return;
  savingAccess.value = true;
  try {
    const res = await fetch(`${props.apiBase}/api/v1/endpoints/${selectedEp.value.id}`, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        apiGroup: accessForm.value.apiGroup || 'General',
        visibility: accessForm.value.visibility === 'restricted' ? 'restricted' : 'public',
        allowedUsers: accessForm.value.visibility === 'restricted' ? [...accessForm.value.allowedUsers] : [],
      }),
    });
    const result = await res.json();
    if (result.success) {
      ElMessage.success('อัปเดตสิทธิ์การเข้าถึงสำเร็จ');
      // Patch the cached endpoint with the saved result so UI tags refresh instantly
      Object.assign(selectedEp.value, result.data);
      const idx = endpoints.value.findIndex(e => e.id === selectedEp.value.id);
      if (idx >= 0) endpoints.value.splice(idx, 1, { ...selectedEp.value });
    } else {
      ElMessage.error(result.message || 'อัปเดตสิทธิ์ล้มเหลว');
    }
  } catch (err) {
    console.error(err);
    ElMessage.error('Server connection error during access update');
  } finally {
    savingAccess.value = false;
  }
}

function updateUrls() {
  if (!selectedEp.value) return;
  const baseUrl = `${props.apiBase}/api/v1/trace/${selectedEp.value.id}`;
  
  const queryParts = [];
  Object.entries(paramInputs.value).forEach(([k, v]) => {
    if (v && v.trim() !== '') {
      queryParts.push(`${k}=${encodeURIComponent(v.trim())}`);
    }
  });

  const queryStr = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  jsonUrl.value = baseUrl + queryStr;
  
  const csvQueryStr = queryParts.length > 0 
    ? `?format=csv&${queryParts.join('&')}` 
    : '?format=csv';
  csvUrl.value = baseUrl + csvQueryStr;
}

async function testEndpoint() {
  if (!selectedEp.value) return;
  testing.value = true;
  testResult.value = null;

  const startTime = performance.now();
  try {
    const res = await fetch(postUrl.value, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(requestBodyObj.value)
    });
    const result = await res.json();
    latency.value = Math.round(performance.now() - startTime);
    if (res.status === 200) {
      testResult.value = result;
    } else {
      ElMessage.error(result.message || 'Query execution failed');
    }
  } catch (err) {
    console.error(err);
    ElMessage.error('Server connection error while querying API');
  } finally {
    testing.value = false;
  }
}

function downloadCsvDirect() {
  if (!csvUrl.value) return;
  window.open(csvUrl.value, '_blank');
}

function copyText(text) {
  if (!navigator.clipboard) {
    // Fallback
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      ElMessage.success('Copied to clipboard!');
    } catch (err) {
      ElMessage.error('Failed to copy link');
    }
    document.body.removeChild(textArea);
    return;
  }
  navigator.clipboard.writeText(text).then(() => {
    ElMessage.success('Copied to clipboard!');
  }).catch(() => {
    ElMessage.error('Failed to copy link');
  });
}

function confirmDelete(ep) {
  ElMessageBox.confirm(
    `Are you sure you want to permanently delete endpoint "${ep.name}"?`,
    'Warning',
    {
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
      type: 'warning',
    }
  ).then(async () => {
    try {
      const res = await fetch(`${props.apiBase}/api/v1/endpoints/${ep.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const result = await res.json();
      if (result.success) {
        ElMessage.success(`API "${ep.name}" deleted successfully.`);
        loadEndpoints();
      } else {
        ElMessage.error(result.message || 'Delete failed');
      }
    } catch (err) {
      ElMessage.error('Server connection error during delete');
    }
  }).catch(() => {});
}

// Dynamic Code Snippets Computeds
const pythonSnippet = computed(() => {
  return `import pandas as pd

# Dynamic CSV fetch directly into a Pandas DataFrame
url = "${csvUrl.value}"
df = pd.read_csv(url)

# Display top 5 rows
print("Fetched rows count:", len(df))
print(df.head())`;
});

const jsSnippet = computed(() => {
  return `// JavaScript integration using modern async/fetch API
const fetchApi = async () => {
  const url = "${jsonUrl.value}";
  try {
    const response = await fetch(url);
    const result = await response.json();
    if (result.success) {
      console.log(\`Successfully fetched \${result.count} rows:\`, result.data);
    } else {
      console.error("API error:", result.message);
    }
  } catch (error) {
    console.error("Connection failed:", error);
  }
};

fetchApi();`;
});

const curlSnippet = computed(() => {
  return `curl -X GET "${csvUrl.value}" -o "${selectedEp.value ? selectedEp.value.id : 'api_data'}.csv"`;
});

const postUrl = computed(() => {
  return `${props.apiBase}/api/v1/trace/${selectedEp.value ? selectedEp.value.id : ''}`;
});

const postBodyJson = computed(() => {
  const obj = {};
  Object.entries(paramInputs.value).forEach(([k, v]) => {
    if (v && v.trim() !== '') {
      const split = v.split(/[\n,]+/).map(item => item.trim()).filter(Boolean);
      obj[k] = split.length > 1 ? split : split[0];
    } else {
      obj[k] = "";
    }
  });
  return JSON.stringify(obj, null, 2);
});

const requestBodyObj = computed(() => {
  const obj = {};
  Object.entries(paramInputs.value).forEach(([k, v]) => {
    if (v && v.trim() !== '') {
      const split = v.split(/[\n,]+/).map(item => item.trim()).filter(Boolean);
      obj[k] = split.length > 1 ? split : split[0];
    }
  });
  return obj;
});

</script>

<style scoped>
:deep(.api-manager-dialog) {
  border-radius: 16px !important;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.22) !important;
  overflow: hidden;
  max-width: 1500px;
}
:deep(.api-manager-dialog .el-dialog__header) {
  background: linear-gradient(135deg, hsl(218, 75%, 18%) 0%, hsl(230, 70%, 12%) 100%);
  margin-right: 0;
  padding: 20px 24px;
}
:deep(.api-manager-dialog .el-dialog__title),
:deep(.api-manager-dialog .el-dialog__headerbtn .el-dialog__close) {
  color: white;
}
:deep(.api-manager-dialog .el-dialog__title) {
  font-weight: 700;
  font-size: var(--fs-lg);
}
:deep(.api-manager-dialog .el-dialog__body) {
  padding: 0 !important; /* full height split sidebar */
}

.api-manager-content {
  display: flex;
  height: 680px;
  background-color: #f8f9fa;
}

/* Sidebar Styling */
.endpoints-sidebar {
  width: 320px;
  background: white;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.sidebar-header {
  padding: 16px 20px;
  border-bottom: 1px solid #f0f2f5;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.sidebar-header .title {
  font-weight: 700;
  font-size: var(--fs-base);
  color: var(--text-primary);
}
.endpoints-list-wrapper {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}

.group-filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid #f0f2f5;
  background: #fafbfc;
}
.group-pill {
  cursor: pointer;
  font-size: var(--fs-xs);
  font-weight: 600;
  transition: all 0.18s ease;
}
.group-pill:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(0,0,0,0.06);
}
.pill-count {
  margin-left: 4px;
  font-size: 0.66rem;
  opacity: 0.75;
}
.ep-item-tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 4px 0 4px 0;
}

.access-panel-card {
  background: white;
  border: 1px solid #e4e7ed;
  border-left: 4px solid var(--c-warning);
  border-radius: 12px;
  padding: 14px 18px;
  margin-bottom: 16px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.03);
}
.access-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.access-panel-header .title {
  font-weight: 700;
  font-size: 0.92rem;
  color: var(--text-primary);
}
.access-panel-body :deep(.el-form-item) {
  margin-bottom: 12px;
}

.sandbox-hero-card {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  background: linear-gradient(135deg, #ecf5ff 0%, #f0f9eb 100%);
  border: 1px solid #d9ecff;
  border-left: 4px solid var(--c-primary);
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 18px;
  box-shadow: 0 4px 14px rgba(64, 158, 255, 0.06);
}
.sandbox-hero-icon {
  font-size: 2.2rem;
  line-height: 1;
  flex-shrink: 0;
}
.sandbox-hero-body h3 {
  margin: 0 0 6px 0;
  font-size: 1.02rem;
  font-weight: 700;
  color: #1d4ed8;
}
.sandbox-hero-body p {
  margin: 0 0 10px 0;
  font-size: var(--fs-sm);
  line-height: 1.5;
  color: #4a5568;
}
.sandbox-hero-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.empty-sidebar {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 40px 20px;
}
.empty-sidebar .empty-icon {
  font-size: 2.2rem;
  margin-bottom: 12px;
}
.empty-sidebar p {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0 0 6px 0;
}
.empty-sidebar .hint {
  font-size: var(--fs-xs);
  color: var(--c-info);
  line-height: 1.4;
}

.endpoint-item {
  padding: 14px 16px;
  border-radius: 10px;
  cursor: pointer;
  margin-bottom: 8px;
  transition: all 0.2s ease;
  border: 1.5px solid transparent;
  background: #fafbfc;
}
.endpoint-item:hover {
  background: #f0f4fc;
}
.endpoint-item.active {
  background: #ecf5ff;
  border-color: var(--c-primary);
}
.ep-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.ep-name {
  font-weight: 700;
  font-size: var(--fs-sm);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 190px;
}
.ep-method {
  font-size: var(--fs-xs);
  font-weight: 800;
  color: var(--c-primary);
  background: #ecf5ff;
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid #d9ecff;
}
.ep-item-id {
  font-size: var(--fs-xs);
  font-family: monospace;
  color: var(--c-info);
  margin-bottom: 4px;
}
.ep-item-desc {
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Details Pane Styling */
.endpoint-details-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.empty-details {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px;
  text-align: center;
  color: var(--c-info);
}
.empty-details-icon {
  font-size: 3.5rem;
  margin-bottom: 16px;
}
.empty-details h3 {
  font-size: var(--fs-lg);
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 8px;
}
.empty-details p {
  font-size: var(--fs-sm);
  max-width: 480px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.details-inner {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 24px;
}
.details-header-card {
  background: white;
  border: 1px solid #e4e7ed;
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 20px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.03);
}
.details-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.details-title-row h2 {
  margin: 0;
  font-size: var(--fs-lg);
  font-weight: 700;
  color: var(--text-primary);
}
.ep-desc {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  margin: 0 0 12px 0;
  line-height: 1.5;
}
.meta-info {
  display: flex;
  gap: 8px;
}

.details-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
:deep(.details-tabs .el-tabs__content) {
  flex: 1;
  overflow-y: auto;
  padding-top: 14px;
  display: flex;
  flex-direction: column;
}

.tab-content-grid {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 24px;
  align-items: start;
}

.section-title {
  font-size: var(--fs-base);
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 4px;
}
.section-desc {
  font-size: var(--fs-sm);
  color: var(--c-info);
  margin: 0 0 16px 0;
  line-height: 1.4;
}

.no-params-alert {
  background: #ecf5ff;
  border: 1px solid #d9ecff;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: var(--fs-sm);
  color: var(--c-primary);
  line-height: 1.5;
}

.params-form {
  background: white;
  border: 1px solid #e4e7ed;
  border-radius: 12px;
  padding: 18px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.02);
}
:deep(.params-form .el-form-item) {
  margin-bottom: 14px;
}
:deep(.params-form .el-form-item:last-child) {
  margin-bottom: 0;
}
:deep(.params-form .el-form-item__label) {
  font-size: var(--fs-xs);
  font-weight: 700;
  color: var(--text-secondary);
  padding-bottom: 4px;
}

/* URL Cards */
.url-card {
  background: white;
  border: 1px solid #e4e7ed;
  border-radius: 10px;
  padding: 12px 16px;
  margin-bottom: 16px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.02);
}
.url-card.json-card { border-left: 4px solid var(--c-primary); }
.url-card.csv-card  { border-left: 4px solid var(--c-success); }
.url-card.post-json-card { border-left: 4px solid #ea580c; }

.url-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.format-badge {
  font-size: 0.62rem;
  font-weight: 800;
  padding: 1px 6px;
  border-radius: 4px;
}
.format-badge.json {
  background: #ecf5ff;
  color: var(--c-primary);
}
.format-badge.csv {
  background: #f0f9eb;
  color: var(--c-success);
}
.format-badge.post {
  background: #fff3cd;
  color: #ea580c;
  border: 1px solid #ffeeba;
}
.url-text {
  font-family: monospace;
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  word-break: break-all;
  display: block;
  background: #f8f9fa;
  padding: 8px;
  border-radius: 6px;
}
.post-url-section {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.post-method {
  font-size: var(--fs-xs);
  font-weight: 800;
  color: white;
  background: #ea580c;
  padding: 2px 8px;
  border-radius: 4px;
  flex-shrink: 0;
}
.post-url-text {
  font-family: monospace;
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  word-break: break-all;
  display: block;
  background: #f8f9fa;
  padding: 8px;
  border-radius: 6px;
  flex: 1;
}
.post-body-pre {
  margin: 0;
  padding: 10px;
  background: #0f172a;
  color: #38bdf8;
  font-family: monospace;
  font-size: var(--fs-xs);
  border-radius: 6px;
  max-height: 180px;
  overflow-y: auto;
  line-height: 1.4;
}

.test-controls {
  display: flex;
  gap: 12px;
  margin-top: 14px;
}

/* Console preview styling */
.preview-console-box {
  margin-top: 24px;
  border: 1px solid #cbd5e0;
  border-radius: 12px;
  background: #1e293b;
  color: #f8fafc;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
}
.console-header {
  padding: 10px 16px;
  border-bottom: 1px solid #334155;
  background: #0f172a;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.console-header .title {
  font-size: var(--fs-sm);
  font-weight: 700;
  color: #cbd5e0;
}
.console-status {
  font-size: var(--fs-xs);
  font-family: monospace;
  display: flex;
  align-items: center;
  gap: 6px;
}
.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.status-indicator.success {
  background: #10b981;
  box-shadow: 0 0 8px #10b981;
}
.console-body {
  padding: 12px;
  min-height: 120px;
}
.console-sub-tabs :deep(.el-tabs__item) {
  color: #94a3b8;
  font-size: var(--fs-xs);
  font-weight: 600;
  height: 32px;
}
.console-sub-tabs :deep(.el-tabs__item.is-active) {
  color: #38bdf8;
}
.console-sub-tabs :deep(.el-tabs__active-bar) {
  background-color: #38bdf8;
}
.console-sub-tabs :deep(.el-table) {
  --el-table-bg-color: #0f172a !important;
  --el-table-tr-bg-color: #0f172a !important;
  --el-table-striped-bg-color: #1e293b !important;
  --el-table-header-bg-color: #020617 !important;
  --el-table-border-color: #1e293b !important;
  --el-table-text-color: #ffffff !important;
  --el-table-header-text-color: #38bdf8 !important;
  --el-table-row-hover-bg-color: #2563eb !important;
  font-size: var(--fs-xs) !important;
  background-color: #0f172a !important;
}

/* Force backgrounds on rows and cells in Element Plus dark table to prevent light themes from overriding */
.console-sub-tabs :deep(.el-table tr) {
  background-color: #0f172a !important;
  color: #ffffff !important;
}
.console-sub-tabs :deep(.el-table__row--striped td.el-table__cell) {
  background-color: #1e293b !important;
}
.console-sub-tabs :deep(.el-table th.el-table__cell) {
  background-color: #020617 !important;
  color: #38bdf8 !important;
  font-weight: 750 !important;
  border-bottom: 2px solid #1e293b !important;
}
.console-sub-tabs :deep(.el-table td.el-table__cell) {
  border-bottom: 1px solid #1e293b !important;
  color: #ffffff !important;
}
.console-sub-tabs :deep(.el-table__body tr:hover > td.el-table__cell) {
  background-color: #2563eb !important;
  color: #ffffff !important;
}

/* Tab label styling for custom SVG labels */
.tab-label-custom {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.tab-svg-icon {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.json-pre {
  margin: 0;
  font-family: monospace;
  font-size: var(--fs-xs);
  color: #38bdf8;
  max-height: 240px;
  overflow-y: auto;
  padding: 8px;
  background: #0f172a;
  border-radius: 6px;
  line-height: 1.4;
}

/* Code Snippets tabs */
.code-snippets-tabs {
  margin-top: 14px;
}
.code-box-wrapper {
  background: #0f172a;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
}
.code-box-header {
  padding: 10px 16px;
  background: #1e293b;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #334155;
}
.code-box-header span {
  font-size: var(--fs-xs);
  font-weight: 700;
  color: #cbd5e0;
}
.code-pre {
  margin: 0;
  padding: 16px;
  max-height: 380px;
  overflow-y: auto;
  font-family: monospace;
  font-size: var(--fs-sm);
  color: #38bdf8;
  line-height: 1.45;
}

.dialog-footer {
  padding: 14px 20px;
  border-top: 1px solid #e4e7ed;
  display: flex;
  justify-content: flex-end;
}
</style>
