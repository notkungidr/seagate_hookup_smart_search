import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/prodline/seagate/hookup/hookup_smart_search/frontend/',
  plugins: [vue()],
  server: {
    port: 5177,
    host: true, // อนุญาตให้ต่อในวง LAN ได้
  }
});
