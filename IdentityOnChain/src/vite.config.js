import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// 代理目標優先使用環境變數，若無則預設指向本機 server.js (3166)
// 當 Web Server 也跑在遠端電腦時，代理目標指向 127.0.0.1:3166 即可免去 ngrok 自環自鎖問題
const PROXY_TARGET = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:3166';

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
      // 網頁抓名單用：當請求 /app-api 或 /api/appservers 時，轉發到 server.js (3166)
      '/app-api': {
        target: PROXY_TARGET,
        changeOrigin: true,
        secure: false,
        headers: { 'ngrok-skip-browser-warning': 'true' },
        rewrite: (path) => path.replace(/^\/app-api/, '')
      },
      '/api/appservers': {
        target: PROXY_TARGET,
        changeOrigin: true,
        secure: false,
        headers: { 'ngrok-skip-browser-warning': 'true' }
      },
      '/api/storagesize': {
        target: PROXY_TARGET,
        changeOrigin: true,
        secure: false,
        headers: { 'ngrok-skip-browser-warning': 'true' }
      },
      '/nodes': {
        target: PROXY_TARGET,
        changeOrigin: true,
        secure: false,
        headers: { 'ngrok-skip-browser-warning': 'true' }
      },
      // 區塊鏈 RPC 連線用，保留前綴轉發至 server.js 動態代理（需排在 /node1, /node2 前面以確保優先匹配）
      '/node-rpc': {
        target: PROXY_TARGET,
        changeOrigin: true,
        secure: false,
        headers: { 'ngrok-skip-browser-warning': 'true' }
      },
      '/node1-rpc': {
        target: PROXY_TARGET,
        changeOrigin: true,
        secure: false,
        headers: { 'ngrok-skip-browser-warning': 'true' }
      },
      '/node2-rpc': {
        target: PROXY_TARGET,
        changeOrigin: true,
        secure: false,
        headers: { 'ngrok-skip-browser-warning': 'true' }
      },
      '/node3-rpc': {
        target: PROXY_TARGET,
        changeOrigin: true,
        secure: false,
        headers: { 'ngrok-skip-browser-warning': 'true' }
      },
      '/node4-rpc': {
        target: PROXY_TARGET,
        changeOrigin: true,
        secure: false,
        headers: { 'ngrok-skip-browser-warning': 'true' }
      },
      // 區塊鏈連線用：新標準路徑 /node1, /node2, /node3, /node4 轉發到 server.js (3166) 動態代理
      '/node1': {
        target: PROXY_TARGET,
        changeOrigin: true,
        secure: false,
        headers: { 'ngrok-skip-browser-warning': 'true' }
      },
      '/node2': {
        target: PROXY_TARGET,
        changeOrigin: true,
        secure: false,
        headers: { 'ngrok-skip-browser-warning': 'true' }
      },
      '/node3': {
        target: PROXY_TARGET,
        changeOrigin: true,
        secure: false,
        headers: { 'ngrok-skip-browser-warning': 'true' }
      },
      '/node4': {
        target: PROXY_TARGET,
        changeOrigin: true,
        secure: false,
        headers: { 'ngrok-skip-browser-warning': 'true' }
      },
      // 相容舊寫法 /node1-api, /node2-api, /node3-api, /node4-api, /node-api
      '/node1-api': {
        target: PROXY_TARGET,
        changeOrigin: true,
        secure: false,
        headers: { 'ngrok-skip-browser-warning': 'true' }
      },
      '/node-api': {
        target: PROXY_TARGET,
        changeOrigin: true,
        secure: false,
        headers: { 'ngrok-skip-browser-warning': 'true' }
      },
      '/node2-api': {
        target: PROXY_TARGET,
        changeOrigin: true,
        secure: false,
        headers: { 'ngrok-skip-browser-warning': 'true' }
      },
      '/node3-api': {
        target: PROXY_TARGET,
        changeOrigin: true,
        secure: false,
        headers: { 'ngrok-skip-browser-warning': 'true' }
      },
      '/node4-api': {
        target: PROXY_TARGET,
        changeOrigin: true,
        secure: false,
        headers: { 'ngrok-skip-browser-warning': 'true' }
      },
      '/did': {
        target: PROXY_TARGET,
        changeOrigin: true,
        secure: false,
        headers: { 'ngrok-skip-browser-warning': 'true' }
      }
    }
  }
})
