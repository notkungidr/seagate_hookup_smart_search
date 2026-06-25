<template>
  <div class="pivot-app">

    <!-- ══ HEADER ══════════════════════════════════════════════════════════ -->
    <header class="app-header">
      <div class="header-inner">
        <div class="header-brand">
          <span class="header-icon">🔗</span>
          <div>
            <h1>Smart Pivot Search</h1>
            <p>Seagate Hookup Production Traceability</p>
          </div>
        </div>
        <div class="header-stats">
          <!-- Dark Mode Toggle Button (Idea 3.4) -->
          <el-button
            id="btn-dark-mode-toggle"
            circle
            size="small"
            class="theme-toggle-btn"
            style="margin-right: 12px; font-size: 14px; border: none; background: rgba(255, 255, 255, 0.15); color: #ffffff; cursor: pointer; transition: all 0.2s;"
            @click="toggleTheme"
            :title="isDark ? 'สลับเป็น Light Mode' : 'สลับเป็น Dark Mode'"
          >
            <span v-if="isDark">☀️</span>
            <span v-else>🌙</span>
          </el-button>

          <!-- ⚙️ Premium Dropdown Menu for all Settings and Config managers -->
          <el-dropdown trigger="click" @command="handleConfigCommand" style="margin-right: 8px;">
            <el-button id="btn-header-config-dropdown" type="primary" size="small" class="header-config-btn" style="font-weight: 600;">
              ⚙️ ระบบจัดการ & การตั้งค่า <el-icon style="margin-left: 4px;"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="catalog">
                  🚀 สารบัญฟีเจอร์ระบบ (Feature Catalog)
                </el-dropdown-item>
                <el-dropdown-item command="api">
                  🔌 จัดการ API Endpoints (API Manager)
                </el-dropdown-item>
                <el-dropdown-item v-if="adminUser?.permission === 'admin'" command="registry">
                  🗂️ จัดการ Chains & Tables (Registry Manager)
                </el-dropdown-item>
                <el-dropdown-item divided command="philosophy">
                  💡 ทำไมต้อง Drill-Down? (Philosophy)
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>

          <!-- Admin Status Indicator Pill -->
          <div v-if="adminUser" class="admin-pill-indicator" style="margin-right: 8px;">
            <span class="user-avatar">👤</span>
            <span class="admin-name">{{ adminUser.name }}</span>
            <el-button type="danger" size="small" link class="logout-link-btn" @click="handleAdminLogout">
              [🚪 Logout]
            </el-button>
          </div>
          <div v-else id="btn-admin-access" class="guest-pill-indicator" @click="adminLoginVisible = true" style="margin-right: 8px;">
            <span class="lock-ico">🔒</span>
            <span>Admin Access</span>
          </div>

          <!-- Active Steps tag (shows only when chain active) -->
          <el-tag v-if="chainSteps.length" type="info" effect="dark" size="small" style="margin-right: 8px; font-weight: 600;">
            {{ chainSteps.length }} Step{{ chainSteps.length > 1 ? 's' : '' }} in Chain
          </el-tag>

          <!-- Chain Actions Button Group -->
          <el-button-group v-if="chainSteps.length">
            <el-button
              size="small"
              type="success"
              :loading="loading"
              :disabled="loading"
              @click="exportAll"
            >
              📥 Export All
            </el-button>
            <el-button
              size="small"
              @click="resetAll"
              type="danger"
              plain
              :disabled="loading"
            >
              Reset All
            </el-button>
          </el-button-group>
        </div>
      </div>
    </header>

    <div class="app-body">

      <!-- ══ PANEL 1: SEARCH CONTROLS ════════════════════════════════════ -->
      <el-card class="search-panel" shadow="always">
        <template #header>
          <div class="panel-header">
            <span>🔍 Search</span>
          </div>
        </template>

        <el-form :model="searchForm" label-position="top" size="default">
          <!-- ── Saved Query Templates (Automated Chained Pivot) ──────── -->
          <QueryTemplatesPanel
            ref="templatesPanelRef"
            :api-base="API_BASE"
            :tables-meta="tablesMeta"
            :chain-steps="chainSteps"
            :search-form="searchForm"
            :next-uid="nextUid"
            :visible-combined-cols="visibleCombinedCols"
            @update:chain-steps="onTemplateChainUpdate"
            @chain-finished="onTemplateChainFinished"
            @open-save-api-dialog="openSaveApiDialog"
            style="margin-bottom: 12px"
          />

          <!-- ── Quick Paste Box (Task 1.3) ── -->
          <div 
            class="quick-paste-box" 
            :class="{ 'is-dragging': isDraggingFile }"
            style="margin-bottom: 16px; position: relative;"
            @dragover.prevent="handleDragOver"
            @dragenter.prevent="handleDragEnter"
            @dragleave.prevent="handleDragLeave"
            @drop.prevent="handleFileDrop"
          >
            <!-- Overlay when dragging file -->
            <div v-if="isDraggingFile" class="qp-drag-overlay">
              <div class="qp-drag-message">
                <span class="qp-drag-icon">📥</span>
                <strong>วางไฟล์ตรงนี้เพื่ออัปโหลด (CSV, TXT)</strong>
                <span class="qp-drag-sub">ระบบจะล้างหัวคอลัมน์และคัดกรองเฉพาะคีย์แรกให้อัตโนมัติ</span>
              </div>
            </div>

            <div class="qp-header">
              <span class="qp-title">⚡ Quick Paste & Search</span>
              <div style="display: flex; gap: 8px; align-items: center;">
                <el-button id="btn-quick-paste-upload" type="primary" link size="small" @click="triggerFileInput" style="font-weight: 600; font-size: 11px;">
                  📂 นำเข้าไฟล์
                </el-button>
                <el-button id="btn-quick-paste-config" type="primary" link size="small" @click="quickPasteRulesDialogVisible = true" style="font-weight: 600; font-size: 11px;">
                  ⚙️ ตั้งค่า Rules
                </el-button>
              </div>
              <input 
                type="file" 
                ref="fileInputRef" 
                style="display: none;" 
                accept=".csv,.txt,.log" 
                @change="handleFileInputChange"
              />
            </div>
            <div class="qp-body">
              <div v-if="quickPasteBulkArray.length > 0" class="qp-file-loaded-banner">
                <div class="qp-file-info">
                  <span class="qp-file-icon">📄</span>
                  <div class="qp-file-meta">
                    <span class="qp-file-name" :title="quickPasteFilename">{{ quickPasteFilename }}</span>
                    <span class="qp-file-count">โหลดสำเร็จ: {{ quickPasteBulkArray.length.toLocaleString() }} รายการ</span>
                  </div>
                </div>
                <el-button type="danger" size="small" circle plain @click="clearImportedFile" style="padding: 4px;">
                  <el-icon><Close /></el-icon>
                </el-button>
              </div>
              <el-input
                v-else
                id="input-quick-paste"
                v-model="quickPasteValue"
                placeholder="วาง SN / DCM / ACA แล้วกด Enter หรือลากไฟล์ CSV/TXT มาวางที่นี่..."
                clearable
                type="textarea"
                :rows="2"
                style="width: 100%; font-family: monospace; font-size: 11px;"
                @keyup.enter.ctrl.exact="executeQuickPaste"
                @keyup.enter.meta.exact="executeQuickPaste"
              />
              <div class="qp-match-info" v-if="quickPasteMatches.length > 0">
                <span class="qp-status matched">
                  🟢 Matched: <strong>{{ activeQuickPasteMatch.rule.name }}</strong> ({{ activeQuickPasteMatch.isMulti ? 'หลายค่า' : 'ค่าเดียว' }})
                </span>
                
                <!-- Multiple match selection -->
                <div v-if="quickPasteMatches.length > 1" style="margin-top: 8px;">
                  <div style="font-size: 11px; font-weight: bold; color: #b88230; margin-bottom: 6px; display: flex; align-items: center; gap: 4px;">
                    📍 พบเป้าหมายมากกว่า 1 จุด กรุณาเลือกเส้นทาง (Routing):
                  </div>
                  <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px;">
                    <div
                      v-for="(match, mIdx) in quickPasteMatches"
                      :key="mIdx"
                      class="qp-route-option"
                      :class="{ 'is-active': selectedQuickPasteMatchIdx === mIdx }"
                      @click="selectedQuickPasteMatchIdx = mIdx"
                      :data-testid="'qp-route-option-' + mIdx"
                    >
                      <div class="qp-route-radio">
                        <span class="qp-radio-dot"></span>
                      </div>
                      <div class="qp-route-info">
                        <strong style="color: #303133;">{{ match.rule.name }}</strong>
                        <span class="qp-route-path">{{ match.tableLabel }} ➔ {{ match.columnLabel }}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div v-else class="qp-routing-path" style="font-size: 11px; margin-top: 6px; margin-bottom: 4px; color: #606266; background: rgba(0,0,0,0.02); padding: 4px 8px; border-radius: 4px;">
                  📍 Routing: <strong>{{ activeQuickPasteMatch.tableLabel }}</strong> ➔ <strong>{{ activeQuickPasteMatch.columnLabel }}</strong>
                </div>

                <el-button id="btn-quick-paste-search" type="success" size="small" style="margin-top: 6px; width: 100%; font-weight: bold;" @click="executeQuickPaste">
                  🔍 ค้นหาทันที (Ctrl + Enter)
                </el-button>
              </div>
              <div class="qp-match-info" v-else-if="quickPasteValue.trim() || quickPasteBulkArray.length > 0">
                <span class="qp-status no-match" style="display: block; margin-bottom: 6px;">
                  🟡 ไม่พบ Pattern ที่ตรงกัน กรุณาเลือกตารางและคอลัมน์เริ่มต้นที่ด้านล่างเพื่อสืบค้น
                </span>
                <div v-if="searchForm.table && searchForm.conditions[0]?.column" style="margin-top: 6px;">
                  <el-button type="warning" size="small" style="width: 100%; font-weight: bold;" @click="executeQuickPaste">
                    🔍 ค้นหาด้วยตาราง/คอลัมน์ที่เลือกด้านล่าง ({{ getSelectedTableAndColumnLabel() }})
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <el-form-item label="ตารางหลัก (Table)">
            <el-select
              id="select-master-table"
              v-model="searchForm.table"
              placeholder="เลือกตารางที่ต้องการค้นหา"
              filterable
              @change="onTableChange"
              style="width:100%"
            >
              <el-option-group
                v-for="group in groupedTables"
                :key="group.key"
                :label="group.label"
              >
                <el-option
                  v-for="t in group.tables"
                  :key="t.key"
                  :label="t.label"
                  :value="t.key"
                />
              </el-option-group>
            </el-select>
          </el-form-item>

          <!-- เงื่อนไขการค้นหาแบบหลายฟิลด์ -->
          <div v-if="searchForm.table" class="conditions-container">
            <div class="conditions-title-row">
              <span class="conditions-title">🎯 เงื่อนไขการค้นหา (AND)</span>
            </div>

            <div
              v-for="(cond, idx) in searchForm.conditions"
              :key="idx"
              class="condition-row-card"
            >
              <div class="condition-row-header">
                <span class="condition-row-num">เงื่อนไขที่ #{{ idx + 1 }}</span>
                <el-button
                  v-if="searchForm.conditions.length > 1"
                  type="danger"
                  link
                  size="small"
                  @click="removeCondition(idx)"
                  class="remove-cond-btn"
                >
                  ❌ ลบออก
                </el-button>
              </div>

              <!-- Column Selector -->
              <div class="condition-field">
                <label class="field-label">คอลัมน์ (Column)</label>
                <el-select
                  v-model="cond.column"
                  placeholder="เลือก Column"
                  filterable
                  style="width:100%"
                  :data-testid="'select-cond-column-' + idx"
                >
                  <el-option v-for="col in searchableColumns" :key="col.key" :label="col.label" :value="col.key">
                    <span>{{ col.label }}</span>
                    <el-tag v-if="col.linksTo?.length" size="small" type="success" style="margin-left:8px">
                      Links ×{{ col.linksTo.length }}
                    </el-tag>
                  </el-option>
                </el-select>
              </div>

              <!-- Operator Selector -->
              <div class="condition-field">
                <label class="field-label">รูปแบบการค้นหา (Operator)</label>
                <el-select
                  v-model="cond.operator"
                  style="width:100%"
                  @change="onCondOperatorChange(cond)"
                  :data-testid="'select-cond-operator-' + idx"
                >
                  <el-option value="like"    label="🔍 LIKE (%...%)" />
                  <el-option value="eq"      label="🎯 Exact (=)" />
                  <el-option value="gte"     label="📈 มากกว่าหรือเท่ากับ (>=)" />
                  <el-option value="lte"     label="📉 น้อยกว่าหรือเท่ากับ (<=)" />
                  <el-option value="between" label="↔️ ระหว่าง (Between)" />
                  <el-option value="in"      label="📋 IN (หลายค่า)" />
                </el-select>
              </div>

              <!-- Value Input (Dynamic based on Date and Operator) -->
              <div class="condition-field">
                <label class="field-label">ค่าที่ค้นหา (Value)</label>

                <!-- Date Range Picker (Between for Date Columns) -->
                <el-date-picker
                  v-if="cond.operator === 'between' && isDateColumn(cond.column)"
                  v-model="cond.dateRange"
                  type="daterange"
                  range-separator="ถึง"
                  start-placeholder="วันที่เริ่มต้น"
                  end-placeholder="วันที่สิ้นสุด"
                  value-format="YYYY-MM-DD"
                  style="width:100%"
                />
                <!-- Quick Date Presets for Date Range -->
                <div v-if="cond.operator === 'between' && isDateColumn(cond.column)" class="date-preset-bar">
                  <span class="preset-btn" @click="applyDatePreset(cond, 'today')">วันนี้</span>
                  <span class="preset-btn" @click="applyDatePreset(cond, 'yesterday')">เมื่อวาน</span>
                  <span class="preset-btn" @click="applyDatePreset(cond, 'last7')">7 วัน</span>
                  <span class="preset-btn" @click="applyDatePreset(cond, 'last30')">30 วัน</span>
                  <span class="preset-btn" @click="applyDatePreset(cond, 'thisMonth')">เดือนนี้</span>
                </div>

                <!-- Text Range Inputs (Between for non-Date Columns) -->
                <div v-else-if="cond.operator === 'between'" class="range-inputs-block">
                  <el-input
                    v-model="cond.value"
                    placeholder="จากค่า..."
                    clearable
                    style="width: 46%"
                  />
                  <span class="range-separator">~</span>
                  <el-input
                    v-model="cond.value2"
                    placeholder="ถึงค่า..."
                    clearable
                    style="width: 46%"
                  />
                </div>

                <!-- Single Date Picker (LIKE / EQ / GTE / LTE for Date Columns) -->
                <el-date-picker
                  v-else-if="cond.operator !== 'in' && isDateColumn(cond.column)"
                  v-model="cond.value"
                  type="date"
                  placeholder="เลือกวันที่"
                  value-format="YYYY-MM-DD"
                  style="width:100%"
                />
                <!-- Quick Date Presets for Single Date -->
                <div v-if="cond.operator !== 'in' && isDateColumn(cond.column)" class="date-preset-bar">
                  <span class="preset-btn" @click="applyDatePreset(cond, 'today')">วันนี้</span>
                  <span class="preset-btn" @click="applyDatePreset(cond, 'yesterday')">เมื่อวาน</span>
                  <span class="preset-btn" @click="applyDatePreset(cond, 'last7')">7 วัน</span>
                  <span class="preset-btn" @click="applyDatePreset(cond, 'last30')">30 วัน</span>
                  <span class="preset-btn" @click="applyDatePreset(cond, 'thisMonth')">เดือนนี้</span>
                </div>

                <!-- Regular Input (LIKE / EQ / GTE / LTE for non-Date Columns) -->
                <el-input
                  v-else-if="cond.operator !== 'in'"
                  v-model="cond.value"
                  placeholder="กรอกค่า..."
                  clearable
                  @keyup.enter="doSearch"
                  style="width:100%"
                  :data-testid="'input-cond-value-' + idx"
                />

                <!-- Multi Value Textarea (IN) -->
                <div v-else class="in-input-block">
                  <div v-if="cond.values && cond.values.length > 0" class="in-file-loaded-alert">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span class="file-icon" style="font-size: 18px;">📄</span>
                      <div class="file-info" style="display: flex; flex-direction: column;">
                        <strong style="color: #67c23a; font-size: 11px; word-break: break-all;">{{ cond.filename || 'ข้อมูลอัปโหลดสำเร็จ' }}</strong>
                        <span style="font-size: 10px; color: #909399;">{{ cond.values.length.toLocaleString() }} รายการ (พร้อมค้นหา)</span>
                      </div>
                    </div>
                    <el-button type="danger" size="small" circle plain @click="cond.values = []; cond.multiValue = ''; cond.filename = '';" style="padding: 4px; margin-left: auto;">
                      <el-icon><Close /></el-icon>
                    </el-button>
                  </div>
                  <template v-else>
                    <el-input
                      v-model="cond.multiValue"
                      type="textarea"
                      :rows="4"
                      placeholder="วางค่าหลายค่า คั่นด้วย Enter หรือ ,"
                      style="width:100%;font-size:12px;font-family:monospace"
                    />
                    <div class="in-hint">
                      <el-tag size="small" type="info" effect="plain">
                        {{ getInValueCount(cond.multiValue) }} ค่า
                      </el-tag>
                      <span style="font-size:11px;color:#909399;margin-left:6px">Enter หรือ , คั่นค่า</span>
                    </div>
                  </template>
                </div>
              </div>
            </div>

            <!-- Add Field Button -->
            <el-button
              id="btn-add-condition"
              type="primary"
              plain
              size="small"
              @click="addCondition"
              style="width:100%;margin-top:4px;margin-bottom:16px;border-style:dashed"
            >
              ➕ เพิ่มฟิลด์ค้นหา
            </el-button>
          </div>

          <el-button
            id="btn-main-search"
            type="primary"
            :loading="loading"
            @click="doSearch"
            style="width:100%"
            size="large"
            :disabled="!searchForm.table || loading"
          >
            <el-icon><Search /></el-icon>&nbsp;{{ loading ? 'กำลังค้นหา...' : 'Search' }}
          </el-button>
        </el-form>

        <!-- ══ RECENT SEARCHES (Search History) ══════════════════════════════ -->
        <div class="search-history-panel" style="margin-top: 16px;">
          <div id="recent-searches-header" class="history-panel-header" @click="isHistoryOpen = !isHistoryOpen">
            <span class="history-title">🕒 ประวัติค้นหาล่าสุด (Recent Searches)</span>
            <el-icon class="history-collapse-arrow" :class="{ 'is-active': isHistoryOpen }">
              <ArrowDown />
            </el-icon>
          </div>
          <el-collapse-transition>
            <div v-show="isHistoryOpen" class="history-panel-body">
              <div v-if="searchHistory.length === 0" class="history-empty">
                ไม่มีประวัติการค้นหาล่าสุด
              </div>
              <div v-else class="history-list">
                <div v-for="(entry, index) in searchHistory" :key="index" class="history-item">
                  <div class="history-item-meta">
                    <span class="history-item-time">{{ relativeTime(entry.timestamp) }}</span>
                    <span class="history-item-table">{{ entry.tableLabelSnapshot }}</span>
                  </div>
                  <div class="history-item-conds">
                    <div v-for="(cond, cIdx) in entry.conditions" :key="cIdx" class="history-cond-line">
                      <span class="cond-col">{{ cond.column }}</span>
                      <span class="cond-op">{{ cond.operator }}</span>
                      <span class="cond-val" v-if="cond.operator === 'in'">
                        ({{ parseMultiValue(cond.multiValue).length }} ค่า)
                      </span>
                      <span class="cond-val" v-else-if="cond.operator === 'between' && cond.dateRange && cond.dateRange.length === 2">
                        [{{ cond.dateRange[0] }} ~ {{ cond.dateRange[1] }}]
                      </span>
                      <span class="cond-val" v-else-if="cond.operator === 'between'">
                        [{{ cond.value }} ~ {{ cond.value2 }}]
                      </span>
                      <span class="cond-val" v-else>
                        "{{ cond.value }}"
                      </span>
                    </div>
                  </div>
                  <div class="history-item-actions">
                    <el-button type="primary" size="small" plain style="width:100%" @click="restoreSearch(entry)" :data-testid="'btn-history-replay-' + index">
                      ▶ ค้นซ้ำ
                    </el-button>
                  </div>
                </div>
                <div class="history-clear-wrapper">
                  <el-button id="btn-clear-search-history" type="danger" size="small" plain style="width: 100%; margin-top: 8px;" @click="clearSearchHistory">
                    🗑️ ล้างประวัติทั้งหมด
                  </el-button>
                </div>
              </div>
            </div>
          </el-collapse-transition>
        </div>

        <!-- ══ DRILL-DOWN PHILOSOPHY (Collapsible Sidebar) ═══════════════════ -->
        <div class="philosophy-sidebar-card" style="margin-top: 16px;">
          <div class="philosophy-sidebar-header" @click="isSidebarPhilosophyOpen = !isSidebarPhilosophyOpen">
            <span class="ph-header-title">💡 ปรัชญา Drill-Down Search</span>
            <el-icon class="ph-collapse-arrow" :class="{ 'is-active': isSidebarPhilosophyOpen }">
              <ArrowDown />
            </el-icon>
          </div>
          <el-collapse-transition>
            <div v-show="isSidebarPhilosophyOpen" class="philosophy-sidebar-body">
              <p>ระบบเราใช้กลไกการสืบค้นแบบ<strong>ต่อยอดขั้นบันได (Drill-Down)</strong> ทีละขั้น เพื่อประสิทธิภาพความเร็วสูงสุดและยืดหยุ่นข้ามตารางได้อิสระ</p>
              <div class="ph-mini-comparison">
                <div class="ph-mini-badge bad">❌ Single-Shot: ค้าง / ล่มง่าย</div>
                <div class="ph-mini-badge good">✅ Drill-Down: เสี้ยววินาที / เจาะจงจุด</div>
              </div>
              <el-button 
                type="warning" 
                link 
                size="small" 
                @click="philosophyDialogVisible = true" 
                class="ph-learn-more-btn"
                style="margin-top: 6px; font-weight: 600; padding: 0;"
              >
                ทำไมสืบค้นแบบนี้ดีกว่า? เรียนรู้เพิ่ม ➔
              </el-button>
            </div>
          </el-collapse-transition>
        </div>
      </el-card>

      <!-- ══ RIGHT PANEL (Combined View + Pipeline Grid) ═════════════════════ -->
      <div class="right-panel" v-if="chainSteps.length">
        
        <!-- ══ GLOBAL NOTICE BAR (Top of Right Panel) ═══════════════════════ -->
        <div class="global-notice-bar">
          <div class="notice-bar-header" @click="showMorePrecautions = !showMorePrecautions">
            <div class="notice-bar-summary">
              <span class="notice-icon">⚠️</span>
              <span class="notice-title">ข้อควรระวัง & ข้อจำกัดระบบ:</span>
              <span class="notice-inline-text">
                Timeout 2 นาที | จำกัด Export 50,000 แถวบน Combined Sheet | Local Filter มีผลกับการ Pivot ทันที
              </span>
            </div>
            <el-button type="warning" link size="small" class="notice-toggle-btn">
              {{ showMorePrecautions ? '🔼 ซ่อนรายละเอียด' : '🔽 ดูรายละเอียดเพิ่มเติม' }}
            </el-button>
          </div>
          <el-collapse-transition>
            <div v-show="showMorePrecautions" class="notice-bar-details">
              <ul class="precaution-list">
                <li>
                  <strong>การตัดการเชื่อมต่ออัตโนมัติ (Query Timeout):</strong>
                  หากการสืบค้นข้อมูลในขั้นตอนใดๆ ใช้เวลา<strong>เกิน 2 นาที</strong> ระบบจะทำการตัดการเชื่อมต่อทันทีเพื่อความปลอดภัยของเซิร์ฟเวอร์ กรุณาเปลี่ยน/ปรับเงื่อนไข (Condition) ในการค้นหาให้แคบลง
                </li>
                <li>
                  <strong>ข้อมูลขนาดใหญ่ (High Volume Excel):</strong>
                  หากผลรวมแถวข้อมูลทั้งหมดที่เลือกดาวน์โหลด<strong>เกิน 50,000 แถว</strong> แนะนำให้เลือกดาวน์โหลดเฉพาะ <em>"Combined Sheet"</em> เพื่อป้องกันเว็บเบราว์เซอร์ค้าง
                </li>
                <li>
                  <strong>ตัวกรอง (Filter in Box) มีผลกับการ Pivot:</strong>
                  การกรองข้อมูลในกล่องข้อความจะมีผลในการ Pivot ทันที โดยระบบจะส่งเฉพาะแถวข้อมูลที่ผ่านการกรองแล้วไปสืบค้นต่อในขั้นตอนถัดไป
                </li>
              </ul>
            </div>
          </el-collapse-transition>
        </div>

        <!-- ══ HORIZONTAL PROGRESS STEPPER (Visual Chain Flow - Tree Layout) ══════════════ -->
        <div class="horizontal-stepper">
          <div class="stepper-title-row">
            <span class="stepper-title">⛓️ เส้นทางการสืบค้นแบบโครงสร้างต้นไม้ (Visual Branching Tree Flow)</span>
            <span class="stepper-hint">💡 คลิกการ์ดสลับดูผลลัพธ์ | การ์ดสีม่วง ⌥ คือกิ่งที่แตกแขนงออก (Branch)</span>
          </div>
          
          <div class="stepper-flow-tree">
            <div 
              v-for="(column, colIdx) in groupedStepperColumns" 
              :key="'stepper-col-' + column.level" 
              class="stepper-column"
            >
              <!-- Sibling nodes stacked vertically -->
              <div class="stepper-column-nodes">
                <el-tooltip
                  v-for="step in column.steps"
                  :key="'step-node-' + step._uid"
                  placement="top"
                  effect="dark"
                  :disabled="step.originalIdx === 0"
                  raw-content
                >
                  <!-- Tooltip Rich Template showing the full relational connection fields -->
                  <template #content>
                    <div class="stepper-tooltip-content">
                      <div class="tooltip-title">🔗 รายละเอียดการเชื่อมโยง (Chain Relation)</div>
                      <div class="tooltip-row">
                        <span class="tooltip-label">จากกระบวนการ:</span>
                        <span class="tooltip-val">Step {{ step.parentIdx + 1 }} ({{ getStepTableName(step.parentIdx) }})</span>
                      </div>
                      <div class="tooltip-row">
                        <span class="tooltip-label">ไปยังกระบวนการ:</span>
                        <span class="tooltip-val">Step {{ step.originalIdx + 1 }} ({{ step.tableLabel }})</span>
                      </div>
                      <div class="tooltip-divider"></div>
                      <div class="tooltip-row highlight-row">
                        <span class="tooltip-label">🔑 คีย์ที่ใช้เชื่อม (Join Key):</span>
                        <span class="tooltip-val val-key">{{ getStepJoinInfo(step) }}</span>
                      </div>
                    </div>
                  </template>

                  <!-- Stepper Node Card -->
                  <div 
                    class="stepper-node"
                    :class="{
                      'stepper-node--active': step.originalIdx === activeStepIndex,
                      'stepper-node--empty': step.total === 0,
                      'stepper-node--branch': step.parentIdx !== null && step.parentIdx !== step.originalIdx - 1
                    }"
                    :style="getStepperNodeStyle(step.originalIdx, step)"
                    @click="setActiveStep(step.originalIdx)"
                  >
                    <!-- Badge for status representation -->
                    <div class="node-badge">
                      {{ step.total === 0 ? '🔴' : '🟢' }}
                    </div>
                    
                    <div class="node-content">
                      <div class="node-header">
                        <!-- If it is a branch step, show a beautiful violet branch tag -->
                        <span class="node-num" v-if="step.parentIdx !== null && step.parentIdx !== step.originalIdx - 1" :style="{ color: step.total > 0 ? STEP_THEMES[step.originalIdx % STEP_THEMES.length].badgeText : '' }">
                          Step {{ step.originalIdx + 1 }}
                          <el-tag size="small" effect="plain" class="node-branch-tag" :style="getBranchTagStyle(step.parentIdx)">
                            ⌥ S{{ step.parentIdx + 1 }}
                          </el-tag>
                        </span>
                        <span class="node-num" v-else :style="{ color: step.total > 0 ? STEP_THEMES[step.originalIdx % STEP_THEMES.length].badgeText : '' }">Step {{ step.originalIdx + 1 }}</span>
                        <span class="node-label" :title="step.tableLabel">{{ step.tableLabel }}</span>
                      </div>
                      <div class="node-details">
                        <span v-if="step.total === 0" class="node-status-text error">Not Found</span>
                        <span v-else class="node-status-text success" :class="{ 'rows--filtered': getFilteredRows(step.originalIdx).length !== step.total }">
                          {{ getFilteredRows(step.originalIdx).length.toLocaleString() }} <span style="opacity: 0.6">/ {{ step.total.toLocaleString() }} rows</span>
                        </span>
                        
                        <!-- Join Key Info indicating what column connects to the parent step -->
                        <div v-if="step.originalIdx > 0" class="node-join-key-info">
                          <span class="key-icon">🔑</span> {{ getStepJoinInfo(step) }}
                        </div>
                      </div>
                    </div>

                    <!-- Remove step button -->
                    <el-button
                      v-if="step.originalIdx > 0"
                      type="danger"
                      link
                      class="stepper-node-remove-btn"
                      @click.stop="removeChainStep(step.originalIdx)"
                    >
                      <el-icon><Close /></el-icon>
                    </el-button>
                  </div>
                </el-tooltip>
              </div>
              
              <!-- Connection arrow to next column, only if this isn't the last column -->
              <div v-if="colIdx < groupedStepperColumns.length - 1" class="stepper-column-connector">
                <span class="connector-arrow">➔</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Combined View (cols-12) -->
        <div class="pipeline-card combined-card" v-if="chainSteps.length >= 1 && combinedData.length">
          <div class="card-header" style="background: linear-gradient(135deg, hsl(218, 75%, 22%) 0%, hsl(225, 70%, 15%) 100%);">
            <div class="card-header-top" style="margin-bottom:0; display: flex; align-items: center; width: 100%;">
              <div class="card-step-badge" style="background: rgba(255,255,255,0.3); border:none">
                📊
              </div>
              <div class="card-title-block">
                <span class="card-table-name">
                  All Chains Combined (Auto-Joined)
                </span>
                <span class="card-row-count">{{ combinedData.length.toLocaleString() }} rows</span>
              </div>

              <!-- Axis Selector: Swapping the Left-Join pivot main axis dynamically inside combine view -->
              <div class="combine-axis-selector" style="margin-left: auto; display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 0.72rem; font-weight: bold; color: rgba(255,255,255,0.7); white-space: nowrap;">
                  🎯 แกนหลัก Left-Join (Master Axis):
                </span>
                <el-select
                  v-model="manualCombineMasterIdx"
                  placeholder="เลือกตารางหลัก..."
                  size="small"
                  style="width: 280px;"
                  class="custom-axis-select"
                >
                  <el-option :value="-1" label="⚡ Auto (เลือกตารางที่แถวมากสุด)" />
                  <el-option
                    v-for="(step, idx) in chainSteps.filter(s => !s.isCombined)"
                    :key="'combine-master-opt-' + idx"
                    :value="idx"
                    :label="'Step ' + (idx + 1) + ': ' + step.tableLabel + ' (' + getFilteredRows(idx).length.toLocaleString() + ' แถว)'"
                  />
                </el-select>
              </div>
            </div>
          </div>
          <div class="card-body">
            <div style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center; width: 100%;">
              <el-input
                v-model="combinedFilterText"
                placeholder="🔍 Search across all combined columns..."
                clearable
                size="small"
                style="flex: 1;"
              />
              
              <!-- ⚙️ Column Selector Popover -->
              <el-popover placement="bottom-end" title="ตั้งค่าคอลัมน์ (Column Selector)" :width="360" trigger="click">
                <template #reference>
                  <el-button size="small" type="primary" plain style="font-weight: 600; border-radius: 4px; height: 32px;">
                    ⚙️ เลือกคอลัมน์ ({{ visibleCombinedCols.length }}/{{ combinedCols.length }})
                  </el-button>
                </template>
                <div class="column-selector-popover-content">
                  <!-- Search input inside popover -->
                  <el-input
                    v-model="colSelectorQuery"
                    placeholder="🔍 ค้นหาชื่อคอลัมน์..."
                    clearable
                    size="small"
                    style="margin-bottom: 8px;"
                  />

                  <!-- Quick Step filter tags -->
                  <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 8px; align-items: center; border-bottom: 1px solid #eee; padding-bottom: 6px;">
                    <span style="font-size: 11px; color: #909399; margin-right: 4px;">กรองตาม Step:</span>
                    <el-tag
                      size="small"
                      :type="colSelectorStepFilter === null ? 'primary' : 'info'"
                      :effect="colSelectorStepFilter === null ? 'dark' : 'plain'"
                      style="cursor: pointer; border-radius: 4px; border: none;"
                      @click="colSelectorStepFilter = null"
                    >
                      ทั้งหมด
                    </el-tag>
                    <el-tag
                      v-for="(step, idx) in chainSteps"
                      :key="'filter-tag-' + idx"
                      size="small"
                      :effect="colSelectorStepFilter === idx ? 'dark' : 'plain'"
                      :style="getStepBadgeStyle(idx)"
                      style="cursor: pointer; border-radius: 4px; border: none;"
                      @click="colSelectorStepFilter = idx"
                    >
                      S{{ idx + 1 }}
                    </el-tag>
                  </div>

                  <!-- Quick Select / Deselect actions -->
                  <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #ebeef5;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                      <div>
                        <el-button size="small" link type="primary" style="font-weight: 600;" @click="visibleCombinedCols = [...combinedCols]">เลือกทั้งหมดทุกตาราง</el-button>
                        <el-button size="small" link type="danger" style="font-weight: 600;" @click="visibleCombinedCols = []">ล้างทั้งหมด</el-button>
                      </div>
                    </div>
                    
                    <!-- Dynamic Step Select/Deselect buttons -->
                    <div v-if="colSelectorStepFilter !== null" style="display: flex; justify-content: space-between; align-items: center; background: #f0f9eb; padding: 4px 8px; border-radius: 4px;">
                      <span style="font-size: 11px; color: #67c23a; font-weight: bold;">Step S{{ colSelectorStepFilter + 1 }} :</span>
                      <div>
                        <el-button size="small" link type="success" style="font-weight: 600;" @click="selectAllInCurrentStep">เลือกทั้งหมดใน Step นี้</el-button>
                        <el-button size="small" link type="warning" style="font-weight: 600;" @click="clearAllInCurrentStep">ล้างทั้งหมดใน Step นี้</el-button>
                      </div>
                    </div>

                    <!-- Filtered Select/Deselect buttons (only shown when typing a search query) -->
                    <div v-if="colSelectorQuery" style="display: flex; justify-content: space-between; align-items: center; background: #ecf5ff; padding: 4px 8px; border-radius: 4px;">
                      <span style="font-size: 11px; color: #409eff; font-weight: bold;">คำค้นหา :</span>
                      <div>
                        <el-button size="small" link type="primary" style="font-weight: 600;" @click="showAllFilteredCols">เลือกตามที่กรอง</el-button>
                        <el-button size="small" link type="warning" style="font-weight: 600;" @click="hideAllFilteredCols">ซ่อนตามที่กรอง</el-button>
                      </div>
                    </div>
                  </div>

                  <div style="max-height: 280px; overflow-y: auto;" class="col-selector-checkbox-list">
                    <el-checkbox-group v-model="visibleCombinedCols">
                      <div v-for="col in filteredColsForSelector" :key="'col-select-' + col" style="margin-bottom: 8px; display: flex; align-items: center;">
                        <el-checkbox :value="col" size="small">
                          <span v-if="getStepIdxForCol(col) !== undefined" 
                                class="col-step-mini-badge" 
                                :style="getStepBadgeStyle(getStepIdxForCol(col))"
                                style="transform: scale(0.85); display: inline-flex; margin-right: 4px; vertical-align: middle;">
                            S{{ getStepIdxForCol(col) + 1 }}
                          </span>
                          <span style="font-size: 11px; font-family: monospace; vertical-align: middle;">{{ col }}</span>
                        </el-checkbox>
                      </div>
                    </el-checkbox-group>
                  </div>
                </div>
              </el-popover>

              <!-- 💾 Save as API Endpoint Button -->
              <el-button
                v-if="chainSteps.length >= 1"
                size="small"
                type="success"
                @click="openSaveApiDialog"
                style="font-weight: 600; border-radius: 4px; height: 32px;"
              >
                💾 Save as API
              </el-button>

              <el-button
                v-if="hasActiveCombinedFilters"
                type="danger"
                plain
                size="small"
                :icon="Close"
                @click="clearAllCombinedFilters"
                style="font-weight: 600; border-radius: 4px; padding: 0 12px; height: 32px; display: inline-flex; align-items: center; gap: 4px;"
              >
                ล้างตัวกรองทั้งหมด (Clear Filters)
              </el-button>
            </div>

            <!-- 🔖 แถบ Active Filters (Badges / Chips) -->
            <div v-if="activeFilterChips.length" class="active-filters-chips-bar">
              <span class="active-filters-label">ตัวกรองที่ใช้งานอยู่ (Active Filters):</span>
              <div class="active-filters-list">
                <el-tag
                  v-for="chip in activeFilterChips"
                  :key="chip.column + '-' + chip.value"
                  size="small"
                  closable
                  @close="removeSingleFilter(chip.column, chip.value, chip.isGlobal)"
                  :style="getStepBadgeStyle(chip.stepIdx)"
                  class="filter-chip"
                >
                  <strong style="margin-right: 2px;">{{ chip.columnLabel }}:</strong> {{ chip.value }}
                </el-tag>
                <el-button
                  type="danger"
                  link
                  size="small"
                  @click="clearAllCombinedFilters"
                  style="font-size: 11px; font-weight: 600; padding: 0 4px;"
                >
                  ล้างตัวกรองทั้งหมด (Clear All)
                </el-button>
              </div>
            </div>
            <el-table
              id="combined-table"
              data-testid="combined-table"
              :data="paginatedCombinedData"
              stripe
              border
              size="small"
              height="350"
              highlight-current-row
              :header-cell-style="combinedHeaderCellStyle"
              @cell-click="handleCellClick"
              style="width:100%"
            >
              <el-table-column
                v-for="(col, colIdx) in visibleCombinedCols"
                :key="col"
                :prop="col"
                min-width="170"
                show-overflow-tooltip
                :fixed="colIdx === 0 ? 'left' : false"
              >
                <template #header>
                  <div class="col-filter-header">
                    <div class="col-header-title-row" style="display: flex; align-items: center; width: 100%; overflow: hidden; margin-bottom: 4px;">
                      <span v-if="getStepIdxForCol(col) !== undefined" 
                            class="col-step-mini-badge" 
                            :style="getStepBadgeStyle(getStepIdxForCol(col))">
                        S{{ getStepIdxForCol(col) + 1 }}
                      </span>
                      <span class="col-filter-label" :title="col" style="flex: 1; min-width: 0;">{{ col }}</span>
                    </div>
                    <!-- Conditional date picker or multiselect dropdown suggestions -->
                    <el-date-picker
                      v-if="isDateColumnName(col)"
                      v-model="combinedColFilters[col]"
                      type="daterange"
                      size="small"
                      start-placeholder="Start"
                      end-placeholder="End"
                      value-format="YYYY-MM-DD"
                      range-separator="-"
                      @click.stop
                      class="col-filter-date-picker"
                      style="width: 100%;"
                    />
                    <el-select
                      v-else
                      v-model="combinedColFilters[col]"
                      placeholder="กรอง..."
                      size="small"
                      clearable
                      filterable
                      multiple
                      collapse-tags
                      collapse-tags-tooltip
                      allow-create
                      default-first-option
                      @visible-change="(visible) => handleSelectVisible(col, visible)"
                      class="col-filter-select"
                      @click.stop
                      style="width: 100%;"
                    >
                      <el-option
                        v-for="val in colSuggestions[col] || []"
                        :key="val"
                        :label="val"
                        :value="val"
                      />
                    </el-select>
                  </div>
                </template>
              </el-table-column>
            </el-table>
            <div class="pagination-container" style="margin-top: 10px; display: flex; justify-content: flex-end;">
              <el-pagination
                v-model:current-page="combinedPage"
                v-model:page-size="combinedPageSize"
                :page-sizes="[50, 100, 200, 500]"
                layout="total, sizes, prev, pager, next"
                :total="filteredCombinedData.length"
                size="small"
              />
            </div>
          </div>
        </div>

        <!-- ══ PIPELINE GRID (3 per row) ════════════════════════════════════ -->
        <div class="pipeline-grid">
        <div
          v-for="(step, idx) in chainSteps"
          :key="step._uid"
          :id="'step-card-' + idx"
          :data-testid="'step-card-' + idx"
          class="pipeline-card"
          :class="{
            'pipeline-card--active': idx === activeStepIndex,
            'pipeline-card--empty': step.total === 0,
            'pipeline-card--chain-loading': step._chainLoading,
            'pipeline-card--chain-error': step._chainError
          }"
          :style="getCardStyle(idx, step)"
        >
          <!-- Chain Loading Overlay (Automated Template Run) -->
          <div v-if="step._chainLoading" class="chain-loading-overlay">
            <el-icon class="is-loading" :size="22"><Loading /></el-icon>
            <span>กำลังประมวลผล...</span>
          </div>
          <!-- Card Header -->
          <div class="card-header" @click="setActiveStep(idx)">
            <div class="card-header-top">
              <div class="card-step-badge" :style="step.total === 0 ? 'background: rgba(245, 108, 108, 0.2); border-color: rgba(245, 108, 108, 0.6); color: #f56c6c' : getCardStepBadgeStyle(idx)">{{ idx + 1 }}</div>
              <div class="card-title-block">
                <span class="card-table-name">
                  {{ step.tableLabel }}
                  <span v-if="step._pivotFromStepIdx !== undefined && step._pivotFromStepIdx !== idx - 1" style="font-size: 11px; font-weight: normal; opacity: 0.6; color: #79bbff;">
                    (from Step {{ step._pivotFromStepIdx + 1 }})
                  </span>
                </span>
                <span class="card-row-count">
                  <span v-if="step.total === 0" style="color: #ffd04b; font-weight: bold;">
                    ⚠️ Not Found (0 rows)
                  </span>
                  <span v-else-if="getFilteredRows(idx).length !== step.rows.length" class="filtered-label">
                    {{ getFilteredRows(idx).length.toLocaleString() }} / {{ step.total.toLocaleString() }} rows
                  </span>
                  <span v-else>{{ step.total.toLocaleString() }} rows</span>
                </span>
              </div>
              <el-tag
                :type="step.operator === 'pivot' ? 'warning' : 'primary'"
                size="small"
                effect="dark"
                style="margin-left:auto;flex-shrink:0"
              >{{ step.operator === 'pivot' ? 'PIVOT' : 'SEARCH' }}</el-tag>

              <!-- Remove step button inside card header -->
              <el-button
                v-if="idx > 0"
                type="danger"
                link
                class="pipeline-card-remove-btn"
                @click.stop="removeChainStep(idx)"
                style="margin-left: 4px; padding: 0"
              >
                <el-icon><Close /></el-icon>
              </el-button>
            </div>
            <div class="card-chip">
              <span class="chip-col">{{ step.columnLabel }}</span>
              <span class="chip-op">{{ step.operator === 'pivot' ? 'IN' : step.operator?.toUpperCase() }}</span>
              <span class="chip-val" :title="step.value">{{ step.value }}</span>
              <!-- Explicit Join Key indicator inside pipeline step card -->
              <span v-if="idx > 0" class="chip-join-key" :title="'เชื่อมด้วย: ' + getStepJoinInfo({ ...step, originalIdx: idx })">
                <span class="key-icon">🔑</span> {{ getStepJoinInfo({ ...step, originalIdx: idx }) }}
              </span>
            </div>
          </div>

          <!-- Card Body: Local Filter + Table -->
          <div class="card-body">
            <div style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center;">
              <el-input
                v-model="localFilters[idx]"
                placeholder="🔍 Filter in this box..."
                clearable
                size="small"
                style="flex: 1;"
                :disabled="step.total === 0"
              />
              
              <!-- ⚙️ Step Column Selector Popover -->
              <el-popover placement="bottom-end" title="เลือกคอลัมน์แสดงผล" :width="220" trigger="click" :disabled="step.total === 0">
                <template #reference>
                  <el-button size="small" type="primary" plain :disabled="step.total === 0" style="font-weight: 600; border-radius: 4px;">
                    ⚙️ คอลัมน์
                  </el-button>
                </template>
                <div class="step-column-selector-content">
                  <div style="display: flex; justify-content: space-between; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #eee;">
                    <el-button size="small" link type="primary" @click="showAllColumnsForStep(idx)">ทั้งหมด</el-button>
                    <el-button size="small" link type="danger" @click="hideAllColumnsForStep(idx)">ซ่อนหมด</el-button>
                  </div>
                  <!-- Checkbox list of all columns in this step -->
                  <div style="max-height: 220px; overflow-y: auto; padding-right: 4px;">
                    <div v-for="col in getAllColumnsForStep(step)" :key="'col-step-select-' + idx + '-' + col" style="margin-bottom: 4px; display: flex; align-items: center;">
                      <el-checkbox
                        :model-value="!step._hiddenColumns?.includes(col)"
                        @change="(val) => toggleColumnVisibilityForStep(idx, col, val)"
                        size="small"
                      >
                        <span style="font-size: 11px; font-family: monospace;">{{ col }}</span>
                      </el-checkbox>
                    </div>
                  </div>
                </div>
              </el-popover>
            </div>

            <el-table
              :data="getPaginatedRows(idx)"
              stripe
              border
              size="small"
              height="300"
              highlight-current-row
              @cell-click="handleCellClick"
              style="width:100%"
              :data-testid="'step-table-' + idx"
            >
              <el-table-column
                v-for="(col, cIdx) in getGridColumns(step)"
                :key="col"
                :prop="col"
                :label="col"
                min-width="130"
                show-overflow-tooltip
                :fixed="cIdx === 0 ? 'left' : false"
              />
            </el-table>
            <div class="pagination-container" style="margin-top: 10px; display: flex; justify-content: flex-end;" v-if="step.total > 0">
              <el-pagination
                v-model:current-page="currentPage[idx]"
                v-model:page-size="pageSize[idx]"
                :page-sizes="[50, 100, 200, 500]"
                layout="total, prev, pager, next"
                :total="getFilteredRows(idx).length"
                size="small"
              />
            </div>
          </div>

          <!-- Card Footer: Pivot Actions -->
          <div class="card-footer" v-if="step.availablePivots?.length">
            <div class="pivot-label">PIVOT TO →</div>
            <div class="pivot-buttons">
              <template v-for="(pivot, pivotIdx) in step.availablePivots" :key="pivot.fromColumnKey">
                <el-dropdown
                  v-if="pivot.linksTo?.length"
                  @command="(link) => onPivotSelect(idx, pivot, link)"
                  trigger="click"
                  size="small"
                >
                  <el-button size="small" type="success" plain :disabled="getFilteredRows(idx).length === 0" :data-testid="'btn-pivot-trigger-' + idx + '-' + pivotIdx">
                    {{ pivot.fromColumnLabel }} <el-icon style="margin-left:4px"><ArrowDown /></el-icon>
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item disabled style="font-weight:bold;color:#606266;font-size:11px">
                        ใช้คอลัมน์: {{ pivot.fromDbColumn }}
                      </el-dropdown-item>
                      <el-dropdown-item
                        v-for="(link, linkIdx) in pivot.linksTo"
                        :key="link.targetTable"
                        :command="link"
                        style="padding-left:20px"
                        :data-testid="'btn-pivot-link-' + idx + '-' + pivotIdx + '-' + linkIdx"
                      >{{ link.label }}</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </template>
            </div>
            <div v-if="localFilters[idx]" style="margin-top:4px">
              <el-tag size="small" type="warning" effect="plain">
                🔸 ใช้ {{ getFilteredRows(idx).length }} filtered rows เพื่อ Pivot
              </el-tag>
            </div>
          </div>
        </div>
        </div>
      </div>

      <!-- Empty State & Staircase Drill-Down Guide -->
      <div class="empty-state" v-else>
        <div class="staircase-guide-container">
          <div class="staircase-guide-header">
            <span class="guide-badge">🚀 แนะนำวิธีการใช้งาน</span>
            <h2>การสืบค้นข้อมูลเชิงลึกแบบขั้นบันได (Staircase Drill-Down Search)</h2>
            <p>ระบบสืบค้นอัจฉริยะที่จะช่วยให้ท่านสืบค้นประวัติชิ้นงาน เชื่อมโยงความสัมพันธ์ข้ามกระบวนการจากต้นน้ำสู่ปลายน้ำใน 4 ขั้นตอนง่ายๆ</p>
          </div>

          <div class="staircase-steps">
            <!-- Step 1 -->
            <div class="staircase-step-card">
              <div class="staircase-icon-wrapper" style="background: linear-gradient(135deg, #409eff, #337ecc)">
                <span class="step-badge">1</span>
                <span class="step-icon-symbol">🏁</span>
              </div>
              <h3>ค้นหาข้อมูลตั้งต้น<br><span class="highlight">(Master Chain)</span></h3>
              <p>เลือกตารางหลัก เลือกคอลัมน์ และกรอกค่าตั้งต้นที่มี (เช่น Serial No หรือ Lot) จากแผงควบคุมด้านซ้ายแล้วกด <strong>Search</strong> เพื่อสร้างบันไดขั้นแรก</p>
            </div>

            <!-- Arrow 1 -->
            <div class="staircase-arrow">➔</div>

            <!-- Step 2 -->
            <div class="staircase-step-card">
              <div class="staircase-icon-wrapper" style="background: linear-gradient(135deg, #e6a23c, #b88230)">
                <span class="step-badge">2</span>
                <span class="step-icon-symbol">🔍</span>
              </div>
              <h3>กรองข้อมูลเฉพาะส่วน<br><span class="highlight">(Local Filter)</span></h3>
              <p>หากผลลัพธ์ในกล่องมีมากเกินไป พิมพ์กรองข้อมูลในกล่อง <em>"Filter in this box"</em> เพื่อกรองเอาเฉพาะข้อมูลตัวแทนที่ต้องการใช้สืบค้นต่อ</p>
            </div>

            <!-- Arrow 2 -->
            <div class="staircase-arrow">➔</div>

            <!-- Step 3 -->
            <div class="staircase-step-card">
              <div class="staircase-icon-wrapper" style="background: linear-gradient(135deg, #67c23a, #529b2e)">
                <span class="step-badge">3</span>
                <span class="step-icon-symbol">⛓️</span>
              </div>
              <h3>เชื่อมต่อแบบขั้นบันได<br><span class="highlight">(Pivot to Next Chain)</span></h3>
              <p>คลิกปุ่มสีเขียว <strong>PIVOT TO →</strong> เพื่อก้าวลงบันไดขั้นย่อยถัดไป (Chain 1 → 2 → 3) ระบบจะนำเฉพาะข้อมูลที่กรองไว้ไปสืบค้นข้ามตารางให้ทันที</p>
            </div>

            <!-- Arrow 3 -->
            <div class="staircase-arrow">➔</div>

            <!-- Step 4 -->
            <div class="staircase-step-card">
              <div class="staircase-icon-wrapper" style="background: linear-gradient(135deg, #909399, #606266)">
                <span class="step-badge">4</span>
                <span class="step-icon-symbol">📊</span>
              </div>
              <h3>รวมข้อมูลแนวนอนอัตโนมัติ<br><span class="highlight">(Combined View)</span></h3>
              <p>เมื่อเชื่อมโยงตั้งแต่ 2 ขั้นขึ้นไป ระบบจะรวมข้อมูลทุกขั้นตอนมาต่อเป็นตารางเดียวให้โดยอัตโนมัติ พร้อมส่งออกไปยังไฟล์ Excel</p>
            </div>
          </div>

          <div class="staircase-footer">
            <span class="info-icon">💡</span>
            <span>ท่านสามารถสืบค้นย้อนกลับ (Backward) จากปลายน้ำกลับสู่ต้นน้ำ หรือสืบค้นไปข้างหน้า (Forward) ได้อย่างยืดหยุ่นไม่มีข้อจำกัด</span>
          </div>
        </div>
      </div>

    </div>

    <!-- Loading Overlay -->
    <el-dialog v-model="loading" :show-close="false" center width="320px" :close-on-click-modal="false">
      <div style="text-align:center;padding:20px">
        <el-icon class="spin" size="48" color="#409eff"><Loading /></el-icon>
        <p style="margin-top:16px;color:#606266;font-weight:500">{{ loadingText }}</p>
      </div>
    </el-dialog>

    <ExportOptionsDialog
      v-model="exportDialogVisible"
      :export-format="exportFormat"
      :export-options="exportOptions"
      :chain-steps="chainSteps"
      :combined-data="filteredCombinedData"
      :total-selected-rows="totalSelectedRows"
      :total-selected-sheets="totalSelectedSheets"
      :export-status-class="exportStatusClass"
      :export-status-text="exportStatusText"
      :get-filtered-rows="getFilteredRows"
      @set-format="setExportFormat"
      @set-preset="setExportPreset"
      @toggle-combined="toggleCombinedSelection"
      @toggle-step="toggleStepSelection"
      @confirm="confirmExport"
    />

    <PhilosophyDialog v-model="philosophyDialogVisible" />
    <FeatureGuideDialog v-model="featureGuideVisible" />
    <ApiManagerDialog v-model="apiManagerVisible" :api-base="API_BASE" />
    <RegistryManagerDialog v-model="registryManagerVisible" :api-base="API_BASE" @saved="reloadTablesSchema" />
    <AdminLoginDialog v-model="adminLoginVisible" :api-base="API_BASE" @success="onAdminLoginSuccess" />

    <!-- 💾 Dialog: Save API Endpoint -->
    <el-dialog v-model="saveApiDialogVisible" title="💾 สร้าง API Endpoint (Traceability Flow as a Service)" width="520px" destroy-on-close>
      <div style="display: flex; flex-direction: column; gap: 14px;">
        <el-form label-position="top" size="default">
          <el-form-item label="Endpoint ID (Slug สำหรับเรียกใช้ใน URL - ห้ามเว้นวรรค)">
            <el-input v-model="apiForm.id" placeholder="เช่น aca-laser-vmi-flow" clearable />
          </el-form-item>
          <el-form-item label="ชื่อ Endpoint (Friendly Name)">
            <el-input v-model="apiForm.name" placeholder="เช่น รายงานประวัติกาวไปเลเซอร์ VMI" clearable />
          </el-form-item>
          <el-form-item label="รายละเอียดคำอธิบาย (Description)">
            <el-input v-model="apiForm.description" type="textarea" :rows="2" placeholder="อธิบายหน้าที่การทำงานของ API นี้..." />
          </el-form-item>
          <el-form-item label="🏷️ หมวดหมู่แผนก / API Group">
            <el-select
              v-model="apiForm.apiGroup"
              allow-create
              filterable
              default-first-option
              placeholder="เลือกหรือพิมพ์ชื่อกลุ่ม (เช่น Yield Tracking, Coil Traceability)"
              style="width: 100%;"
            >
              <el-option v-for="g in API_GROUP_OPTIONS" :key="g" :label="g" :value="g" />
            </el-select>
          </el-form-item>
          <el-form-item label="🔐 Visibility / สิทธิ์การมองเห็น">
            <el-radio-group v-model="apiForm.visibility">
              <el-radio-button value="public">🌍 Public (ทุกคนใช้ได้)</el-radio-button>
              <el-radio-button value="restricted">🔒 Restricted (เฉพาะรหัสที่กำหนด)</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item v-if="apiForm.visibility === 'restricted'" label="👥 Allowed Employee Numbers (EN) ที่ใช้ API ได้ - Autocomplete 🔍">
            <el-select
              v-model="apiForm.allowedUsers"
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
            <div style="font-size: 11px; color: #909399; margin-top: 6px;">พิมพ์ชื่อหรือรหัสพนักงานเพื่อค้นหาแบบสด (Real-time Autocomplete) ดึงข้อมูลตรงจาก API personal ในระบบของเรา!</div>
          </el-form-item>
        </el-form>

        <div style="background: #f8f9fa; border: 1px solid #e4e7ed; border-radius: 8px; padding: 12px; font-size: 11px;">
          <strong style="color: #409eff; display: block; margin-bottom: 6px;">⚙️ เลือกพารามิเตอร์สำหรับดึงข้อมูล (Select API Parameters):</strong>
          <div style="margin-bottom: 8px;">ผู้ใช้ปลายทางสามารถส่ง Parameter เหล่านี้เพื่อสืบค้นข้อมูลผ่าน URL Query String ได้ (เช่น กรองตามวันที่ Date, S2_DATE, S3_DATE เป็นต้น):</div>
          
          <div style="display: flex; gap: 6px; margin-bottom: 8px;">
            <el-button size="small" type="primary" plain @click="apiForm.selectedParams = apiParameterOptions.map(o => o.value)">เลือกทั้งหมด (Select All)</el-button>
            <el-button size="small" type="danger" plain @click="apiForm.selectedParams = []">ล้างทั้งหมด (Clear All)</el-button>
          </div>

          <el-select
            v-model="apiForm.selectedParams"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            placeholder="เลือกฟิลด์สำหรับเป็นพารามิเตอร์..."
            style="width: 100%;"
          >
            <el-option
              v-for="opt in apiParameterOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
          <div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 4px; align-items: center;">
            <span style="color: #909399; font-weight: 600; margin-right: 4px;">พารามิเตอร์เปิดใช้งาน:</span>
            <el-tag v-for="param in apiForm.selectedParams" :key="param" size="small" type="success" effect="dark" style="font-family: monospace;">
              {{ param }}
            </el-tag>
          </div>
        </div>

        <div style="background: #fdf6ec; border: 1px solid #faecd8; border-radius: 8px; padding: 12px; font-size: 11px; color: #b88230;">
          <strong>🔒 การจำกัดคอลัมน์ (Projection):</strong> Exporter จะดึงเฉพาะ <strong>{{ visibleCombinedCols.length }} คอลัมน์</strong> ที่คุณติ๊กเลือกไว้ใน Column Selector เท่านั้น!
        </div>

        <div v-if="apiForm.id" style="background: #f0f9eb; border: 1px solid #e1f3d8; border-radius: 8px; padding: 12px; font-size: 11px; font-family: monospace;">
          <strong style="color: #67c23a; display: block; margin-bottom: 4px;">cURL Call Preview:</strong>
          <div style="word-break: break-all; white-space: pre-wrap; color: #555;">curl -X GET "http://localhost:9090/api/v1/trace/{{ apiForm.id }}?{{ apiForm.selectedParams[0] || 'param' }}=VALUE&format=csv"</div>
        </div>
      </div>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <el-button @click="saveApiDialogVisible = false">ยกเลิก</el-button>
          <el-button type="success" :loading="apiForm.saving" @click="confirmSaveApi">สร้าง Endpoint</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- ⚙️ Quick Paste Rules Manager Dialog (Task 1.3) -->
    <el-dialog
      v-model="quickPasteRulesDialogVisible"
      title="⚙️ ตั้งค่า Quick Paste Rules"
      width="780px"
      destroy-on-close
    >
      <div style="margin-bottom: 12px; font-size: 13px; color: #606266; background: #ecf5ff; padding: 10px 14px; border-radius: 6px; border-left: 4px solid #409eff;">
        💡 <strong>วิธีการใช้งาน:</strong> ระบบจะทำการจับคู่ SN/Lot ที่คุณวางกับ Regex Pattern จากบนลงล่าง และจะใช้ Rule แรกที่ match ทันที
        <br>
        • รองรับการวางหลายบรรทัด (Multi-value) โดยระบบจะเปลี่ยน Operator เป็น <strong>IN</strong> ให้โดยอัตโนมัติ
      </div>

      <!-- 🛠️ เครื่องมือช่วยสร้าง Regex (Regex Generator Assistant) (Task 1.3 Update) -->
      <div style="background: #fffdf5; border: 1px solid #f5dab1; padding: 14px; border-radius: 8px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 2px 8px rgba(230,162,60,0.06);">
        <span style="font-size: 13px; font-weight: bold; color: #b88230; display: flex; align-items: center; gap: 6px;">
          🪄 เครื่องมือช่วยสร้าง Regex จากตัวอย่างข้อมูล (No-Code Regex Generator)
        </span>
        <div style="display: flex; gap: 8px;">
          <el-input
            v-model="regexSampleInput"
            placeholder="ป้อนตัวอย่างรหัส SN/Lot เช่น DKEWPY2D6303A1 หรือ 205630100B..."
            size="small"
            style="flex: 1;"
            clearable
            @keyup.enter="generateRegexSuggestions"
          />
          <el-button type="warning" size="small" @click="generateRegexSuggestions" style="font-weight: bold;">
            🪄 วิเคราะห์ & เจน Regex
          </el-button>
        </div>
        
        <div v-if="regexSuggestions.length > 0" style="margin-top: 6px; display: flex; flex-direction: column; gap: 8px;">
          <span style="font-size: 11px; color: #606266; font-weight: bold; display: block; border-bottom: 1px dashed #e4e7ed; padding-bottom: 4px;">🎯 ผลลัพธ์ตัวเลือก Regex (คลิกปุ่มเพื่อสร้าง Rule ทันที):</span>
          <div v-for="(suggest, sIdx) in regexSuggestions" :key="sIdx" style="display: flex; align-items: center; justify-content: space-between; background: #ffffff; padding: 8px 12px; border-radius: 6px; border: 1px solid #ebeef5; font-size: 11px; box-shadow: 0 1px 3px rgba(0,0,0,0.02); transition: all 0.2s ease;">
            <div style="display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; padding-right: 12px;">
              <span style="font-weight: 700; color: #e6a23c; font-size: 11px;">{{ suggest.label }}</span>
              <code style="font-family: monospace; color: #303133; font-size: 12px; font-weight: 700; background: #f5f7fa; padding: 2px 6px; border-radius: 4px; border: 1px solid #e4e7ed; display: inline-block; width: fit-content; word-break: break-all;">{{ suggest.pattern }}</code>
            </div>
            <el-button type="success" size="small" plain @click="applyRegexToRules(suggest.pattern)" style="font-weight: bold;">
              ➕ ใช้ค่านี้สร้าง Rule ใหม่
            </el-button>
          </div>
        </div>
      </div>

      <div class="rules-manager-list" style="max-height: 480px; overflow-y: auto; padding-right: 6px;">
        <div v-if="quickPasteRules.length === 0" style="text-align: center; padding: 30px 0; color: #909399;">
          ไม่มี Rules ที่ตั้งค่าไว้ กรุณาคลิกปุ่มเพิ่ม Rule ด้านล่าง
        </div>
        <div
          v-for="(rule, idx) in quickPasteRules"
          :key="idx"
          class="rule-editor-card"
          style="background: #fafafa; border: 1px solid #dcdfe6; border-radius: 8px; padding: 14px; margin-bottom: 12px; position: relative;"
        >
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
            <span style="font-weight: bold; color: #303133; font-size: 14px;">Rule #{{ idx + 1 }}</span>
            <div style="display: flex; gap: 4px;">
              <el-button size="small" :disabled="idx === 0" @click="moveRuleUp(idx)">
                ▲ ขึ้น
              </el-button>
              <el-button size="small" :disabled="idx === quickPasteRules.length - 1" @click="moveRuleDown(idx)">
                ▼ ลง
              </el-button>
              <el-button type="danger" size="small" @click="deleteRule(idx)">
                🗑️ ลบ
              </el-button>
            </div>
          </div>

          <el-row :gutter="12">
            <el-col :span="8">
              <div style="margin-bottom: 8px;">
                <span style="font-size: 12px; font-weight: bold; color: #606266; display: block; margin-bottom: 4px;">ชื่อ Rule</span>
                <el-input v-model="rule.name" placeholder="เช่น Hookup SN" size="small" />
              </div>
            </el-col>
            <el-col :span="16">
              <div style="margin-bottom: 8px;">
                <span style="font-size: 12px; font-weight: bold; color: #606266; display: block; margin-bottom: 4px;">Regex Pattern</span>
                <el-input v-model="rule.pattern" placeholder="เช่น ^[A-Z]{3}\d{6}$" size="small" style="font-family: monospace;" />
              </div>
            </el-col>
          </el-row>

          <el-row :gutter="12" style="margin-top: 8px;">
            <el-col :span="8">
              <div>
                <span style="font-size: 12px; font-weight: bold; color: #606266; display: block; margin-bottom: 4px;">Target Table</span>
                <el-select v-model="rule.table" size="small" style="width: 100%" @change="handleRuleTableChange(rule)">
                  <el-option-group
                    v-for="group in groupedTables"
                    :key="group.key"
                    :label="group.label"
                  >
                    <el-option
                      v-for="t in group.tables"
                      :key="t.key"
                      :label="t.label"
                      :value="t.key"
                    />
                  </el-option-group>
                </el-select>
              </div>
            </el-col>
            <el-col :span="8">
              <div>
                <span style="font-size: 12px; font-weight: bold; color: #606266; display: block; margin-bottom: 4px;">Target Column</span>
                <el-select v-model="rule.column" size="small" style="width: 100%">
                  <el-option
                    v-for="col in (tablesMeta.find(t => t.key === rule.table)?.columns || [])"
                    :key="col.key"
                    :label="col.label"
                    :value="col.key"
                  />
                </el-select>
              </div>
            </el-col>
            <el-col :span="8">
              <div>
                <span style="font-size: 12px; font-weight: bold; color: #606266; display: block; margin-bottom: 4px;">Operator (เมื่อเจอค่าเดียว)</span>
                <el-select v-model="rule.operator" size="small" style="width: 100%">
                  <el-option value="like" label="LIKE" />
                  <el-option value="eq" label="Exact (=)" />
                </el-select>
              </div>
            </el-col>
          </el-row>
        </div>
      </div>

      <div style="display: flex; gap: 8px; margin-top: 12px;">
        <el-button type="primary" plain size="small" style="flex: 1;" @click="addRule">
          ➕ เพิ่ม Rule ใหม่
        </el-button>
        <el-button type="warning" plain size="small" @click="resetToDefaultRules">
          🔄 รีเซ็ตเป็นค่าเริ่มต้น
        </el-button>
      </div>

      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <el-button @click="quickPasteRulesDialogVisible = false">ยกเลิก</el-button>
          <el-button type="success" @click="saveQuickPasteRules(); quickPasteRulesDialogVisible = false;">บันทึกทั้งหมด</el-button>
        </div>
      </template>
    </el-dialog>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, shallowRef, nextTick, markRaw, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowDown, Close, Loading, Search } from '@element-plus/icons-vue';
