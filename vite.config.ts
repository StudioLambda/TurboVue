import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  build: {
    sourcemap: true,
    lib: {
      entry: 'src/turbo-vue.ts',
      name: 'TurboVue',
      fileName: 'turbo-vue',
    },
    rollupOptions: {
      external: ['vue', 'turbo-query'],
      output: {
        globals: { 'vue': 'Vue', 'turbo-query': 'TurboQuery' },
      },
    },
  },
})
