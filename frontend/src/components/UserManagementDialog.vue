<template>
  <el-dialog
    :model-value="modelValue"
    title="👤 การจัดการสิทธิ์ผู้ใช้งาน (User Permission Manager)"
    width="800px"
    class="user-management-dialog"
    destroy-on-close
    align-center
    @update:model-value="$emit('update:modelValue', $event)"
    @open="loadUsers"
  >
    <div v-loading="loading" class="dialog-body-container">
      <!-- Top Form: Add / Edit User -->
      <div class="user-form-panel">
        <h4 class="form-title">{{ isEditing ? '📝 แก้ไขข้อมูลผู้ใช้งาน' : '✨ เพิ่มผู้ใช้งานใหม่' }}</h4>
        <el-form :inline="true" :model="userForm" class="user-inline-form">
          <el-form-item label="รหัสพนักงาน (EN)" required>
            <el-select
              v-if="!isEditing"
              v-model="userForm.en"
              filterable
              remote
              allow-create
              default-first-option
              reserve-keyword
              placeholder="เช่น 12345"
              :remote-method="remoteSearchEmployees"
              :loading="searchLoading"
              style="width: 200px;"
              @change="handleEmployeeSelect"
            >
              <el-option
                v-for="item in employeeSuggestions"
                :key="item.en"
                :label="item.en"
                :value="item.en"
              >
                <span>{{ item.display }}</span>
              </el-option>
            </el-select>
            <el-input
              v-else
              v-model="userForm.en"
              disabled
              style="width: 150px;"
            />
          </el-form-item>
          <el-form-item label="ชื่อ-นามสกุล" required>
            <el-input
              v-model="userForm.name"
              placeholder="กรอกชื่อ-นามสกุล..."
              style="width: 220px;"
            />
          </el-form-item>
          <el-form-item label="สิทธิ์การใช้งาน (Role)" required>
            <el-select v-model="userForm.permission" style="width: 130px;">
              <el-option label="Admin" value="admin" />
              <el-option label="Viewer" value="viewer" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="saveUser">
              {{ isEditing ? 'บันทึก' : 'เพิ่มผู้ใช้' }}
            </el-button>
            <el-button v-if="isEditing" @click="cancelEdit">ยกเลิก</el-button>
          </el-form-item>
        </el-form>
      </div>

      <!-- Search and Table -->
      <div class="table-panel">
        <div class="table-header-row">
          <h4 class="table-title">รายชื่อผู้ใช้งานในระบบทั้งหมด</h4>
          <el-input
            v-model="searchQuery"
            placeholder="ค้นหาด้วย EN หรือ ชื่อ..."
            prefix-icon="Search"
            style="width: 250px;"
            clearable
          />
        </div>

        <el-table :data="filteredUsers" height="320px" stripe style="width: 100%">
          <el-table-column prop="en" label="EN" width="120" />
          <el-table-column prop="name" label="ชื่อ-นามสกุล" min-width="180" />
          <el-table-column prop="permission" label="สิทธิ์ (Role)" width="120">
            <template #default="scope">
              <el-tag :type="scope.row.permission === 'admin' ? 'danger' : 'success'">
                {{ scope.row.permission.toUpperCase() }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="วันที่เพิ่ม" width="160">
            <template #default="scope">
              {{ formatDateTime(scope.row.createdAt) }}
            </template>
          </el-table-column>
          <el-table-column label="จัดการ" width="150" align="center">
            <template #default="scope">
              <el-button type="primary" size="small" link @click="editUser(scope.row)">
                ✏️ แก้ไข
              </el-button>
              <el-button type="danger" size="small" link @click="deleteUser(scope.row.en)">
                🗑️ ลบ
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  apiBase: { type: String, required: true },
});

const emit = defineEmits(['update:modelValue', 'saved']);

const loading = ref(false);
const users = ref([]);
const searchQuery = ref('');
const isEditing = ref(false);

const userForm = ref({
  en: '',
  name: '',
  permission: 'viewer'
});

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
      headers: getAuthHeaders()
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
    console.error('Employee autocomplete fetch failed in UserManagementDialog:', err);
    employeeSuggestions.value = [];
  } finally {
    searchLoading.value = false;
  }
}

function handleEmployeeSelect(val) {
  const match = employeeSuggestions.value.find(item => item.en === val);
  if (match) {
    userForm.value.name = match.name;
  }
}

function getAuthHeaders() {
  const user = JSON.parse(localStorage.getItem('sg_admin_user') || 'null');
  return {
    'Content-Type': 'application/json',
    'x-user-en': user ? user.en : '',
  };
}

async function loadUsers() {
  loading.value = true;
  try {
    const res = await fetch(`${props.apiBase}/api/registry/users`, {
      headers: getAuthHeaders()
    });
    const result = await res.json();
    if (res.status === 200 && result.success) {
      users.value = result.data || [];
    } else {
      ElMessage.error(result.message || 'ไม่สามารถดึงข้อมูลรายชื่อผู้ใช้ได้');
    }
  } catch (err) {
    console.error('loadUsers error:', err);
    ElMessage.error('เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล');
  } finally {
    loading.value = false;
  }
}

