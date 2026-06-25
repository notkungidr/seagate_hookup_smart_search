  <template>
    <el-dialog
      :model-value="modelValue"
      title="🔐 Admin Authentication Portal"
      width="420px"
      class="admin-login-dialog"
      destroy-on-close
      align-center
      @update:model-value="$emit('update:modelValue', $event)"
      @open="resetLogin"
    >
      <div class="login-container">
        <div class="login-header">
          <span class="lock-icon">🛡️</span>
          <h3>เข้าสู่ระบบสิทธิ์ผู้ดูแลระบบ</h3>
          <p>Seagate Hookup Chain Configuration Manager</p>
        </div>

        <el-form label-position="top" @submit.prevent="handleLogin">
          <el-form-item label="AD Username / บัญชีผู้ใช้งาน" required>
            <el-input
              id="input-admin-username"
              ref="usernameRef"
              v-model="username"
              placeholder="กรอกบัญชีผู้ใช้งาน AD..."
              prefix-icon="User"
              clearable
            />
          </el-form-item>

          <el-form-item label="Password / รหัสผ่าน" required>
            <el-input
              id="input-admin-password"
              v-model="password"
              type="password"
              placeholder="กรอกรหัสผ่าน AD..."
              prefix-icon="Lock"
              show-password
              clearable
              @keyup.enter="handleLogin"
            />
          </el-form-item>
          
          <div class="login-hint-bubble">
            💡 <strong>สำหรับทดสอบระบบ:</strong> ใช้ Username <code>0001</code> เพื่อ Bypass เข้าสู่ระบบได้ทันที
          </div>

          <div class="login-actions">
            <el-button
              id="btn-admin-login"
              type="primary"
              size="large"
              class="submit-login-btn"
              :loading="loading"
              @click="handleLogin"
            >
              🔐 เข้าสู่ระบบ (Secure Login)
            </el-button>
          </div>
        </el-form>
      </div>
    </el-dialog>
  </template>

  <script setup>
  import { ref, nextTick } from 'vue';
  import { ElMessage } from 'element-plus';

  const props = defineProps({
    modelValue: { type: Boolean, required: true },
    apiBase: { type: String, required: true },
  });

  const emit = defineEmits(['update:modelValue', 'success']);

  const username = ref('');
  const password = ref('');
  const loading = ref(false);
  const usernameRef = ref(null);

  function resetLogin() {
    username.value = '';
    password.value = '';
    loading.value = false;
    
    // Auto-focus input
    nextTick(() => {
      if (usernameRef.value) {
        usernameRef.value.focus();
      }
    });
  }

  async function handleLogin() {
    if (!username.value || username.value.trim() === '') {
      ElMessage.warning('กรุณาระบุบัญชีผู้ใช้งาน (Username)');
      return;
    }

    // Allow empty password only for developer bypass '0001'
    if (username.value.trim() !== '0001' && (!password.value || password.value.trim() === '')) {
      ElMessage.warning('กรุณาระบุรหัสผ่าน (Password)');
      return;
    }

    loading.value = true;
    try {
      let employeeNo = username.value.trim();

      // 1. If username is developer bypass '0001', skip intranet API call.
      // Otherwise, authenticate against the corporate intranet login API.
      if (employeeNo !== '0001') {
        const authRes = await fetch('https://intranet06-th.beltontechnology.com:8555/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username: username.value.trim(),
            password: password.value
          })
        });

        const authResult = await authRes.json();
        if (authRes.status === 200 && authResult.success) {
          // Extract EN from intranet API response safely
          const d = authResult.data;
          if (d && d.EN) {
            employeeNo = d.EN;
          } else if (d && d.en) {
            employeeNo = d.en;
          } else if (authResult.en) {
            employeeNo = authResult.en;
          } else if (authResult.EN) {
            employeeNo = authResult.EN;
          } else if (authResult.employeeNo) {
            employeeNo = authResult.employeeNo;
          } else if (d && typeof d === 'string') {
            employeeNo = d;
          } else {
            throw new Error('ไม่พบข้อมูลรหัสพนักงาน (EN) ในผลลัพธ์ของ API');
          }
        } else {
          throw new Error(authResult.message || 'บัญชีผู้ใช้งานหรือรหัสผ่าน AD ไม่ถูกต้อง');
        }
      }

      // 2. Verify Employee Number (EN) against our local database control table
      const dbRes = await fetch(`${props.apiBase}/api/registry/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ en: employeeNo.trim() }),
      });

      const dbResult = await dbRes.json();
      if (dbRes.status === 200 && dbResult.success) {
        // Save admin session in localStorage
        localStorage.setItem('sg_admin_user', JSON.stringify(dbResult.data));
        ElMessage.success(`🔐 ยินดีต้อนรับคุณ ${dbResult.data.name} เข้าสู่ระบบสิทธิ์ Admin!`);
        
        emit('success', dbResult.data);
        emit('update:modelValue', false);
      } else {
        ElMessage.error(dbResult.message || 'ไม่พบสิทธิ์ผู้ใช้งานหรือรหัสพนักงานไม่ถูกต้องในระบบฐานข้อมูล');
      }
    } catch (err) {
      console.error(err);
      ElMessage.error(err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อเพื่อล็อกอิน');
    } finally {
      loading.value = false;
    }
  }
  </script>

  <style scoped>
  :deep(.admin-login-dialog) {
    border-radius: 16px !important;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.25) !important;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.98);
  }

  :deep(.admin-login-dialog .el-dialog__header) {
    background: linear-gradient(135deg, hsl(220, 80%, 18%) 0%, hsl(230, 85%, 10%) 100%);
    margin-right: 0;
    padding: 16px 20px;
  }

  :deep(.admin-login-dialog .el-dialog__title),
  :deep(.admin-login-dialog .el-dialog__headerbtn .el-dialog__close) {
    color: white;
    font-weight: 700;
    font-size: 1.1rem;
  }

  :deep(.admin-login-dialog .el-dialog__body) {
    padding: 24px !important;
  }

  .login-container {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .login-header {
    text-align: center;
    margin-bottom: 8px;
  }

  .login-header .lock-icon {
    font-size: 2.8rem;
    display: block;
    margin-bottom: 10px;
  }

.login-header h3 {
  margin: 0 0 4px 0;
  font-size: 1.15rem;
  font-weight: 800;
  color: #0f172a;
}

.login-header p {
  margin: 0;
  font-size: 0.76rem;
  color: #64748b;
  font-weight: 500;
}

:deep(.el-form-item__label) {
  font-size: 0.78rem;
  font-weight: 700;
  color: #475569;
  padding-bottom: 4px;
}

.login-hint-bubble {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 0.74rem;
  color: #166534;
  line-height: 1.5;
  margin-bottom: 20px;
}

.login-hint-bubble code {
  background: #dcfce7;
  color: #15803d;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 700;
}

.login-actions {
  display: flex;
}

.submit-login-btn {
  flex: 1;
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%) !important;
  border: none !important;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
  font-weight: 700;
}

.submit-login-btn:hover {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%) !important;
  transform: translateY(-1px);
}
</style>
