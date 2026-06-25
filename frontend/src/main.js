import { createApp } from 'vue';
import App from './App.vue';

// นำเข้า CSS ของ Element Plus
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import 'element-plus/theme-chalk/dark/css-vars.css';

// นำเข้าชุดไอคอนทั้งหมดของ Element Plus
import * as ElementPlusIconsVue from '@element-plus/icons-vue';

const app = createApp(App);

// ลงทะเบียนไอคอนแบบ Global
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}

app.use(ElementPlus);
app.mount('#app');
