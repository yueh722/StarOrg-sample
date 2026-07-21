import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  server: {
    host: true,
    allowedHosts: true,
    proxy: {
      // 網頁抓名單用：當請求 /api 時，轉發到 3166
      '/app-api': {
        target: 'http://localhost:3166',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/app-api/, '')
      },
      // 區塊鏈連線用：當請求 /node1-api 時，轉發到 1001
      '/node1-api': {
        target: 'http://localhost:1001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/node1-api/, '')
      },
      // 相容舊寫法 /node-api 轉發到 1001
      '/node-api': {
        target: 'http://localhost:1001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/node-api/, '')
      },
      // 區塊鏈連線用：當請求 /node2-api 時，轉發到 2001
      '/node2-api': {
        target: 'http://localhost:2001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/node2-api/, '')
      },
      // 區塊鏈連線用：當請求 /node3-api 時，轉發到 3001
      '/node3-api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/node3-api/, '')
      },
      // 區塊鏈 RPC 連線用，轉發到對應的 CometBFT 連接埠
      '/node-rpc': {
        target: 'http://localhost:26657',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/node-rpc/, '')
      },
      '/node1-rpc': {
        target: 'http://localhost:26657',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/node1-rpc/, '')
      },
      '/node2-rpc': {
        target: 'http://localhost:27657',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/node2-rpc/, '')
      },
      '/node3-rpc': {
        target: 'http://localhost:28657',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/node3-rpc/, '')
      }
    }
  }
})