const filteredUsers = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return users.value;
  return users.value.filter(u => 
    (u.en || '').toLowerCase().includes(q) || 
    (u.name || '').toLowerCase().includes(q)
  );
});

async function saveUser() {
  if (!userForm.value.en || !userForm.value.en.trim()) {
    ElMessage.warning('กรุณาระบุรหัสพนักงาน (EN)');
    return;
  }
  if (!userForm.value.name || !userForm.value.name.trim()) {
    ElMessage.warning('กรุณาระบุชื่อ-นามสกุล');
    return;
  }

  loading.value = true;
  try {
    if (isEditing.value) {
      // Update user
      const res = await fetch(`${props.apiBase}/api/registry/users/${userForm.value.en}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: userForm.value.name,
          permission: userForm.value.permission
        })
      });
      const result = await res.json();
      if (res.status === 200 && result.success) {
        ElMessage.success('แก้ไขข้อมูลผู้ใช้งานสำเร็จ');
        cancelEdit();
        await loadUsers();
        emit('saved');
      } else {
        ElMessage.error(result.message || 'ไม่สามารถแก้ไขผู้ใช้ได้');
      }
    } else {
      // Create user
      const res = await fetch(`${props.apiBase}/api/registry/users`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          en: userForm.value.en,
          name: userForm.value.name,
          permission: userForm.value.permission
        })
      });
      const result = await res.json();
      if (res.status === 200 && result.success) {
        ElMessage.success('เพิ่มผู้ใช้งานใหม่สำเร็จ');
        resetForm();
        await loadUsers();
        emit('saved');
      } else {
        ElMessage.error(result.message || 'ไม่สามารถเพิ่มผู้ใช้งานใหม่ได้');
      }
    }
  } catch (err) {
    console.error('saveUser error:', err);
    ElMessage.error('เกิดข้อผิดพลาดในการเชื่อมต่อ');
  } finally {
    loading.value = false;
  }
}

function editUser(row) {
  isEditing.value = true;
  userForm.value = {
    en: row.en,
    name: row.name,
    permission: row.permission
  };
}

function cancelEdit() {
  isEditing.value = false;
  resetForm();
}

function resetForm() {
  userForm.value = {
    en: '',
    name: '',
    permission: 'viewer'
  };
  employeeSuggestions.value = [];
}

async function deleteUser(en) {
  try {
    await ElMessageBox.confirm(
      `คุณต้องการลบสิทธิ์ผู้ใช้ EN ${en} หรือไม่?`,
      'ยืนยันการลบ',
      {
        confirmButtonText: 'ลบ',
        cancelButtonText: 'ยกเลิก',
        type: 'warning',
      }
    );
    
    loading.value = true;
    const res = await fetch(`${props.apiBase}/api/registry/users/${en}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    const result = await res.json();
    if (res.status === 200 && result.success) {
      ElMessage.success('ลบผู้ใช้งานเรียบร้อยแล้ว');
      await loadUsers();
      emit('saved');
    } else {
      ElMessage.error(result.message || 'ลบผู้ใช้ไม่สำเร็จ');
    }
  } catch (err) {
    if (err !== 'cancel') {
      console.error('deleteUser error:', err);
      ElMessage.error('เกิดข้อผิดพลาดในการลบ');
    }
  } finally {
    loading.value = false;
  }
}

function formatDateTime(isoStr) {
  if (!isoStr) return '-';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('th-TH', { hour12: false });
  } catch (e) {
    return isoStr;
  }
}
</script>

<style scoped>
:deep(.user-management-dialog) {
  border-radius: 16px !important;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.25) !important;
  overflow: hidden;
  background: #ffffff;
}

:deep(.user-management-dialog .el-dialog__header) {
  background: linear-gradient(135deg, hsl(210, 80%, 25%) 0%, hsl(220, 85%, 15%) 100%);
  margin-right: 0;
  padding: 16px 24px;
}

:deep(.user-management-dialog .el-dialog__title),
:deep(.user-management-dialog .el-dialog__headerbtn .el-dialog__close) {
  color: white;
  font-weight: 700;
}

:deep(.user-management-dialog .el-dialog__body) {
  padding: 24px !important;
}

.dialog-body-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.user-form-panel {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px;
}

.form-title {
  margin: 0 0 12px 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: #1e293b;
}

.user-inline-form {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-end;
}

:deep(.el-form-item) {
  margin-bottom: 0 !important;
  margin-right: 0 !important;
}

:deep(.el-form-item__label) {
  font-size: 0.76rem;
  font-weight: 700;
  color: #475569;
  padding-bottom: 4px;
}

.table-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.table-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.table-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: #1e293b;
}
</style>
