<template>
  <div class="login-panel-container">
    <div class="login-background-overlay"></div>
    
    <div class="login-glass-card">
      <div class="login-header">
        <span class="lock-icon">🛡️</span>
        <h3>Smart Pivot Search</h3>
        <p class="subtitle">Seagate Hookup Production Traceability Portal</p>
      </div>

      <el-form label-position="top" class="login-form" @submit.prevent="handleLogin">
        <el-form-item label="AD Username / บัญชีผู้ใช้งาน" required>
          <el-input
            id="input-login-username"
            ref="usernameRef"
            v-model="username"
            placeholder="กรอกบัญชีผู้ใช้งาน AD..."
            prefix-icon="User"
            size="large"
            clearable
          />
        </el-form-item>

        <el-form-item label="Password / รหัสผ่าน" required>
          <el-input
            id="input-login-password"
            v-model="password"
            type="password"
            placeholder="กรอกรหัสผ่าน AD..."
            prefix-icon="Lock"
            size="large"
            show-password
            clearable
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        
        <div class="login-hint-bubble">
          💡 <strong>สำหรับทดสอบระบบ:</strong> 
          ใช้ Username <code>0001</code> เพื่อสิทธิ์ Admin หรือ <code>9999</code> เพื่อสิทธิ์ Viewer ในการเข้าสู่ระบบ
        </div>

        <div class="login-actions">
          <el-button
            id="btn-submit-login"
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
    
    <div class="login-footer">
      <p>© 2026 Seagate Technology PLC. All rights reserved.</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue';
import { ElMessage } from 'element-plus';

const props = defineProps({
  apiBase: { type: String, required: true },
});

const emit = defineEmits(['success']);

const username = ref('');
const password = ref('');
const loading = ref(false);
const usernameRef = ref(null);

onMounted(() => {
  nextTick(() => {
    if (usernameRef.value) {
      usernameRef.value.focus();
    }
  });
});

async function handleLogin() {
  if (!username.value || username.value.trim() === '') {
    ElMessage.warning('กรุณาระบุบัญชีผู้ใช้งาน (Username)');
    return;
  }

  // Allow empty password only for developer bypass '0001' and test bypass '9999'
  const isBypass = username.value.trim() === '0001' || username.value.trim() === '9999';
  if (!isBypass && (!password.value || password.value.trim() === '')) {
    ElMessage.warning('กรุณาระบุรหัสผ่าน (Password)');
    return;
  }

  loading.value = true;
  try {
    let employeeNo = username.value.trim();

    // 1. Skip AD verification for mock testing users
    if (!isBypass) {
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

    // 2. Verify EN in local registry database
    const dbRes = await fetch(`${props.apiBase}/api/registry/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ en: employeeNo.trim() }),
    });

    const dbResult = await dbRes.json();
    if (dbRes.status === 200 && dbResult.success) {
      localStorage.setItem('sg_admin_user', JSON.stringify(dbResult.data));
      if (dbResult.data.permission === 'admin') {
        ElMessage.success(`🔐 ยินดีต้อนรับคุณ ${dbResult.data.name} เข้าสู่ระบบสิทธิ์ Admin!`);
      } else {
        ElMessage.success(`👤 ยินดีต้อนรับคุณ ${dbResult.data.name} เข้าสู่ระบบ!`);
      }
      emit('success', dbResult.data);
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
.login-panel-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 9999;
  background: linear-gradient(135deg, hsl(220, 80%, 15%) 0%, hsl(230, 85%, 6%) 100%);
  font-family: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  overflow: hidden;
}

.login-background-overlay {
  position: absolute;
  top: -20%;
  left: -20%;
  width: 140%;
  height: 140%;
  background: radial-gradient(circle at 30% 30%, rgba(37, 99, 235, 0.15) 0%, transparent 40%),
              radial-gradient(circle at 80% 70%, rgba(16, 185, 129, 0.1) 0%, transparent 40%);
  pointer-events: none;
  animation: bgPulse 20s infinite alternate ease-in-out;
}

@keyframes bgPulse {
  0% { transform: scale(1) rotate(0deg); }
  100% { transform: scale(1.05) rotate(3deg); }
}

.login-glass-card {
  width: 440px;
  max-width: 90%;
  padding: 40px;
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
  position: relative;
  z-index: 2;
  transition: all 0.3s ease;
}

.login-glass-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 24px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0) 100%);
  pointer-events: none;
}

.login-header {
  text-align: center;
  margin-bottom: 28px;
}

.lock-icon {
  font-size: 3.2rem;
  display: block;
  margin-bottom: 12px;
  filter: drop-shadow(0 0 10px rgba(37, 99, 235, 0.5));
}

.login-header h3 {
  margin: 0 0 6px 0;
  font-size: var(--fs-xl);
  font-weight: 800;
  color: #ffffff;
  letter-spacing: -0.02em;
}

.login-header .subtitle {
  margin: 0;
  font-size: var(--fs-sm);
  color: #94a3b8;
  font-weight: 500;
}

.login-form :deep(.el-form-item__label) {
  font-size: var(--fs-sm);
  font-weight: 700;
  color: #cbd5e1;
  padding-bottom: 6px;
}

.login-form :deep(.el-input__wrapper) {
  background-color: rgba(15, 23, 42, 0.6) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  box-shadow: none !important;
  border-radius: 12px;
  transition: all 0.25s ease;
}

.login-form :deep(.el-input__wrapper:hover),
.login-form :deep(.el-input__wrapper.is-focus) {
  border-color: #3b82f6 !important;
  background-color: rgba(15, 23, 42, 0.8) !important;
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.2) !important;
}

.login-form :deep(.el-input__inner) {
  color: #ffffff !important;
  font-size: var(--fs-base);
}

.login-form :deep(.el-input__inner::placeholder) {
  color: #64748b;
}

.login-form :deep(.el-input__icon) {
  color: #94a3b8;
}

.login-hint-bubble {
  background: rgba(16, 185, 129, 0.05);
  border: 1px solid rgba(16, 185, 129, 0.2);
  border-radius: 12px;
  padding: 12px 16px;
  font-size: var(--fs-sm);
  color: #34d399;
  line-height: 1.5;
  margin-top: 10px;
  margin-bottom: 24px;
}

.login-hint-bubble code {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  padding: 2px 6px;
  border-radius: 6px;
  font-weight: 700;
  font-family: monospace;
}

.login-actions {
  display: flex;
}

.submit-login-btn {
  flex: 1;
  background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%) !important;
  border: none !important;
  border-radius: 12px !important;
  padding: 14px 20px !important;
  height: auto !important;
  font-weight: 700;
  font-size: var(--fs-base);
  box-shadow: 0 4px 15px rgba(37, 99, 235, 0.4);
  transition: all 0.25s ease !important;
}

.submit-login-btn:hover {
  background: linear-gradient(135deg, #60a5fa 0%, #2563eb 100%) !important;
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(37, 99, 235, 0.5);
}

.submit-login-btn:active {
  transform: translateY(0);
}

.login-footer {
  position: absolute;
  bottom: 24px;
  z-index: 2;
}

.login-footer p {
  margin: 0;
  font-size: var(--fs-xs);
  color: #64748b;
  font-weight: 500;
}
</style>