import QueryTemplatesPanel from './QueryTemplatesPanel.vue';
import ExportOptionsDialog from './ExportOptionsDialog.vue';
import PhilosophyDialog from './PhilosophyDialog.vue';
import FeatureGuideDialog from './FeatureGuideDialog.vue';
import ApiManagerDialog from './ApiManagerDialog.vue';
import RegistryManagerDialog from './RegistryManagerDialog.vue';
import AdminLoginDialog from './AdminLoginDialog.vue';
import { useChainTracker } from '../composables/useChainTracker';
import { useCombinedRows, isDateColumnName } from '../composables/useCombinedRows';
import { useExcelExport } from '../composables/useExcelExport';
import { PIVOT_BATCH_SIZE, fetchAppConfig } from '../config/appConfig';

const API_BASE = import.meta.env.DEV
  ? 'http://localhost:9090'
  : 'https://devth-app6.beltontechnology.com:9090';

const tablesMeta = ref([]);
const templatesPanelRef = ref(null);

// จัดกลุ่มตารางตาม connection/หมวดหมู่
const groupedTables = computed(() => {
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

  tablesMeta.value.forEach(t => {
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
const loading = ref(false);
const loadingText = ref('Loading...');
const chainSteps = shallowRef([]);
const activeStepIndex = ref(-1);
const philosophyDialogVisible = ref(false);
const featureGuideVisible = ref(false);
const apiManagerVisible = ref(false);
const registryManagerVisible = ref(false);
const adminLoginVisible = ref(false);
const adminUser = ref(JSON.parse(localStorage.getItem('sg_admin_user') || 'null'));
const isSidebarPhilosophyOpen = ref(true);
const showMorePrecautions = ref(false);

const isDark = ref(false);

const toggleTheme = () => {
  isDark.value = !isDark.value;
  if (isDark.value) {
    document.documentElement.classList.add('dark');
    localStorage.setItem('sg_dark_mode', 'true');
  } else {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('sg_dark_mode', 'false');
  }
};

// Search History states
const searchHistory = ref([]);
const isHistoryOpen = ref(false);

// Quick Paste Box states
const quickPasteValue = ref('');
const quickPasteRules = ref([]);
const quickPasteRulesDialogVisible = ref(false);
const isDraggingFile = ref(false);
const quickPasteBulkArray = ref([]);
const quickPasteFilename = ref('');
const fileInputRef = ref(null);

// Regex Generator Assistant states
const regexSampleInput = ref('');
const regexSuggestions = ref([]);

const DEFAULT_QUICK_PASTE_RULES = [
  { name: 'Hookup SN', pattern: '^[A-Z]{3}\\d{6}$', table: 'scan1', column: 'hookup', operator: 'like' },
  { name: 'DCM Serial No', pattern: '^DCM', table: 'SCAN1_DISPENSING', column: 'dcm', operator: 'eq' },
  { name: 'ACA Lot', pattern: '^ACA', table: 'scan1_map_aca', column: 'acaLot', operator: 'like' }
];

const selectedQuickPasteMatchIdx = ref(0);

watch(quickPasteValue, (newVal) => {
  selectedQuickPasteMatchIdx.value = 0;
  
  const tplActive = templatesPanelRef.value?.selectedTemplate;
  if (tplActive) {
    const val = (newVal || '').trim();
    const lines = parseMultiValue(val);
    templatesPanelRef.value.applyQuickPasteValues(lines, '');
  }
});

watch(
  () => templatesPanelRef.value?.selectedTemplate,
  (newTpl) => {
    if (newTpl) {
      let lines = [];
      let filename = '';
      if (quickPasteBulkArray.value.length > 0) {
        lines = quickPasteBulkArray.value;
        filename = quickPasteFilename.value;
      } else {
        const val = (quickPasteValue.value || '').trim();
        lines = parseMultiValue(val);
      }
      if (lines.length > 0) {
        nextTick(() => {
          templatesPanelRef.value?.applyQuickPasteValues(lines, filename);
        });
      }
    }
  }
);

const quickPasteMatches = computed(() => {
  let lines = [];
  if (quickPasteBulkArray.value.length > 0) {
    lines = quickPasteBulkArray.value;
  } else {
    const val = (quickPasteValue.value || '').trim();
    if (!val) return [];
    lines = parseMultiValue(val);
  }
  
  if (lines.length === 0) return [];

  // ถ้ามี Template เปิดใช้งานอยู่ ให้จับคู่เข้า Template โดยอัตโนมัติ (Virtual Routing)
  const tplActive = templatesPanelRef.value?.selectedTemplate;
  if (tplActive) {
    const startStepIdx = templatesPanelRef.value.selectedStartStepIdx ?? 0;
    const startTable = tplActive.stepsChain[startStepIdx] || tplActive.rootTable;
    const cond = templatesPanelRef.value.templateConditions?.[0];
    const targetColumn = cond?.column || '';
    
    const tableMeta = tablesMeta.value.find(t => t.key === startTable);
    const colMeta = tableMeta?.columns.find(c => c.key === targetColumn);
    
    return [{
      rule: {
        name: `Template: ${tplActive.name}`,
        table: startTable,
        column: targetColumn,
        operator: cond?.operator || 'in',
      },
      tableLabel: tableMeta ? tableMeta.label : startTable,
      columnLabel: colMeta ? colMeta.label : targetColumn,
      isMulti: lines.length > 1
    }];
  }
  
  const firstVal = lines[0];
  const list = [];
  for (const rule of quickPasteRules.value) {
    try {
      const rx = new RegExp(rule.pattern);
      if (rx.test(firstVal)) {
        const tableMeta = tablesMeta.value.find(t => t.key === rule.table);
        const colMeta = tableMeta?.columns.find(c => c.key === rule.column);
        list.push({
          rule,
          tableLabel: tableMeta ? tableMeta.label : rule.table,
          columnLabel: colMeta ? colMeta.label : rule.column,
          isMulti: lines.length > 1
        });
      }
    } catch (err) {
      // Ignore regex compile error
    }
  }
  return list;
});

const activeQuickPasteMatch = computed(() => {
  return quickPasteMatches.value[selectedQuickPasteMatchIdx.value] || null;
});

const searchForm = ref({
  table: '',
  conditions: [
    { column: '', operator: 'like', value: '', value2: '', multiValue: '', dateRange: [] },
  ],
});

let uidSeed = 0;
function nextUid() {
  uidSeed += 1;
  return uidSeed;
}

const {
  currentPage,
  pageSize,
  localFilters,
  initStepPaging,
  pruneStepPaging,
  ensureStepPaging,
  clearStepPagingFrom,
  resetStepTracking,
  getFilteredRows,
  getPaginatedRows,
} = useChainTracker(chainSteps);

function onTemplateChainUpdate(nextSteps) {
  chainSteps.value = nextSteps;
  pruneStepPaging(nextSteps.length);
  ensureStepPaging(nextSteps.length);

  const lastReadyIdx = nextSteps.findLastIndex
    ? nextSteps.findLastIndex((step) => !step._chainLoading)
    : (() => {
        for (let i = nextSteps.length - 1; i >= 0; i--) {
          if (!nextSteps[i]._chainLoading) return i;
        }
        return -1;
      })();
  if (lastReadyIdx >= 0) activeStepIndex.value = lastReadyIdx;
}

function onTemplateChainFinished(result) {
  if (result?.ok) {
    activeStepIndex.value = chainSteps.value.length - 1;
    const tpl = result.template;
    if (tpl && Array.isArray(tpl.favoriteColumns) && tpl.favoriteColumns.length > 0) {
      applyingTemplateFavorites.value = tpl.favoriteColumns;
      // If combinedCols is already stable and has rows, apply immediately
      if (combinedCols.value.length > 0) {
        visibleCombinedCols.value = combinedCols.value.filter(c => isFavoriteMatch(c, tpl.favoriteColumns));
      }
    }
  }
}

const searchableColumns = computed(() => {
  if (!searchForm.value.table) return [];
  const table = tablesMeta.value.find((item) => item.key === searchForm.value.table);
  return table ? table.columns.filter((col) => col.searchable) : [];
});

const groupedStepperColumns = computed(() => {
  const steps = chainSteps.value.map((step, idx) => {
    let parentIdx = step._pivotFromStepIdx;
    if (parentIdx === undefined && idx > 0) parentIdx = idx - 1;
    if (parentIdx === undefined) parentIdx = null;
    return { ...step, originalIdx: idx, parentIdx };
  });

  const levels = new Array(steps.length).fill(0);
  function levelOf(idx) {
    const step = steps[idx];
    if (!step || step.parentIdx === null || step.parentIdx === undefined || step.parentIdx >= idx) return 0;
    return levelOf(step.parentIdx) + 1;
  }
  steps.forEach((_, idx) => {
    levels[idx] = levelOf(idx);
  });

  const grouped = {};
  steps.forEach((step, idx) => {
    const level = levels[idx];
    if (!grouped[level]) grouped[level] = [];
    grouped[level].push({ ...step, level });
  });

  return Object.keys(grouped)
    .map(Number)
    .sort((a, b) => a - b)
    .map((level) => ({ level, steps: grouped[level] }));
});

async function reloadTablesSchema() {
  try {
    await fetchAppConfig(API_BASE);
    const res = await fetch(`${API_BASE}/api/tables`);
    const json = await res.json();
    if (json.success) tablesMeta.value = json.data;
  } catch (err) {
    console.error(err);
    ElMessage.error('Cannot load table metadata. Please check backend.');
  }
}

function onAdminLoginSuccess(user) {
  adminUser.value = user;
  registryManagerVisible.value = true;
}

function handleConfigCommand(command) {
  if (command === 'catalog') {
    featureGuideVisible.value = true;
  } else if (command === 'api') {
    apiManagerVisible.value = true;
  } else if (command === 'registry') {
    if (adminUser.value && adminUser.value.permission === 'admin') {
      registryManagerVisible.value = true;
    } else {
      adminLoginVisible.value = true;
    }
  } else if (command === 'philosophy') {
    philosophyDialogVisible.value = true;
  }
}

function handleAdminLogout() {
  localStorage.removeItem('sg_admin_user');
  adminUser.value = null;
  ElMessage.success('ออกจากระบบสิทธิ์ Admin เรียบร้อยแล้ว');
}

onMounted(() => {
  // Initialize dark mode from localStorage or prefers-color-scheme
  const savedDark = localStorage.getItem('sg_dark_mode');
  if (savedDark === 'true' || (savedDark === null && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    isDark.value = true;
    document.documentElement.classList.add('dark');
  } else {
    isDark.value = false;
    document.documentElement.classList.remove('dark');
  }

  reloadTablesSchema();
  loadSearchHistory();
  if (typeof loadQuickPasteRules === 'function') {
    loadQuickPasteRules();
  }
});

function isDateColumn(column) {
  if (!column) return false;
  const normalized = column.toLowerCase();
  if (normalized.includes('user_reg') || normalized.includes('user_upd') || normalized.includes('userreg') || normalized.includes('userupd')) {
    return false;
  }
  return normalized.includes('date') || normalized.includes('time') || normalized.includes('crdt') || normalized === 'reg' || normalized === 'upd';
}

function applyDatePreset(cond, preset) {
  const today = new Date();
  const formatDate = (date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const todayStr = formatDate(today);

  if (preset === 'today') {
    cond.operator = 'eq';
    cond.value = todayStr;
    cond.value2 = '';
    cond.multiValue = '';
    cond.dateRange = [];
  } else if (preset === 'yesterday') {
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const yesterdayStr = formatDate(yesterday);
    cond.operator = 'lte';
    cond.value = yesterdayStr;
    cond.value2 = '';
    cond.multiValue = '';
    cond.dateRange = [];
  } else if (preset === 'last7') {
    const last7 = new Date();
    last7.setDate(today.getDate() - 7);
    const last7Str = formatDate(last7);
    cond.operator = 'between';
    cond.value = '';
    cond.value2 = '';
    cond.multiValue = '';
    cond.dateRange = [last7Str, todayStr];
  } else if (preset === 'last30') {
    const last30 = new Date();
    last30.setDate(today.getDate() - 30);
    const last30Str = formatDate(last30);
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

function addCondition() {
  searchForm.value.conditions.push({ column: '', operator: 'like', value: '', value2: '', multiValue: '', dateRange: [] });
}

function removeCondition(idx) {
  if (searchForm.value.conditions.length > 1) searchForm.value.conditions.splice(idx, 1);
}

function onCondOperatorChange(cond) {
  cond.value = '';
  cond.value2 = '';
  cond.multiValue = '';
  cond.dateRange = [];
}

function getInValueCount(value) {
  return parseMultiValue(value).length;
}

function parseMultiValue(value) {
  return value ? value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean) : [];
}

function onTableChange() {
  searchForm.value.conditions = [
    { column: '', operator: 'like', value: '', value2: '', multiValue: '', dateRange: [] },
  ];
}

function loadSearchHistory() {
  try {
    const saved = localStorage.getItem('sg_search_history');
    searchHistory.value = saved ? JSON.parse(saved) : [];
  } catch (e) {
    console.error('Failed to load search history', e);
    searchHistory.value = [];
  }
}

function saveSearchHistory() {
  if (!searchForm.value.table) return;
  const tableMeta = tablesMeta.value.find((table) => table.key === searchForm.value.table);
  const tableLabelSnapshot = tableMeta ? tableMeta.label : searchForm.value.table;
  
  const conditions = JSON.parse(JSON.stringify(searchForm.value.conditions));
  
  const entry = {
    table: searchForm.value.table,
    conditions,
    tableLabelSnapshot,
    timestamp: Date.now()
  };
  
  const isDuplicate = searchHistory.value.slice(0, 5).some(item => {
    return item.table === entry.table && JSON.stringify(item.conditions) === JSON.stringify(entry.conditions);
  });
  
  if (isDuplicate) {
    const idx = searchHistory.value.findIndex(item => item.table === entry.table && JSON.stringify(item.conditions) === JSON.stringify(entry.conditions));
    if (idx !== -1) {
      searchHistory.value.splice(idx, 1);
    }
  }
  
  searchHistory.value.unshift(entry);
  if (searchHistory.value.length > 20) {
    searchHistory.value.pop();
  }
  
  localStorage.setItem('sg_search_history', JSON.stringify(searchHistory.value));
}

function clearSearchHistory() {
  searchHistory.value = [];
  localStorage.removeItem('sg_search_history');
  ElMessage.success('ล้างประวัติการค้นหาเรียบร้อยแล้ว');
}

function restoreSearch(entry) {
  searchForm.value.table = entry.table;
  searchForm.value.conditions = JSON.parse(JSON.stringify(entry.conditions));
  ElMessage.success(`กู้คืนการค้นหาตาราง ${entry.tableLabelSnapshot}`);
  doSearch();
}

function relativeTime(ts) {
  if (!ts) return '';
  const now = Date.now();
  const diff = now - ts;
  if (diff < 0) return 'เมื่อครู่';
  
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'เมื่อครู่';
  
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  
  const days = Math.floor(hours / 24);
  if (days === 1) return 'เมื่อวานนี้';
  if (days < 7) return `${days} วันที่แล้ว`;
  
  return new Date(ts).toLocaleDateString();
}

async function doSearch() {
  if (!searchForm.value.table) {
    ElMessage.warning('Please select a table.');
    return;
  }

  const tableMeta = tablesMeta.value.find((table) => table.key === searchForm.value.table);
  const conditions = [];

  for (let idx = 0; idx < searchForm.value.conditions.length; idx++) {
    const cond = searchForm.value.conditions[idx];
    if (!cond.column) {
      ElMessage.warning(`Please select a column for condition ${idx + 1}.`);
      return;
    }

    const isIn = cond.operator === 'in';
    const isBetween = cond.operator === 'between';
    const isDate = isDateColumn(cond.column);
    let value = '';
    let value2 = '';
    let values = [];

    if (isIn) {
      values = cond.values && cond.values.length > 0
        ? cond.values
        : parseMultiValue(cond.multiValue);
      if (!values.length) {
        ElMessage.warning(`Please enter at least one IN value for condition ${idx + 1}.`);
        return;
      }
    } else if (isBetween) {
      if (isDate) {
        if (!cond.dateRange || cond.dateRange.length !== 2) {
          ElMessage.warning(`Please select a date range for condition ${idx + 1}.`);
          return;
        }
        [value, value2] = cond.dateRange;
      } else {
        value = (cond.value || '').trim();
        value2 = (cond.value2 || '').trim();
        if (!value || !value2) {
          ElMessage.warning(`Please enter both range values for condition ${idx + 1}.`);
          return;
        }
      }
    } else {
      value = (cond.value || '').trim();
      if (!value) {
        ElMessage.warning(`Please enter a value for condition ${idx + 1}.`);
        return;
      }
    }

    conditions.push({
      column: cond.column,
      operator: cond.operator,
      value,
      value2: isBetween ? value2 : undefined,
      values: isIn ? values : undefined,
    });
  }

  loadingText.value = 'Searching...';
  loading.value = true;
  try {
    const res = await fetch(`${API_BASE}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: searchForm.value.table, conditions }),
    });
    const json = await res.json();
    if (!json.success) {
      ElMessage.error(json.message || 'Search failed.');
      return;
    }

    resetStepTracking();
    initStepPaging(0);

    const labels = conditions.map((cond) => {
      const col = tableMeta?.columns.find((item) => item.key === cond.column);
      return col?.label ?? cond.column;
    });
    const values = conditions.map((cond) => {
      if (cond.operator === 'in') return `IN (${cond.values.length} values)`;
      if (cond.operator === 'between') return `${cond.value} ~ ${cond.value2}`;
      return cond.value;
    });

    chainSteps.value = [{
      ...json.data,
      rows: markRaw(json.data.rows || []),
      table: searchForm.value.table,
      _searchConditions: JSON.parse(JSON.stringify(searchForm.value.conditions)),
      columnLabel: labels.join(' + '),
      value: values.join(' & '),
      operator: conditions.length > 1 ? 'multi' : conditions[0].operator,
      _uid: nextUid(),
    }];
    activeStepIndex.value = 0;
    saveSearchHistory();

    if (json.data.total === 0) {
      ElMessage.info('No matching rows found.');
    } else {
      ElMessage.success(`Found ${json.data.total.toLocaleString()} rows.`);
    }
  } catch (err) {
    console.error(err);
    ElMessage.error('API connection error.');
  } finally {
    loading.value = false;
  }
}

// ── Quick Paste & User-Configurable Rules Helpers ──
function loadQuickPasteRules() {
  try {
    const saved = localStorage.getItem('sg_quick_paste_rules');
    if (saved) {
      quickPasteRules.value = JSON.parse(saved);
    } else {
      quickPasteRules.value = JSON.parse(JSON.stringify(DEFAULT_QUICK_PASTE_RULES));
      localStorage.setItem('sg_quick_paste_rules', JSON.stringify(quickPasteRules.value));
    }
  } catch (e) {
    console.error('Failed to load quick paste rules', e);
    quickPasteRules.value = JSON.parse(JSON.stringify(DEFAULT_QUICK_PASTE_RULES));
  }
}

function saveQuickPasteRules() {
  try {
    localStorage.setItem('sg_quick_paste_rules', JSON.stringify(quickPasteRules.value));
    ElMessage.success('บันทึก Quick Paste Rules เรียบร้อยแล้ว');
  } catch (e) {
    console.error('Failed to save quick paste rules', e);
    ElMessage.error('บันทึก Rules ล้มเหลว');
  }
}

function triggerFileInput() {
  if (fileInputRef.value) {
    fileInputRef.value.click();
  }
}

function handleFileInputChange(e) {
  const files = e.target.files;
  if (files && files.length > 0) {
    processFile(files[0]);
  }
}

function handleDragOver(e) {
  isDraggingFile.value = true;
}

function handleDragEnter(e) {
  isDraggingFile.value = true;
}

function handleDragLeave(e) {
  isDraggingFile.value = false;
}

function handleFileDrop(e) {
  isDraggingFile.value = false;
  const files = e.dataTransfer.files;
  if (files && files.length > 0) {
    processFile(files[0]);
  }
}

function processFile(file) {
  const name = file.name;
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const parsedList = [];
    let hasHeader = false;
    
    if (lines.length > 0) {
      const firstLine = lines[0];
      const cols = firstLine.split(/[\t,;]/).map(c => c.trim().toLowerCase());
      const headerKeywords = ['serial', 'sn', 'dcm', 'aca', 'lot', 'id', 'part', 'barcode', 'key', 'code', 'ตาราง', 'คอลัมน์'];
      if (cols.length > 0 && headerKeywords.some(kw => cols[0].includes(kw))) {
        hasHeader = true;
      }
    }
    
    for (let i = hasHeader ? 1 : 0; i < lines.length; i++) {
      const line = lines[i];
      const cols = line.split(/[\t,;]/);
      const val = cols[0].trim();
      if (val) {
        parsedList.push(val);
      }
    }
    
    if (parsedList.length === 0) {
      ElMessage.warning('ไม่พบข้อมูลที่สามารถสืบค้นได้ในไฟล์นี้');
      return;
    }
    
    quickPasteBulkArray.value = parsedList;
    quickPasteFilename.value = name;
    
    const tplActive = templatesPanelRef.value?.selectedTemplate;
    if (tplActive) {
      templatesPanelRef.value.applyQuickPasteValues(parsedList, name);
      ElMessage.success(`โหลดไฟล์ "${name}" สำเร็จ และนำเข้าข้อมูล ${parsedList.length.toLocaleString()} รายการไปยังเงื่อนไขเริ่มต้นของ Template "${tplActive.name}" เรียบร้อยแล้ว`);
    } else {
      ElMessage.success(`โหลดไฟล์ "${name}" สำเร็จ: นำเข้าข้อมูลจำนวน ${parsedList.length.toLocaleString()} รายการ`);
    }
  };
  reader.readAsText(file);
}

function clearImportedFile() {
  quickPasteBulkArray.value = [];
  quickPasteFilename.value = '';
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
  }
  const tplActive = templatesPanelRef.value?.selectedTemplate;
  if (tplActive) {
    templatesPanelRef.value.applyQuickPasteValues([], '');
  }
}

function handleCellClick(row, column, cell, event) {
  const selection = window.getSelection().toString();
  if (selection) return;
  
  const prop = column.property;
  if (!prop) return;
  
  const value = row[prop];
  if (value === null || value === undefined || value === '') return;
  
  const copyVal = String(value).trim();
  if (!copyVal) return;
  
  if (prop.endsWith('_Status') && (copyVal === 'MATCH' || copyVal === 'NA (WIP)')) {
    return;
  }
  
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(copyVal).then(() => {
      ElMessage({
        message: `📋 คัดลอกค่า "${copyVal}" สำเร็จ!`,
        type: 'success',
        duration: 1500
      });
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  } else {
    const textArea = document.createElement("textarea");
    textArea.value = copyVal;
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      ElMessage({
        message: `📋 คัดลอกค่า "${copyVal}" สำเร็จ!`,
        type: 'success',
        duration: 1500
      });
    } catch (err) {
      console.error('Fallback copy failed: ', err);
    }
    document.body.removeChild(textArea);
  }
}

function executeQuickPaste() {
  const tplActive = templatesPanelRef.value?.selectedTemplate;
  if (tplActive) {
    templatesPanelRef.value.onRun();
    return;
  }

  const match = activeQuickPasteMatch.value;
  let targetTable = '';
  let targetColumn = '';
  let targetOperator = 'in';
  let targetLabel = '';

  if (match) {
    targetTable = match.rule.table;
    targetColumn = match.rule.column;
    targetOperator = match.rule.operator || 'like';
    targetLabel = `จับคู่ Rule: "${match.rule.name}" (${match.tableLabel}.${match.columnLabel})`;
  } else {
    // No matching rule found. Check if the user has manually selected a Table and Column in the form below
    if (searchForm.value.table) {
      targetTable = searchForm.value.table;
      const cond = searchForm.value.conditions[0];
      if (cond && cond.column) {
        targetColumn = cond.column;
        targetOperator = cond.operator || 'in';
        
        const tableMeta = tablesMeta.value.find(t => t.key === targetTable);
        const colMeta = tableMeta?.columns?.find(c => c.key === targetColumn);
        const tableLabel = tableMeta?.label || targetTable;
        const colLabel = colMeta?.label || targetColumn;
        targetLabel = `ใช้ตาราง/คอลัมน์ที่เลือก: ${tableLabel} ➔ ${colLabel}`;
      }
    }
  }

  if (!targetTable || !targetColumn) {
    ElMessage.warning('ไม่พบ Rule ที่ตรงกับข้อมูลนี้ และไม่ได้เลือกตาราง/คอลัมน์ในแบบฟอร์มด้านล่าง');
    return;
  }
  
  let lines = [];
  if (quickPasteBulkArray.value.length > 0) {
    lines = quickPasteBulkArray.value;
  } else {
    const val = (quickPasteValue.value || '').trim();
    lines = parseMultiValue(val);
  }

  if (lines.length === 0) {
    ElMessage.warning('กรุณาระบุข้อมูลสำหรับค้นหา (พิมพ์รหัสหรือลากไฟล์ใส่กล่องด่วน)');
    return;
  }
  
  searchForm.value.table = targetTable;
  
  if (lines.length > 1) {
    searchForm.value.conditions = [{
      column: targetColumn,
      operator: 'in',
      value: '',
      value2: '',
      multiValue: quickPasteBulkArray.value.length > 0 ? `[นำเข้า ${quickPasteBulkArray.value.length} รายการจากไฟล์]` : lines.join('\n'),
      values: quickPasteBulkArray.value.length > 0 ? [...quickPasteBulkArray.value] : undefined,
      filename: quickPasteBulkArray.value.length > 0 ? quickPasteFilename.value : undefined,
      dateRange: []
    }];
  } else {
    searchForm.value.conditions = [{
      column: targetColumn,
      operator: targetOperator === 'in' ? 'like' : targetOperator,
      value: lines[0] || '',
      value2: '',
      multiValue: '',
      dateRange: []
    }];
  }
  
  ElMessage.success(targetLabel);
  doSearch();
}

function getSelectedTableAndColumnLabel() {
  const targetTable = searchForm.value.table;
  if (!targetTable) return '';
  const cond = searchForm.value.conditions[0];
  if (!cond || !cond.column) return '';
  
  const tableMeta = tablesMeta.value.find(t => t.key === targetTable);
  const colMeta = tableMeta?.columns?.find(c => c.key === cond.column);
  const tableLabel = tableMeta?.label || targetTable;
  const colLabel = colMeta?.label || cond.column;
  return `${tableLabel} ➔ ${colLabel}`;
}

function addRule() {
  quickPasteRules.value.push({
    name: 'Rule ใหม่',
    pattern: '',
    table: tablesMeta.value[0]?.key || '',
    column: tablesMeta.value[0]?.columns[0]?.key || '',
    operator: 'like'
  });
}

function deleteRule(idx) {
  quickPasteRules.value.splice(idx, 1);
}

function moveRuleUp(idx) {
  if (idx === 0) return;
  const temp = quickPasteRules.value[idx];
  quickPasteRules.value[idx] = quickPasteRules.value[idx - 1];
  quickPasteRules.value[idx - 1] = temp;
}

function moveRuleDown(idx) {
  if (idx === quickPasteRules.value.length - 1) return;
  const temp = quickPasteRules.value[idx];
  quickPasteRules.value[idx] = quickPasteRules.value[idx + 1];
  quickPasteRules.value[idx + 1] = temp;
}

function resetToDefaultRules() {
  ElMessageBox.confirm('คุณต้องการรีเซ็ต Rules ทั้งหมดเป็นค่าเริ่มต้นใช่หรือไม่?', 'ยืนยันการรีเซ็ต', {
    confirmButtonText: 'ใช่',
    cancelButtonText: 'ยกเลิก',
    type: 'warning'
  }).then(() => {
    quickPasteRules.value = JSON.parse(JSON.stringify(DEFAULT_QUICK_PASTE_RULES));
    localStorage.setItem('sg_quick_paste_rules', JSON.stringify(quickPasteRules.value));
    ElMessage.success('รีเซ็ต Rules เรียบร้อยแล้ว');
  }).catch(() => {});
}

function handleRuleTableChange(rule) {
  const table = tablesMeta.value.find(t => t.key === rule.table);
  rule.column = table?.columns[0]?.key || '';
}

// ── Smart Regex Generator Tool Helpers ──
function generateRegexSuggestions() {
  const val = (regexSampleInput.value || '').trim();
  if (!val) {
    ElMessage.warning('กรุณากรอกตัวอย่างข้อมูลก่อนการวิเคราะห์');
    return;
  }
  
  const suggestions = [];
  
  const strictPat = generateStrictRegex(val);
  if (strictPat) {
    suggestions.push({
      label: '1. รูปแบบโครงสร้างอย่างละเอียด (เจาะจงเฉพาะตัวอักษร/ตัวเลขตามตำแหน่ง)',
      pattern: strictPat
    });
  }
  
  const alphaPat = generateAlphanumericRegex(val);
  if (alphaPat && alphaPat !== strictPat) {
    suggestions.push({
      label: '2. รูปแบบตัวอักษรผสมตัวเลข (คละตำแหน่งแต่ความยาวเท่ากับตัวอย่าง)',
      pattern: alphaPat
    });
  }
  
  const prefixPat = generatePrefixRegex(val);
  if (prefixPat) {
    suggestions.push({
      label: '3. รูปแบบตรวจจับเฉพาะคำนำหน้า (ขึ้นต้นด้วยตัวอย่าง 4 ตัวแรก)',
      pattern: prefixPat
    });
  }
  
  regexSuggestions.value = suggestions;
  ElMessage.success('วิเคราะห์โครงสร้างข้อมูลและสร้าง Regex สำเร็จ!');
}

function generateStrictRegex(val) {
  if (!val) return '';
  let pattern = '^';
  let i = 0;
  while (i < val.length) {
    const char = val[i];
    let type = '';
    let regexPart = '';
    
    if (/[A-Z]/.test(char)) {
      type = 'upper';
      regexPart = '[A-Z]';
    } else if (/[a-z]/.test(char)) {
      type = 'lower';
      regexPart = '[a-z]';
    } else if (/\d/.test(char)) {
      type = 'digit';
      regexPart = '\\d';
    } else {
      type = 'special';
      regexPart = '\\' + char;
    }
    
    let count = 0;
    while (i < val.length) {
      const nextChar = val[i];
      let nextType = '';
      if (/[A-Z]/.test(nextChar)) nextType = 'upper';
      else if (/[a-z]/.test(nextChar)) nextType = 'lower';
      else if (/\d/.test(nextChar)) nextType = 'digit';
      else nextType = 'special';
      
      if (nextType === type) {
        if (type === 'special' && nextChar !== char) {
          break;
        }
        count++;
        i++;
      } else {
        break;
      }
    }
    
    if (count > 1) {
      pattern += `${regexPart}{${count}}`;
    } else {
      pattern += regexPart;
    }
  }
  pattern += '$';
  return pattern;
}

function generateAlphanumericRegex(val) {
  if (!val) return '';
  const len = val.length;
  if (/^[A-Z0-9]+$/.test(val)) {
    return `^[A-Z0-9]{${len}}$`;
  }
  if (/^[a-zA-Z0-9]+$/.test(val)) {
    return `^[a-zA-Z0-9]{${len}}$`;
  }
  return `^.{${len}}$`;
}

function generatePrefixRegex(val) {
  if (!val) return '';
  const prefix = val.substring(0, Math.min(val.length, 4));
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return `^${escaped}`;
}

function applyRegexToRules(pattern) {
  const sample = regexSampleInput.value.trim();
  quickPasteRules.value.push({
    name: `Rule ค้นด่วนสำหรับ ${sample}`,
    pattern: pattern,
    table: tablesMeta.value[0]?.key || '',
    column: tablesMeta.value[0]?.columns[0]?.key || '',
    operator: 'like'
  });
  ElMessage.success(`เพิ่ม Rule ใหม่สำเร็จด้วยแพทเทิร์น "${pattern}"`);
}

async function onPivotSelect(stepIdx, pivot, link) {
  const sourceStep = chainSteps.value[stepIdx];
  if (!sourceStep) return;

  const sourceDbColumn = pivot.fromDbColumn;
  const sourceValues = [...new Set(getFilteredRows(stepIdx)
    .map((row) => row[sourceDbColumn])
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map((value) => String(value).trim()))];

  if (!sourceValues.length) {
    ElMessage.warning(`No values found in "${pivot.fromColumnLabel}" (${sourceDbColumn}) for pivot.`);
    return;
  }

  const batchSize = PIVOT_BATCH_SIZE.value;
  loadingText.value = `Pivoting ${sourceValues.length.toLocaleString()} values in batches of ${batchSize}...`;
  loading.value = true;
  try {
    const merged = {
      rows: [],
      total: 0,
      availablePivots: null,
      targetTableLabel: null,
      targetTable: link.targetTable,
      targetColumn: link.targetColumn,
    };

    for (let offset = 0; offset < sourceValues.length; offset += batchSize) {
      const batch = sourceValues.slice(offset, offset + batchSize);
      const res = await fetch(`${API_BASE}/api/pivot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceValues: batch,
          targetTable: link.targetTable,
          targetServer: link.targetServer || undefined,
          targetColumn: link.targetColumn,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        ElMessage.error(json.message || 'Pivot failed.');
        return;
      }

      const rows = json.data.rows || [];
      for (let j = 0; j < rows.length; j++) {
        merged.rows.push(rows[j]);
      }
      merged.total += json.data.total || 0;
      if (!merged.availablePivots) merged.availablePivots = json.data.availablePivots || [];
      if (!merged.targetTableLabel) merged.targetTableLabel = json.data.targetTableLabel;
    }

    if (merged.total === 0) {
      ElMessage.warning(`Pivot to ${merged.targetTableLabel || link.targetTable} returned 0 rows.`);
    }

    const nextStep = {
      ...merged,
      rows: markRaw(merged.rows),
      tableLabel: merged.targetTableLabel,
      columnLabel: link.targetColumn,
      operator: 'pivot',
      value: `${sourceValues.length} values from "${pivot.fromColumnLabel}"`,
      _uid: nextUid(),
      _joinFromDbColumn: pivot.fromDbColumn,
      _joinToColumn: link.targetColumn,
      _pivotFromStepIdx: stepIdx,
    };

    let branch = false;
    if (stepIdx < chainSteps.value.length - 1) {
      try {
        await ElMessageBox.confirm(
          'Add this pivot as a parallel branch? Cancel will replace the next steps.',
          'Pivot Options',
          {
            confirmButtonText: 'Add Branch',
            cancelButtonText: 'Replace',
            type: 'warning',
            distinguishCancelAndClose: true,
            closeOnClickModal: false,
            closeOnPressEscape: false,
          },
        );
        branch = true;
      } catch (action) {
        if (action === 'cancel') branch = false;
        else return;
      }
    }

    if (branch) {
      const idx = chainSteps.value.length;
      initStepPaging(idx);
      chainSteps.value = [...chainSteps.value, nextStep];
    } else {
      const nextIdx = stepIdx + 1;
      clearStepPagingFrom(nextIdx);
      initStepPaging(nextIdx);
      chainSteps.value = [...chainSteps.value.slice(0, stepIdx + 1), nextStep];
    }

    activeStepIndex.value = chainSteps.value.length - 1;
    ElMessage.success(`Pivot to ${merged.targetTableLabel || link.targetTable}: ${merged.total.toLocaleString()} rows.`);
  } catch (err) {
    console.error(err);
    ElMessage.error('Pivot API connection error.');
  } finally {
    loading.value = false;
  }
}

function removeChainStep(idx) {
  if (idx <= 0 || idx >= chainSteps.value.length) return;
  const nextSteps = chainSteps.value.slice(0, idx);
  clearStepPagingFrom(idx);
  trimCombinedMaster(nextSteps.length);
  chainSteps.value = nextSteps;
  activeStepIndex.value = nextSteps.length ? nextSteps.length - 1 : -1;
  ElMessage.success('Removed chain step.');
}

function getGridColumns(step) {
  let cols = [];
  if (step?.rows?.length) cols = Object.keys(step.rows[0]);
  else {
    const tableKey = step?.targetTable || step?.table;
    const table = tablesMeta.value.find((item) => item.key === tableKey);
    cols = table?.columns ? table.columns.map((col) => col.dbColumn) : [];
  }
  if (step?._hiddenColumns && Array.isArray(step._hiddenColumns)) {
    cols = cols.filter((col) => !step._hiddenColumns.includes(col));
  }
  return cols;
}

function setActiveStep(idx) {
  activeStepIndex.value = idx;
  nextTick(() => {
    const el = document.getElementById(`step-card-${idx}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    el.classList.remove('card-pulse-active');
    void el.offsetWidth;
    el.classList.add('card-pulse-active');
  });
}

function columnLabel(tableKey, key) {
  if (!tableKey || !key) return key;
  const table = tablesMeta.value.find((item) => item.key === tableKey);
  if (!table) return key;
  const col = table.columns.find((item) => item.key === key || item.dbColumn === key);
  return col ? col.label : key;
}

function getStepJoinInfo(step) {
  let parentIdx = step.parentIdx;
  if (parentIdx === undefined) {
    const originalIdx = step.originalIdx !== undefined
      ? step.originalIdx
      : chainSteps.value.findIndex((item) => item._uid === step._uid);
    parentIdx = step._pivotFromStepIdx !== undefined ? step._pivotFromStepIdx : (originalIdx > 0 ? originalIdx - 1 : null);
  }
  if (parentIdx === null || parentIdx < 0) return '';

  const parent = chainSteps.value[parentIdx];
  if (!parent) return '';
  const fromTable = parent.targetTable || parent.table;
  const toTable = step.targetTable || step.table;
  const fromCol = step._joinFromDbColumn;
  const toCol = step._joinToColumn;
  if (!fromCol || !toCol) return 'SN Auto-Match';

  return `${columnLabel(fromTable, fromCol)} -> ${columnLabel(toTable, toCol)}`;
}

// Helper to find the friendly label of a step by its original flat index
function getStepTableName(idx) {
  if (idx === null || idx === undefined || idx < 0) return '';
  const step = chainSteps.value[idx];
  return step ? step.tableLabel : '';
}

const {
  manualCombineMasterIdx,
  combinedPage,
  combinedPageSize,
  combinedFilterText,
  combinedColFilters,
  combinedData,
  combinedCols,
  combinedColSteps,
  combinedColOrigins,
  filteredCombinedData,
  paginatedCombinedData,
  hasActiveCombinedFilters,
  getCombinedRows,
  trimCombinedMaster,
  resetCombinedState,
  clearAllCombinedFilters,
} = useCombinedRows({
  chainSteps,
  tablesMeta,
  getFilteredRows,
  getGridColumns,
});

const totalCombinedRows = computed(() => {
  // Get master table row count (step with most rows that's not marked as combined)
  const masterStep = chainSteps.value
    .filter(s => !s.isCombined)
    .reduce((max, s) => (s.rows?.length || 0) > (max?.rows?.length || 0) ? s : max, null);
  return masterStep?.rows?.length || 0;
});

const isUsingBackendCombine = computed(() => {
  if (combineMode.value === 'backend') return true;
  if (combineMode.value === 'browser') return false;
  // Auto mode: use backend if > 200K rows
  return totalCombinedRows.value > 200000;
});

// Unified combined data accessor (switches between browser/backend)
const activeCombinedData = computed(() => {
  return isUsingBackendCombine.value ? backendCombinedData.value : combinedData.value;
});

const activeCombinedCols = computed(() => {
  return isUsingBackendCombine.value ? backendCombinedCols.value : combinedCols.value;
});

const visibleCombinedCols = ref([]);
const applyingTemplateFavorites = ref(null);

function isFavoriteMatch(colName, favorites) {
  if (!favorites || !favorites.length) return false;
  
  const candidateStepIdx = combinedColSteps.value?.[colName];
  const candidateOrigin = (combinedColOrigins.value?.[colName] || colName).toLowerCase();

  for (const fav of favorites) {
    if (fav === colName) return true;

    // Parse prefix like S1_DO_NO
    const prefixMatch = fav.match(/^S([1-9]\d*)_(.+)$/i);
    if (prefixMatch) {
      const favStepIdx = parseInt(prefixMatch[1], 10) - 1;
      const favOrigin = prefixMatch[2].toLowerCase();
      if (candidateStepIdx === favStepIdx && candidateOrigin === favOrigin) {
        return true;
      }
    } else {
      // Direct origin match for items without prefix
      if (candidateOrigin === fav.toLowerCase()) {
        return true;
      }
    }
  }
  return false;
}

watch(combinedCols, (newCols) => {
  if (applyingTemplateFavorites.value) {
    visibleCombinedCols.value = newCols.filter(c => isFavoriteMatch(c, applyingTemplateFavorites.value));
    applyingTemplateFavorites.value = null; // Reset flag after applying
  } else {
    visibleCombinedCols.value = [...newCols];
  }
}, { immediate: true });

const colSelectorQuery = ref('');
const colSelectorStepFilter = ref(null); // null = all, or step index (0, 1, 2...)

const filteredColsForSelector = computed(() => {
  let cols = combinedCols.value;
  if (colSelectorStepFilter.value !== null) {
    cols = cols.filter(col => getStepIdxForCol(col) === colSelectorStepFilter.value);
  }
  const q = colSelectorQuery.value.trim().toLowerCase();
  if (q) {
    cols = cols.filter(col => col.toLowerCase().includes(q));
  }
  return cols;
});

function showAllFilteredCols() {
  const toAdd = filteredColsForSelector.value.filter(col => !visibleCombinedCols.value.includes(col));
  visibleCombinedCols.value = [...visibleCombinedCols.value, ...toAdd];
}

function hideAllFilteredCols() {
  visibleCombinedCols.value = visibleCombinedCols.value.filter(col => !filteredColsForSelector.value.includes(col));
}

function selectAllInCurrentStep() {
  if (colSelectorStepFilter.value === null) return;
  const stepCols = combinedCols.value.filter(col => getStepIdxForCol(col) === colSelectorStepFilter.value);
  const toAdd = stepCols.filter(col => !visibleCombinedCols.value.includes(col));
  visibleCombinedCols.value = [...visibleCombinedCols.value, ...toAdd];
}

function clearAllInCurrentStep() {
  if (colSelectorStepFilter.value === null) return;
  const stepCols = combinedCols.value.filter(col => getStepIdxForCol(col) === colSelectorStepFilter.value);
  visibleCombinedCols.value = visibleCombinedCols.value.filter(col => !stepCols.includes(col));
}

function getAllColumnsForStep(step) {
  if (step?.rows?.length) return Object.keys(step.rows[0]);
  const tableKey = step?.targetTable || step?.table;
  const table = tablesMeta.value.find((item) => item.key === tableKey);
  return table?.columns ? table.columns.map((col) => col.dbColumn) : [];
}

function toggleColumnVisibilityForStep(stepIdx, col, isVisible) {
  const step = chainSteps.value[stepIdx];
  if (!step) return;
  
  if (!step._hiddenColumns) {
    step._hiddenColumns = [];
  }
  
  if (isVisible) {
    step._hiddenColumns = step._hiddenColumns.filter(c => c !== col);
  } else {
    if (!step._hiddenColumns.includes(col)) {
      step._hiddenColumns.push(col);
    }
  }
  
  // Trigger reactivity update by resetting chainSteps array
  chainSteps.value = [...chainSteps.value];
}

function showAllColumnsForStep(stepIdx) {
  const step = chainSteps.value[stepIdx];
  if (!step) return;
  step._hiddenColumns = [];
  chainSteps.value = [...chainSteps.value];
}

function hideAllColumnsForStep(stepIdx) {
  const step = chainSteps.value[stepIdx];
  if (!step) return;
  const allCols = getAllColumnsForStep(step);
  // Keep the join key or primary column visible so it doesn't break joins visually
  const joinCol = step._joinToColumn || step._joinFromDbColumn || allCols[0];
  step._hiddenColumns = allCols.filter(c => c !== joinCol);
  chainSteps.value = [...chainSteps.value];
}

// Active filters computed property for Badges / Chips
const activeFilterChips = computed(() => {
  const chips = [];
  
  // 1. Column-specific filters from combinedColFilters
  const colFilters = combinedColFilters.value || {};
  Object.keys(colFilters).forEach((col) => {
    const vals = colFilters[col];
    const stepIdx = getStepIdxForCol(col);
    const stepPrefix = stepIdx !== undefined ? `S${stepIdx + 1}` : '';
    let cleanColLabel = col;
    // Strip S1_, S2_, etc. prefix from the column name for clean UX display
    if (stepPrefix && col.startsWith(stepPrefix + '_')) {
      cleanColLabel = col.substring(stepPrefix.length + 1);
    }

    if (isDateColumnName(col)) {
      if (Array.isArray(vals) && vals.length === 2 && vals[0] && vals[1]) {
        chips.push({
          column: col,
          columnLabel: cleanColLabel,
          value: `${vals[0]} ~ ${vals[1]}`,
          stepIdx,
          isGlobal: false,
        });
      }
    } else {
      if (Array.isArray(vals)) {
        vals.forEach((val) => {
          chips.push({
            column: col,
            columnLabel: cleanColLabel,
            value: val,
            stepIdx,
            isGlobal: false,
          });
        });
      } else if (vals && String(vals).trim() !== '') {
        chips.push({
          column: col,
          columnLabel: cleanColLabel,
          value: vals,
          stepIdx,
          isGlobal: false,
        });
      }
    }
  });

  // 2. Global text query search filter
  if (combinedFilterText.value && combinedFilterText.value.trim() !== '') {
    chips.push({
      column: '_global',
      columnLabel: '🔍 ค้นหาทั่วไป',
      value: combinedFilterText.value.trim(),
      stepIdx: undefined,
      isGlobal: true,
    });
  }

  return chips;
});

// Helper to remove a single filter value from the filter state
function removeSingleFilter(column, value, isGlobal = false) {
  if (isGlobal) {
    combinedFilterText.value = '';
    return;
  }
  
  if (isDateColumnName(column)) {
    combinedColFilters.value[column] = null;
    return;
  }
  
  if (combinedColFilters.value[column]) {
    if (Array.isArray(combinedColFilters.value[column])) {
      combinedColFilters.value[column] = combinedColFilters.value[column].filter((v) => v !== value);
    } else {
      combinedColFilters.value[column] = '';
    }
  }
}



// Smart Search / Suggestion Dropdown Filter logic extracted purely from Combined Rows
const colSuggestions = ref({});
const colSuggestionsLoading = ref({});

function calculateColSuggestions(col) {
  if (colSuggestions.value[col]) return; // already calculated!
  
  if (!combinedData.value || !combinedData.value.length) {
    colSuggestions.value[col] = [];
    return;
  }
  
  // Extract unique sorted values and limit to top 500 options for smooth DOM rendering
  const clientVals = combinedData.value.map((row) => row[col]);
  const uniqueClient = [...new Set(clientVals)]
    .map((v) => (v !== null && v !== undefined ? String(v).trim() : ''))
    .filter((v) => v.length > 0);
  
  uniqueClient.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  colSuggestions.value[col] = uniqueClient.slice(0, 500);
}

function handleSelectVisible(col, visible) {
  if (visible) {
    calculateColSuggestions(col);
  }
}

// Clear client cache when combined data changes so it recalculates lazily on click
watch(combinedData, () => {
  colSuggestions.value = {};
});

// Premium Color Palette for dynamic step styling (Pastel bg + matching dark text & borders)
const STEP_THEMES = [
  { bg: '#e6f7ff', border: '#91d5ff', text: '#1890ff', badgeBg: '#bae7ff', badgeText: '#003a8c' }, // Step 1: soft blue
  { bg: '#f6ffed', border: '#b7eb8f', text: '#52c41a', badgeBg: '#d9f7be', badgeText: '#135200' }, // Step 2: soft green
  { bg: '#f9f0ff', border: '#d3adf7', text: '#722ed1', badgeBg: '#efdbff', badgeText: '#391085' }, // Step 3: soft purple
  { bg: '#fffbe6', border: '#ffe58f', text: '#faad14', badgeBg: '#fff1b8', badgeText: '#613b00' }, // Step 4: soft yellow/orange
  { bg: '#e6fffb', border: '#87e8de', text: '#13c2c2', badgeBg: '#b5f5ec', badgeText: '#00474f' }, // Step 5: soft cyan
  { bg: '#fff0f6', border: '#ffadd2', text: '#eb2f96', badgeBg: '#ffd6e7', badgeText: '#780650' }, // Step 6: soft pink
  { bg: '#fff1f0', border: '#ffa39e', text: '#f5222d', badgeBg: '#ffccc7', badgeText: '#5c0011' }, // Step 7: soft red
  { bg: '#f5f5f5', border: '#d9d9d9', text: '#595959', badgeBg: '#f0f0f0', badgeText: '#262626' }, // Step 8: soft grey/slate
];

// Helper to check which step index a column in All Chains Combined table belongs to
function getStepIdxForCol(colName) {
  if (!combinedColSteps.value) return undefined;
  return combinedColSteps.value[colName];
}

// Generate style for the mini tag [S1], [S2] inside table header
function getStepBadgeStyle(stepIdx) {
  if (stepIdx === undefined || stepIdx === null) return {};
  const theme = STEP_THEMES[stepIdx % STEP_THEMES.length];
  return {
    backgroundColor: theme.badgeBg,
    color: theme.badgeText,
    border: `1px solid ${theme.border}`,
    borderRadius: '4px',
    padding: '1px 5px',
    fontSize: '10px',
    fontWeight: 'bold',
    marginRight: '6px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: '1',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
  };
}

// Dynamic header cell styling for the combined table to pastel-highlight the source step
function combinedHeaderCellStyle({ column }) {
  const colName = column.property;
  if (!colName) return {};
  const stepIdx = getStepIdxForCol(colName);
  if (stepIdx !== undefined) {
    const theme = STEP_THEMES[stepIdx % STEP_THEMES.length];
    return {
      backgroundColor: theme.bg,
      borderBottom: `2.5px solid ${theme.border}`,
      color: '#262626',
      transition: 'all 0.3s ease',
    };
  }
  return {};
}

// Style for step badge in each pipeline card header
function getCardStepBadgeStyle(idx) {
  const theme = STEP_THEMES[idx % STEP_THEMES.length];
  return {
    backgroundColor: theme.badgeBg,
    color: theme.badgeText,
    borderColor: theme.border,
    borderWidth: '1.5px',
    borderStyle: 'solid',
    fontWeight: 'bold',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
  };
}

// Accent border and glow for active/hover pipeline cards based on their step theme
function getCardStyle(idx, step) {
  if (step.total === 0) return {};
  const theme = STEP_THEMES[idx % STEP_THEMES.length];
  if (idx === activeStepIndex.value) {
    return {
      borderColor: theme.text,
      boxShadow: `0 6px 26px ${theme.badgeBg}80`,
    };
  }
  return {
    borderColor: theme.border + '50', // translucent accent border for inactive steps
  };
}

// Border, background and active glow for visual branching tree stepper nodes
function getStepperNodeStyle(idx, step) {
  if (step.total === 0) return {};
  const theme = STEP_THEMES[idx % STEP_THEMES.length];
  if (idx === activeStepIndex.value) {
    return {
      borderColor: theme.text,
      backgroundColor: theme.badgeBg + '40', // semi-transparent theme background
      boxShadow: `0 0 12px ${theme.badgeBg}bf`,
    };
  }
  return {
    borderColor: theme.border + 'b0',
    backgroundColor: 'rgba(255,255,255,0.02)',
  };
}

// Branch tags in visual stepper showing which parent step they came from
function getBranchTagStyle(parentIdx) {
  if (parentIdx === null || parentIdx === undefined) return {};
  const theme = STEP_THEMES[parentIdx % STEP_THEMES.length];
  return {
    backgroundColor: theme.badgeBg + ' !important',
    borderColor: theme.border + ' !important',
    color: theme.badgeText + ' !important',
  };
}

const {
  exportDialogVisible,
  exportFormat,
  exportOptions,
  exportStatusClass,
  exportStatusText,
  totalSelectedRows,
  totalSelectedSheets,
  confirmExport,
  exportAll,
  setExportFormat,
  setExportPreset,
  toggleCombinedSelection,
  toggleStepSelection,
} = useExcelExport({
  chainSteps,
  combinedData,
  getFilteredRows,
  getCombinedRows: () => {
    const rawRows = getCombinedRows();
    if (!visibleCombinedCols.value || visibleCombinedCols.value.length === combinedCols.value.length) {
      return rawRows;
    }
    return rawRows.map((row) => {
      const newRow = {};
      visibleCombinedCols.value.forEach((col) => {
        newRow[col] = row[col];
      });
      return newRow;
    });
  },
  loading,
  loadingText,
});

function resetAll() {
  chainSteps.value = [];
  activeStepIndex.value = -1;
  resetStepTracking();
  resetCombinedState();
  searchForm.value = {
    table: '',
    conditions: [
      { column: '', operator: 'like', value: '', value2: '', multiValue: '', dateRange: [] },
    ],
  };
}

// 💾 Save API Endpoint UI dialog states & operations
const saveApiDialogVisible = ref(false);
const API_GROUP_OPTIONS = ['Yield Tracking', 'Coil Traceability', 'PCCA Rework', 'Logistics', 'General'];
const apiForm = ref({
  id: '',
  name: '',
  description: '',
  selectedParams: [],
  apiGroup: 'General',
  visibility: 'public',
  allowedUsers: [],
  saving: false,
});

const apiParameterOptions = computed(() => {
  const options = [];
  const added = new Set();
  
  // 1. Root table columns (without prefix, for DB-level filtering)
  if (chainSteps.value.length > 0) {
    const firstStep = chainSteps.value[0];
    const searchableCols = tablesMeta.value.find(t => t.key === (firstStep.targetTable || firstStep.table))?.columns || [];
    searchableCols.filter(c => c.searchable).forEach(c => {
      const val = c.key;
      if (!added.has(val)) {
        added.add(val);
        options.push({ value: val, label: `${c.label} (Database Query - Fast ⚡)` });
      }
    });
  }
  
  // 2. All combined columns (with prefix, for grid-level filtering)
  combinedCols.value.forEach(col => {
    if (!added.has(col)) {
      added.add(col);
      options.push({ value: col, label: `${col} (In-Memory Filter 🔍)` });
    }
  });
  
  return options;
});
function authHeaders(extra = {}) {
  const h = { ...extra };
  const enHeader = adminUser.value?.en || JSON.parse(localStorage.getItem('sg_admin_user') || 'null')?.en;
  if (enHeader) h['x-user-en'] = String(enHeader);
  return h;
}

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
    
    const res = await fetch(`${API_BASE}/api/v1/trace/api-hr-autocompleted?${paramKey}=${encodeURIComponent(cleanQuery)}`, {
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

function openSaveApiDialog() {
  if (!chainSteps.value.length) {
    ElMessage.warning('กรุณาทำการสืบค้นข้อมูลก่อนสร้าง API');
    return;
  }

  apiForm.value = {
    id: '',
    name: '',
    description: '',
    selectedParams: [], // Default to empty as requested!
    apiGroup: 'General',
    visibility: 'public',
    allowedUsers: [],
    saving: false,
  };
  employeeSuggestions.value = []; // Reset autocomplete options
  saveApiDialogVisible.value = true;
}

async function confirmSaveApi() {
  const idStr = (apiForm.value.id || '').trim();
  const nameStr = (apiForm.value.name || '').trim();
  if (!idStr || !nameStr) {
    ElMessage.warning('กรุณากรอก Endpoint ID และชื่อ Endpoint ให้ครบถ้วน');
    return;
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(idStr)) {
    ElMessage.warning('Endpoint ID ห้ามมีเว้นวรรค หรืออักขระพิเศษ (อนุญาตเฉพาะ a-z, 0-9, -, _)');
    return;
  }

  apiForm.value.saving = true;
  try {
    const firstStep = chainSteps.value[0];
    const hops = chainSteps.value.slice(1).map(step => {
      let parentIdx = step._pivotFromStepIdx;
      if (parentIdx === undefined) parentIdx = chainSteps.value.indexOf(step) - 1;
      return {
        fromColumnKey: step._joinFromDbColumn,
        targetTable: step.targetTable || step.table,
        targetColumn: step._joinToColumn,
        parentStepIdx: parentIdx,
      };
    });

    const rootConditions = [];
    for (let idx = 0; idx < searchForm.value.conditions.length; idx++) {
      const cond = searchForm.value.conditions[idx];
      if (!cond.column) continue;

      const isIn = cond.operator === 'in';
      const isBetween = cond.operator === 'between';
      const isDate = isDateColumn(cond.column);
      let value = '';
      let value2 = '';
      let values = [];

      if (isIn) {
        values = parseMultiValue(cond.multiValue);
      } else if (isBetween) {
        if (isDate) {
          if (cond.dateRange && cond.dateRange.length === 2) {
            [value, value2] = cond.dateRange;
          }
        } else {
          value = (cond.value || '').trim();
          value2 = (cond.value2 || '').trim();
        }
      } else {
        value = (cond.value || '').trim();
      }

      rootConditions.push({
        column: cond.column,
        operator: cond.operator,
        value,
        value2: isBetween ? value2 : undefined,
        values: isIn ? values : undefined,
      });
    }

    const endpointPayload = {
      id: idStr,
      name: nameStr,
      description: apiForm.value.description,
      apiGroup: apiForm.value.apiGroup || 'General',
      visibility: apiForm.value.visibility === 'restricted' ? 'restricted' : 'public',
      allowedUsers: apiForm.value.visibility === 'restricted' ? [...apiForm.value.allowedUsers] : [],
      config: {
        rootTable: firstStep.targetTable || firstStep.table,
        rootColumn: firstStep.columnLabel,
        rootOperator: firstStep.operator,
        rootConditions: [],
        hops,
        visibleCols: [...visibleCombinedCols.value],
        allowedParams: [...apiForm.value.selectedParams],
      },
    };

    const headersOut = { 'Content-Type': 'application/json' };
    const enHeader = adminUser.value?.en || JSON.parse(localStorage.getItem('sg_admin_user') || 'null')?.en;
    if (enHeader) headersOut['x-user-en'] = String(enHeader);

    const res = await fetch(`${API_BASE}/api/v1/endpoints`, {
      method: 'POST',
      headers: headersOut,
      body: JSON.stringify(endpointPayload),
    });
    const data = await res.json();
    if (data.success) {
      ElMessageBox.alert(
        `สร้าง API Endpoint "${nameStr}" สำเร็จ!<br/><br/><strong>ลิงก์ดึงข้อมูล (PowerBI / Excel):</strong><br/><code style="word-break:break-all; background:#f4f4f5; padding:8px; border-radius:4px; display:block; margin:6px 0;">${API_BASE}/api/v1/trace/${idStr}?format=csv</code>`,
        'สำเร็จ (Success)',
        { confirmButtonText: 'ตกลง', dangerouslyUseHTMLString: true, type: 'success' }
      );
      saveApiDialogVisible.value = false;
    } else {
      ElMessage.error(data.message || 'สร้าง API ล้มเหลว');
    }
  } catch (e) {
    console.error(e);
    ElMessage.error('เชื่อมต่อเซิร์ฟเวอร์ล้มเหลว');
  } finally {
    apiForm.value.saving = false;
  }
}

</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

/* ── Global ────────────────────────────────────────────────────────────────── */
.pivot-app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-app);
  color: var(--text-primary);
  font-family: 'Inter', sans-serif;
}

/* ── Header ────────────────────────────────────────────────────────────────── */
.app-header {
  background: linear-gradient(135deg, hsl(218, 75%, 18%) 0%, hsl(230, 70%, 12%) 100%);
  color: white;
  padding: 0 28px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.25);
  position: sticky;
  top: 0;
  z-index: 200;
}
.header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 0;
}
.header-brand      { display: flex; align-items: center; gap: 14px; }
.header-icon       { font-size: 2rem; }
.header-brand h1   { margin: 0; font-size: 1.3rem; font-weight: 700; }
.header-brand p    { margin: 0; font-size: 0.78rem; opacity: 0.65; }
.header-stats      { display: flex; align-items: center; }

/* Elegant Admin & Guest indicator pills */
.admin-pill-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.22);
  color: #ef4444;
  padding: 6px 14px;
  border-radius: 9999px;
  font-size: 0.74rem;
  font-weight: 700;
  margin-right: 12px;
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.03);
}
.admin-pill-indicator .logout-link-btn {
  font-size: 0.7rem !important;
  color: #ef4444 !important;
  padding: 0 !important;
  margin-left: 4px;
  font-weight: 700;
}
.guest-pill-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(148, 163, 184, 0.08);
  border: 1px solid rgba(148, 163, 184, 0.2);
  color: #64748b;
  padding: 6px 14px;
  border-radius: 9999px;
  font-size: 0.74rem;
  font-weight: 700;
  margin-right: 12px;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
}
.guest-pill-indicator:hover {
  background: rgba(148, 163, 184, 0.16);
  border-color: rgba(148, 163, 184, 0.35);
  transform: translateY(-1px);
}

/* ── App Body ──────────────────────────────────────────────────────────────── */
.app-body {
  display: flex;
  gap: 20px;
  padding: 24px;
  flex: 1;
  align-items: flex-start;
  overflow: hidden;
}

/* ── Search Panel & Conditions ────────────────────────────────────────────── */
.search-panel {
  width: 420px;
  flex-shrink: 0;
  border-radius: 14px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.1);
  height: fit-content;
}
.panel-header { font-weight: 600; }

.conditions-container {
  margin-top: 14px;
  border-top: 1px solid #ebeef5;
  padding-top: 14px;
}

.conditions-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.conditions-title {
  font-size: 0.82rem;
  font-weight: 600;
  color: #303133;
}

.condition-row-card {
  background: #f8f9fa;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
  position: relative;
  transition: all 0.2s ease;
}

.condition-row-card:hover {
  border-color: #c0c4cc;
  background: #ffffff;
  box-shadow: 0 2px 10px rgba(0,0,0,0.04);
}

.condition-row-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  border-bottom: 1px dashed #ebeef5;
  padding-bottom: 6px;
}

.condition-row-num {
  font-size: 0.75rem;
  font-weight: 700;
  color: #909399;
}

.remove-cond-btn {
  font-size: 0.75rem;
}

.condition-field {
  margin-bottom: 8px;
}

.condition-field:last-child {
  margin-bottom: 0;
}

.field-label {
  display: block;
  font-size: 0.72rem;
  font-weight: 600;
  color: #606266;
  margin-bottom: 4px;
}

/* ── Right Panel ───────────────────────────────────────────────────────────── */
.right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow: hidden;
}

.combined-card {
  flex-shrink: 0;
  border-color: #409eff;
  box-shadow: 0 4px 20px rgba(64, 158, 255, 0.16);
}

/* ── Pipeline Grid (3 per row) ─────────────────────────────────────────────── */
.pipeline-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
  align-items: start;
  overflow-y: auto;
  padding-bottom: 20px; /* space at bottom */
}

/* ── Pipeline Card ─────────────────────────────────────────────────────────── */
.pipeline-card {
  background: var(--bg-card);
  border-radius: 14px;
  box-shadow: 0 4px 14px var(--shadow-color);
  border: 2px solid var(--border-color);
  display: flex;
  flex-direction: column;
  transition: all 0.2s ease;
  position: relative;
}
.pipeline-card--chain-loading {
  border-color: #409eff;
  box-shadow: 0 6px 22px rgba(64,158,255,0.20);
}
.pipeline-card--chain-error {
  border: 2px solid #f56c6c;
  box-shadow: 0 6px 22px rgba(245,108,108,0.18);
}
.chain-loading-overlay {
  position: absolute;
  inset: 0;
  background: var(--bg-overlay);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-weight: 600;
  color: #409eff;
  z-index: 5;
  border-radius: 14px;
}
.pipeline-card:hover {
  border-color: #a0cfff;
  box-shadow: 0 6px 22px rgba(64,158,255,0.14);
}
.pipeline-card--active {
  border-color: #409eff;
  box-shadow: 0 6px 26px rgba(64,158,255,0.24);
}
.pipeline-card--empty {
  border: 2px dashed #f56c6c;
  box-shadow: 0 4px 14px rgba(245,108,108,0.06);
}
.pipeline-card--empty:hover {
  border-color: #f56c6c;
  box-shadow: 0 6px 22px rgba(245,108,108,0.12);
}
.pipeline-card--empty .card-header {
  background: linear-gradient(135deg, hsl(354, 45%, 30%) 0%, hsl(354, 50%, 22%) 100%);
}

/* Card Header */
.card-header {
  background: linear-gradient(135deg, hsl(218, 60%, 22%) 0%, hsl(225, 65%, 18%) 100%);
  color: white;
  padding: 13px 15px 10px;
  border-radius: 12px 12px 0 0;
  cursor: pointer;
  user-select: none;
}
.card-header-top {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 8px;
}
.card-step-badge {
  width: 24px; height: 24px;
  background: rgba(255,255,255,0.2);
  border: 1.5px solid rgba(255,255,255,0.45);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.78rem; font-weight: 700; flex-shrink: 0;
}
.card-title-block { display: flex; flex-direction: column; gap: 1px; overflow: hidden; flex: 1; }
.card-table-name  { font-weight: 700; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card-row-count   { font-size: 0.72rem; opacity: 0.72; }
.filtered-label   { color: #ffd04b; }

.card-chip {
  display: flex; align-items: center; gap: 5px;
  background: rgba(255,255,255,0.12);
  border-radius: 20px; padding: 3px 10px;
  width: fit-content; max-width: 100%;
  font-size: 0.72rem; overflow: hidden;
}
.chip-col { color: rgba(255,255,255,0.6); }
.chip-op  { color: #79bbff; font-weight: 600; }
.chip-val { color: white; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px; }

/* Card Body */
.card-body { padding: 12px; flex: 1; }

/* Card Footer */
.card-footer {
  border-top: 1px solid #f0f0f0;
  padding: 10px 13px;
  background: #fafafa;
  border-radius: 0 0 12px 12px;
}
.pivot-label {
  font-size: 0.68rem; font-weight: 700;
  color: #909399; text-transform: uppercase;
  letter-spacing: 0.5px; margin-bottom: 7px;
}
.pivot-buttons { display: flex; flex-wrap: wrap; gap: 6px; }

/* ── Empty State ───────────────────────────────────────────────────────────── */
.empty-state {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 12px; padding-top: 80px;
}
.empty-hint { font-size: 0.83rem; color: #b0b5be; text-align: center; }

/* ── IN Operator Input ──────────────────────────────────────────────────────── */
.in-input-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}
.in-hint {
  display: flex;
  align-items: center;
}

.range-inputs-block {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}
.range-separator {
  color: #909399;
  font-weight: bold;
  margin: 0 4px;
}

/* ── Global Notice Bar (Top of Right Panel) ────────────────────────────────── */
.global-notice-bar {
  background: rgba(230, 162, 60, 0.08);
  border: 1px solid rgba(230, 162, 60, 0.25);
  border-radius: 12px;
  padding: 10px 16px;
  margin-bottom: 16px;
  transition: all 0.25s ease;
}
.notice-bar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
}
.notice-bar-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  color: #e6a23c;
  flex: 1;
  min-width: 0;
}
.notice-icon { font-size: 1rem; }
.notice-title { font-weight: 700; flex-shrink: 0; }
.notice-inline-text {
  opacity: 0.85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 0.76rem;
}
.notice-bar-details {
  margin-top: 10px;
  border-top: 1px dashed rgba(230, 162, 60, 0.2);
  padding-top: 10px;
}
.precaution-list {
  margin: 0;
  padding-left: 18px;
  font-size: 0.74rem;
  color: #606266;
  line-height: 1.55;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.precaution-list li {
  margin-bottom: 0;
}
.precaution-list strong {
  color: #303133;
}

/* ── Horizontal Visual Chain Progress Stepper ───────────────────────────────── */
.horizontal-stepper {
  background: linear-gradient(135deg, #1e2638 0%, #171d2b 100%);
  border: 1px solid #2e3952;
  border-radius: 14px;
  padding: 14px 18px;
  margin-bottom: 18px;
  box-shadow: 0 4px 18px rgba(0,0,0,0.15);
}
.stepper-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.stepper-title {
  font-size: 0.85rem;
  font-weight: 700;
  color: #e6e8eb;
}
.stepper-hint {
  font-size: 0.72rem;
  color: #909399;
}
.stepper-flow {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.stepper-node {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(255,255,255,0.04);
  border: 1.5px solid #2e3952;
  border-radius: 10px;
  padding: 8px 14px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  user-select: none;
  min-width: 170px;
}
.stepper-node:hover {
  background: rgba(255,255,255,0.08);
  border-color: #409eff;
  transform: translateY(-1px);
}
.stepper-node-remove-btn {
  margin-left: auto;
  color: rgba(255, 255, 255, 0.4) !important;
  font-size: 0.85rem !important;
  padding: 2px !important;
  transition: all 0.2s ease !important;
  z-index: 2;
}
.stepper-node-remove-btn:hover {
  color: #f56c6c !important;
  transform: scale(1.2);
}
.pipeline-card-remove-btn {
  color: rgba(255, 255, 255, 0.6) !important;
  font-size: 0.9rem !important;
  transition: all 0.2s ease !important;
}
.pipeline-card-remove-btn:hover {
  color: #f56c6c !important;
  transform: scale(1.2);
}
.stepper-node--active {
  background: rgba(64,158,255,0.08);
  border-color: #409eff;
  box-shadow: 0 0 12px rgba(64,158,255,0.25);
}
.stepper-node--empty {
  border-color: rgba(245,108,108,0.4);
  background: rgba(245,108,108,0.02);
}
.stepper-node--empty:hover {
  border-color: #f56c6c;
}
.node-badge {
  font-size: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
.node-content {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.node-header {
  display: flex;
  align-items: center;
  gap: 6px;
}
.node-num {
  font-size: 0.68rem;
  font-weight: 700;
  color: #409eff;
}
.stepper-node--empty .node-num {
  color: #f56c6c;
}
.node-label {
  font-size: 0.8rem;
  font-weight: 700;
  color: #e6e8eb;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 110px;
}
.node-details {
  font-size: 0.72rem;
}
.node-status-text.success {
  color: #67c23a;
  font-weight: 600;
}
.node-status-text.success.rows--filtered {
  color: #e6a23c;
}
.node-status-text.error {
  color: #f56c6c;
  font-weight: 700;
}
.stepper-connector {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #409eff;
  font-weight: bold;
  font-size: 1.1rem;
}

/* ── Stepper Tree Flow Layout ─────────────────────────────────────────── */
.stepper-flow-tree {
  display: flex;
  align-items: stretch;
  flex-wrap: wrap;
  gap: 16px;
  background: rgba(255, 255, 255, 0.01);
  padding: 12px;
  border-radius: 12px;
  border: 1px dashed rgba(255, 255, 255, 0.05);
}

.stepper-column {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stepper-column-nodes {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 12px;
  min-height: 80px;
}

.stepper-column-connector {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #409eff;
  font-weight: bold;
  font-size: 1.2rem;
  padding: 0 4px;
}

/* Branched nodes special styling */
.stepper-node--branch {
  border-color: rgba(180, 100, 240, 0.35);
  background: linear-gradient(135deg, rgba(140, 80, 220, 0.05) 0%, rgba(140, 80, 220, 0.02) 100%);
  position: relative;
}

.stepper-node--branch:hover {
  border-color: #a855f7;
  background: linear-gradient(135deg, rgba(140, 80, 220, 0.08) 0%, rgba(140, 80, 220, 0.04) 100%);
}

.stepper-node--branch.stepper-node--active {
  background: linear-gradient(135deg, rgba(140, 80, 220, 0.1) 0%, rgba(140, 80, 220, 0.05) 100%);
  border-color: #c084fc;
  box-shadow: 0 0 12px rgba(168, 85, 247, 0.25);
}

.node-branch-tag {
  font-size: 10px !important;
  height: 18px !important;
  line-height: 16px !important;
  padding: 0 6px !important;
  border-radius: 4px !important;
  margin-left: 6px;
  background-color: rgba(168, 85, 247, 0.1) !important;
  border-color: rgba(168, 85, 247, 0.3) !important;
  color: #c084fc !important;
}

.node-join-key-info {
  font-size: 0.68rem;
  color: #79bbff;
  opacity: 0.85;
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 150px;
}

.stepper-node--branch .node-join-key-info {
  color: #c084fc;
}

.key-icon {
  font-size: 0.72rem;
}

.chip-join-key {
  margin-left: auto;
  font-size: 10px;
  font-weight: bold;
  color: #67c23a;
  background: rgba(103, 194, 58, 0.1);
  border: 1px solid rgba(103, 194, 58, 0.2);
  padding: 2px 6px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* Stepper Premium Tooltip styling */
.stepper-tooltip-content {
  padding: 6px 4px;
  max-width: 320px;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}

.tooltip-title {
  font-weight: 700;
  font-size: 0.78rem;
  color: #409eff;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 4px;
}

.tooltip-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  font-size: 0.72rem;
  line-height: 1.4;
  margin-bottom: 4px;
}

.tooltip-label {
  color: rgba(255, 255, 255, 0.6);
  font-weight: 500;
}

.tooltip-val {
  color: #e6e8eb;
  font-weight: 600;
}

.tooltip-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 6px 0;
}

.tooltip-row.highlight-row {
  background: rgba(64, 158, 255, 0.1);
  padding: 4px 6px;
  border-radius: 4px;
  border: 1px solid rgba(64, 158, 255, 0.2);
}

.tooltip-row.highlight-row .tooltip-label {
  color: #79bbff;
}

.tooltip-row.highlight-row .val-key {
  color: #67c23a;
  font-weight: 700;
}

/* Custom Axis Selector Styling */
.custom-axis-select :deep(.el-input__wrapper) {
  background-color: rgba(255, 255, 255, 0.06) !important;
  border: 1px solid rgba(255, 255, 255, 0.15) !important;
  box-shadow: none !important;
  transition: all 0.2s ease;
}

.custom-axis-select :deep(.el-input__wrapper):hover {
  background-color: rgba(255, 255, 255, 0.1) !important;
  border-color: #409eff !important;
}

.custom-axis-select :deep(.el-input__inner) {
  color: #ffffff !important;
  font-weight: 500;
  font-size: 0.75rem;
}

.custom-axis-select :deep(.el-select__caret) {
  color: rgba(255, 255, 255, 0.6) !important;
}

@keyframes pulseGlow {
  0% {
    transform: scale(1);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
  }
  50% {
    transform: scale(1.025);
    box-shadow: 0 8px 30px rgba(64, 158, 255, 0.35);
    border-color: #409eff;
  }
  100% {
    transform: scale(1);
    box-shadow: 0 6px 26px rgba(64, 158, 255, 0.24);
  }
}

.card-pulse-active {
  animation: pulseGlow 0.65s cubic-bezier(0.25, 0.8, 0.25, 1) forwards;
}

/* ── Spin ──────────────────────────────────────────────────────────────────── */
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.spin { animation: spin 1s linear infinite; }

/* ── Export Dialog ────────────────────────────────────────────────────────── */
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
.export-warning-banner .warning-icon {
  font-size: 1.4rem;
}
.export-warning-banner strong {
  color: #e6a23c;
  font-size: 0.88rem;
  display: block;
  margin-bottom: 4px;
}
.export-warning-banner p {
  margin: 0;
  font-size: 0.78rem;
  color: #8c6f3d;
  line-height: 1.4;
}

.export-preset-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.section-title {
  font-size: 0.82rem;
  font-weight: 700;
  color: #606266;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.preset-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.export-selector-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sheet-select-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 8px;
  background: var(--bg-condition-card);
}

.sheet-select-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.sheet-select-item:hover {
  border-color: #c0c4cc;
  background: var(--bg-hover);
}
.sheet-select-item.is-selected {
  border-color: #409eff;
  background: var(--bg-current-row);
}
.sheet-select-item.combined-item.is-selected {
  border-color: #409eff;
  background: var(--bg-current-row);
}
.sheet-select-item.is-empty {
  opacity: 0.6;
}

.sheet-icon {
  font-size: 1.2rem;
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
.summary-row strong {
  font-size: 0.9rem;
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

/* ── Staircase Drill-Down Guide ────────────────────────────────────────────── */
.staircase-guide-container {
  max-width: 1040px;
  width: 95%;
  background: var(--bg-card);
  border-radius: 16px;
  padding: 30px;
  box-shadow: 0 8px 30px var(--shadow-color);
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  animation: fadeIn 0.4s ease;
}

.staircase-guide-header {
  text-align: center;
  margin-bottom: 30px;
}
.guide-badge {
  background: #ecf5ff;
  color: #409eff;
  font-size: 0.76rem;
  font-weight: 700;
  padding: 6px 12px;
  border-radius: 20px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: inline-block;
  margin-bottom: 12px;
}
.staircase-guide-header h2 {
  font-size: 1.45rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 10px 0;
}
.staircase-guide-header p {
  font-size: 0.88rem;
  color: var(--text-secondary);
  margin: 0;
  max-width: 760px;
  line-height: 1.5;
}

.staircase-steps {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  margin-bottom: 24px;
}

.staircase-step-card {
  flex: 1;
  background: var(--bg-condition-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  min-height: 270px;
  transition: all 0.25s ease;
  position: relative;
}
.staircase-step-card:hover {
  transform: translateY(-5px);
  border-color: #c6e2ff;
  box-shadow: 0 8px 20px rgba(64, 158, 255, 0.08);
  background: var(--bg-card);
}

.staircase-icon-wrapper {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  position: relative;
  box-shadow: 0 4px 10px rgba(0,0,0,0.1);
}
.staircase-icon-wrapper .step-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #f56c6c;
  color: white;
  font-size: 0.68rem;
  font-weight: 700;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid white;
}
.step-icon-symbol {
  font-size: 1.35rem;
}

.staircase-step-card h3 {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 10px 0;
  line-height: 1.35;
}
.staircase-step-card h3 .highlight {
  color: #409eff;
  font-size: 0.78rem;
  font-weight: 600;
}
.staircase-step-card p {
  font-size: 0.74rem;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.5;
}

.staircase-arrow {
  font-size: 1.5rem;
  color: #dcdfe6;
  font-weight: bold;
  user-select: none;
  animation: pulseArrow 1.5s infinite ease-in-out;
}

.staircase-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-condition-card);
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 0.78rem;
  color: var(--text-secondary);
}
.staircase-footer .info-icon {
  font-size: 1rem;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes pulseArrow {
  0%, 100% { transform: translateX(0); opacity: 0.5; }
  50% { transform: translateX(4px); opacity: 1; }
}

@media (max-width: 900px) {
  .staircase-steps {
    flex-direction: column;
    gap: 16px;
  }
  .staircase-arrow {
    transform: rotate(90deg);
    animation: pulseArrowY 1.5s infinite ease-in-out;
  }
}

@keyframes pulseArrowY {
  0%, 100% { transform: rotate(90deg) translateX(0); opacity: 0.5; }
  50% { transform: rotate(90deg) translateX(4px); opacity: 1; }
}

/* ── Export Format Cards ── */
.format-options-group {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 8px;
}
.format-card {
  background: var(--bg-card);
  border: 2px solid var(--border-color);
  border-radius: 12px;
  padding: 14px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 120px;
  position: relative;
  overflow: hidden;
}
.format-card:hover {
  border-color: #c0c4cc;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}
.format-card.is-selected {
  border-color: #409eff;
  background: var(--bg-current-row);
  box-shadow: 0 4px 14px rgba(64, 158, 255, 0.15);
}
.format-card.is-selected .format-extension {
  color: #409eff;
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
  color: var(--text-secondary);
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
.format-card-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.format-card-body strong {
  font-size: 0.82rem;
  color: var(--text-primary);
}
.format-card-body p {
  margin: 0;
  font-size: 0.72rem;
  color: var(--text-secondary);
  line-height: 1.35;
}
/* ── Onboarding & Philosophy Styles ── */
.header-ph-btn {
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  border-color: rgba(230, 162, 60, 0.4) !important;
  background: rgba(230, 162, 60, 0.06) !important;
  color: #e6a23c !important;
  font-weight: 600 !important;
}
.header-ph-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 0 10px rgba(230, 162, 60, 0.3);
  background: rgba(230, 162, 60, 0.15) !important;
  border-color: #e6a23c !important;
}

/* Sidebar Philosophy Card */
.philosophy-sidebar-card {
  margin-top: 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  transition: all 0.2s ease;
}
.philosophy-sidebar-card:hover {
  border-color: #c0c4cc;
  box-shadow: 0 4px 12px rgba(0,0,0,0.06);
}
.philosophy-sidebar-header {
  padding: 10px 14px;
  background: var(--bg-condition-card);
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid var(--border-color);
}
.ph-header-title {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-secondary);
}
.ph-collapse-arrow {
  font-size: 0.8rem;
  color: #909399;
  transition: transform 0.2s ease;
}
.ph-collapse-arrow.is-active {
  transform: rotate(180deg);
}
.philosophy-sidebar-body {
  padding: 12px 14px;
  font-size: 0.74rem;
  color: var(--text-secondary);
  line-height: 1.45;
  background: var(--bg-card);
}
.philosophy-sidebar-body p {
  margin: 0 0 10px 0;
}
.ph-mini-comparison {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 8px;
}
.ph-mini-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.68rem;
  font-weight: 500;
  line-height: 1.2;
}
.ph-mini-badge.bad {
  background: #fff5f5;
  color: #f56c6c;
  border: 1.5px solid #ffe3e3;
}
.ph-mini-badge.good {
  background: #f0f9eb;
  color: #67c23a;
  border: 1.5px solid #e1f3d8;
}
.ph-learn-more-btn {
  font-size: 0.74rem;
  font-weight: bold;
}

/* Philosophy Main Dialog */
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
:deep(.philosophy-dialog .el-dialog__title) {
  color: white;
  font-weight: 700;
  font-size: 1.3rem;
}
:deep(.philosophy-dialog .el-dialog__headerbtn .el-dialog__close) {
  color: white;
  font-size: 1.35rem;
}
:deep(.philosophy-dialog .el-dialog__body) {
  padding: 28px !important;
}

.ph-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* Intro block */
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
  box-shadow: 0 4px 12px rgba(64,158,255,0.15);
  animation: floatIcon 3s infinite ease-in-out;
}
@keyframes floatIcon {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}
.ph-intro-text h3 {
  margin: 0 0 6px 0;
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

/* Side-by-Side Comparison */
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
  position: relative;
  transition: all 0.25s ease;
}
.ph-card:hover {
  transform: translateY(-2px);
}
.traditional-card {
  border-color: #fde2e2;
  background: #fffcfc;
}
.traditional-card:hover {
  box-shadow: 0 6px 20px rgba(245,108,108,0.08);
}
.smart-card {
  border-color: #e1f3d8;
  background: #fcfdfb;
}
.smart-card:hover {
  box-shadow: 0 6px 20px rgba(103,194,58,0.08);
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
  margin: 0 0 14px 0;
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
.ph-card-points li {
  margin-bottom: 0;
}
.ph-card-points strong {
  color: #1a202c;
}

/* Visual timeline flow simulation */
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
  transition: all 0.25s ease;
  min-height: 110px;
}
.ph-flow-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 10px rgba(0,0,0,0.05);
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

/* Custom styled step types */
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
  user-select: none;
  animation: visualPulseArrow 1.5s infinite ease-in-out;
}
@keyframes visualPulseArrow {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}
  
.ph-flow-footer {
  background: #ecf5ff;
  border-radius: 8px;
  padding: 10px 16px;
  font-size: 0.82rem;
  color: #409eff;
  line-height: 1.5;
}

@media (max-width: 768px) {
  .ph-comparison-grid {
    grid-template-columns: 1fr;
  }
  .ph-flow-steps {
    flex-direction: column;
    gap: 12px;
  }
  .ph-flow-arrow {
    transform: rotate(90deg);
  }
}

/* ── Column specific filtering styles ── */
.col-filter-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px 0;
  width: 100%;
}
.col-filter-label {
  font-weight: 700;
  font-size: 0.8rem;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.col-filter-input :deep(.el-input__wrapper) {
  background-color: #ffffff;
  border: 1px solid #dcdfe6;
  box-shadow: none !important;
  border-radius: 4px;
  padding: 0 6px;
  transition: all 0.2s ease-in-out;
}
.col-filter-input :deep(.el-input__wrapper):hover {
  border-color: #409eff;
}
.col-filter-input :deep(.el-input__wrapper.is-focus) {
  border-color: #409eff;
  background-color: #ffffff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.1) !important;
}
.col-filter-input :deep(.el-input__inner) {
  font-size: 0.72rem;
  height: 24px;
  line-height: 24px;
  color: #303133;
}
.col-filter-input :deep(.el-input__inner)::placeholder {
  color: #c0c4cc;
  font-style: italic;
}
.col-filter-input :deep(.el-input__clear) {
  font-size: 10px;
  line-height: 24px;
}

/* ── Active Filters Chips Bar ── */
.active-filters-chips-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: rgba(0, 0, 0, 0.02);
  border: 1px dashed rgba(64, 158, 255, 0.25);
  padding: 10px 14px;
  border-radius: 8px;
  margin-bottom: 12px;
  width: 100%;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.03);
}

.active-filters-label {
  font-size: 0.74rem;
  font-weight: 700;
  color: #5a6578;
}

.active-filters-list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.filter-chip {
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 0.74rem;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.filter-chip:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
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

/* ── Recent Searches History ── */
.search-history-panel {
  background: #ffffff;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
}

.history-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: #f5f7fa;
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid #e4e7ed;
  transition: background 0.2s;
}

.history-panel-header:hover {
  background: #ebeef5;
}

.history-title {
  font-size: 0.8rem;
  font-weight: 700;
  color: #303133;
}

.history-collapse-arrow {
  font-size: 12px;
  color: #909399;
  transition: transform 0.3s ease;
}

.history-collapse-arrow.is-active {
  transform: rotate(180deg);
}

.history-panel-body {
  padding: 12px;
  max-height: 320px;
  overflow-y: auto;
}

.history-empty {
  font-size: 0.76rem;
  color: #909399;
  text-align: center;
  padding: 10px 0;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-item {
  background: #fafafa;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.history-item-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.7rem;
}

.history-item-time {
  color: #909399;
}

.history-item-table {
  font-weight: 700;
  color: #409eff;
  background: rgba(64, 158, 255, 0.1);
  padding: 1px 6px;
  border-radius: 4px;
}

.history-item-conds {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-family: monospace;
  font-size: 0.72rem;
  background: #f4f4f5;
  padding: 4px 6px;
  border-radius: 4px;
  border-left: 3px solid #e4e7ed;
  color: #5e6d82;
  word-break: break-all;
}

.history-cond-line {
  display: flex;
  gap: 4px;
}

.cond-col {
  font-weight: bold;
  color: #409eff;
}

.cond-op {
  color: #e6a23c;
}

.cond-val {
  color: #67c23a;
}

.history-item-actions {
  margin-top: 4px;
}

/* ── Quick Paste Box ── */
.quick-paste-box {
  background: #ffffff;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
}

.qp-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #fafafa;
  border-bottom: 1px solid #ebeef5;
}

.qp-title {
  font-size: 0.78rem;
  font-weight: 700;
  color: #303133;
}

.qp-body {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.qp-match-info {
  background: #fafafa;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  padding: 8px;
  margin-top: 4px;
}

.qp-status {
  font-size: 11px;
  line-height: 1.5;
  display: block;
}

.qp-status.matched {
  color: #2f7c1d;
  background: rgba(103, 194, 58, 0.05);
  padding: 6px;
  border-radius: 4px;
  border: 1px dashed rgba(103, 194, 58, 0.25);
}

.qp-status.no-match {
  color: #b88230;
  background: rgba(230, 162, 60, 0.05);
  padding: 6px;
  border-radius: 4px;
  border: 1px dashed rgba(230, 162, 60, 0.25);
}

/* ── Rule Editor Card in Dialog ── */
.rule-editor-card {
  transition: all 0.2s ease;
}

.rule-editor-card:hover {
  border-color: #409eff !important;
  box-shadow: 0 2px 12px 0 rgba(64, 158, 255, 0.1);
}

/* ── Quick Paste Multiple Routing Selector ── */
.qp-route-option {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #ffffff;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.qp-route-option:hover {
  border-color: #c6e2ff;
  background: #fdfdfd;
}

.qp-route-option.is-active {
  border-color: #67c23a;
  background: #f0f9eb;
}

.qp-route-radio {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid #dcdfe6;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.qp-route-option.is-active .qp-route-radio {
  border-color: #67c23a;
}

.qp-radio-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: transparent;
  transition: all 0.2s ease;
}

.qp-route-option.is-active .qp-radio-dot {
  background: #67c23a;
}

.qp-route-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  font-size: 11px;
  line-height: 1.3;
  text-align: left;
}

.qp-route-path {
  color: #909399;
  font-size: 10px;
}

.qp-route-option.is-active .qp-route-path {
  color: #2f7c1d;
}

/* ── High-Performance Drag & Drop & Upload Styles ── */
.quick-paste-box.is-dragging {
  border-color: #67c23a;
  box-shadow: 0 0 12px rgba(103, 194, 58, 0.2);
}

.qp-drag-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.95);
  border: 2px dashed #67c23a;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  backdrop-filter: blur(2px);
  animation: qp-pulse-border 1.5s infinite ease-in-out;
}

@keyframes qp-pulse-border {
  0% { border-color: rgba(103, 194, 58, 0.6); }
  50% { border-color: rgba(103, 194, 58, 1); }
  100% { border-color: rgba(103, 194, 58, 0.6); }
}

.qp-drag-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 6px;
  padding: 16px;
}

.qp-drag-icon {
  font-size: 28px;
  animation: qp-bounce 1s infinite alternate;
}

@keyframes qp-bounce {
  from { transform: translateY(0); }
  to { transform: translateY(-6px); }
}

.qp-drag-sub {
  font-size: 10px;
  color: #909399;
}

.qp-file-loaded-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #f0f9eb;
  border: 1px solid #c2e7b0;
  border-radius: 6px;
  padding: 8px 12px;
  margin-bottom: 2px;
  box-shadow: 0 1px 4px rgba(103, 194, 58, 0.08);
}

.qp-file-info {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  flex: 1;
}

.qp-file-icon {
  font-size: 20px;
}

.qp-file-meta {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  text-align: left;
}

.qp-file-name {
  font-size: 11px;
  font-weight: bold;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qp-file-count {
  font-size: 10px;
  color: #67c23a;
  font-weight: 600;
}

.in-file-loaded-alert {
  display: flex;
  align-items: center;
  background: #f0f9eb;
  border: 1px solid #c2e7b0;
  border-radius: 6px;
  padding: 8px 12px;
  width: 100%;
}

/* ── Copy-on-Click Pointer Cursor ── */
:deep(.el-table .cell) {
  cursor: pointer !important;
}

/* ── Sticky Left Columns Solid Background Overwrites ── */
:deep(.el-table__fixed-left) {
  box-shadow: 6px 0 10px -4px rgba(0, 0, 0, 0.15) !important;
  z-index: 4 !important;
}

:deep(.el-table__fixed-left .el-table__cell) {
  background-color: var(--bg-card) !important;
  opacity: 1 !important;
  z-index: 5 !important;
}

/* Ensure alternating row colors (stripes) retain solid backgrounds in sticky columns */
:deep(.el-table--striped .el-table__row--striped .el-table__cell) {
  background-color: var(--bg-stripe) !important;
}

/* Row hover highlight colors for sticky columns */
:deep(.el-table__body tr.hover-row > td.el-table__cell) {
  background-color: var(--bg-hover) !important;
}

:deep(.el-table__body tr.current-row > td.el-table__cell) {
  background-color: var(--bg-current-row) !important;
}
</style>



