<template>
  <div class="dashboard-container">
    <!-- 頁面標題 -->
    <header class="dashboard-header">
      <div class="title-group">
        <h1 class="main-title">
          <span class="icon">🛡️</span> 區塊鏈中央監控管理平台
        </h1>
        <p class="subtitle">BAS/BMS 數據防竄改存證與區塊鏈維運監控系統 (Tamper-proof Anchoring System)</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-primary" @click="refreshAll" :disabled="loading">
          <span :class="{'spin': loading}">🔄</span> {{ loading ? '同步數據中...' : '手動刷新' }}
        </button>
      </div>
    </header>

    <!-- 頂部伺服器位址設定 -->
    <div class="server-config-card">
      <div class="card-body row-align">
        <div class="input-group flex-1">
          <label for="dash-fetch-url">伺服器列表 URL：</label>
          <input id="dash-fetch-url" v-model="fetchURL" type="text" placeholder="例如 http://localhost:3166/api/appservers" />
          <button class="btn btn-secondary" @click="applyFetchURL">加載伺服器</button>
        </div>
        <div class="input-group flex-1">
          <label for="dash-server-select">選擇區塊鏈節點：</label>
          <select id="dash-server-select" v-model="selectedServer" @change="onServerChange">
            <option value="">-- 請選擇節點 --</option>
            <option v-for="(opt, idx) in serverOptions" :key="idx" :value="typeof opt === 'string' ? opt : opt.server">
              {{ typeof opt === 'string' ? opt : opt.server }}
            </option>
          </select>
        </div>
      </div>
    </div>

    <!-- 訊息提示 -->
    <div v-if="alertMessage" :class="['alert-banner', alertType]">
      {{ alertMessage }}
    </div>

    <!-- 4 大核心功能區域網格 -->
    <div class="dashboard-grid">

      <!-- 1. 節點狀態與連線監控 -->
      <section class="card node-monitoring-card">
        <div class="card-header">
          <h2><span class="card-icon">🌐</span> 1. 節點狀態與連線監控</h2>
          <span :class="['status-badge', isNodeOnline ? 'online' : 'offline']">
            {{ isNodeOnline ? '連線正常' : '無法連線' }}
          </span>
        </div>
        <div class="card-body">
          <div class="node-metrics-grid">
            <div class="metric-box">
              <span class="metric-label">目前選擇節點</span>
              <span class="metric-value font-mono">{{ selectedServer || '未選擇' }}</span>
            </div>
            <div class="metric-box">
              <span class="metric-label">最新區塊高度 (Height)</span>
              <span class="metric-value highlight font-mono">{{ nodeStatus.latestBlockHeight || '---' }}</span>
            </div>
            <div class="metric-box">
              <span class="metric-label">P2P 連線 Peer 數</span>
              <span class="metric-value font-mono">{{ nodeStatus.peersCount }} 節點</span>
            </div>
            <div class="metric-box">
              <span class="metric-label">共識狀態 (Consensus)</span>
              <span class="metric-value success font-mono">{{ nodeStatus.consensusState }}</span>
            </div>
          </div>

          <!-- 拓撲部署簡圖 -->
          <div class="topology-box">
            <div class="topology-title">區塊鏈網路分散部署拓撲 (BFT Consensus)</div>
            <div class="topology-nodes">
              <div class="topo-node master" :class="{ active: isNodeOnline }">
                <div class="topo-icon">🖥️</div>
                <div class="topo-name">NodeMaster</div>
                <div class="topo-ip">Port: 1001</div>
              </div>
              <div class="topo-connector" :class="{ active: isNodeOnline }">
                <span>帳本 P2P 同步 (0 Rollback)</span>
              </div>
              <div class="topo-node agent" :class="{ active: isNodeOnline }">
                <div class="topo-icon">💻</div>
                <div class="topo-name">NodeAgent</div>
                <div class="topo-ip">Port: 2001</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 2. 硬碟與儲存空間監控 -->
      <section class="card storage-monitoring-card">
        <div class="card-header">
          <h2><span class="card-icon">💾</span> 2. 硬碟與儲存空間監控</h2>
          <button class="btn btn-sm btn-outline" @click="loadStorageSize">重新檢測容量</button>
        </div>
        <div class="card-body">
          <div class="storage-summary">
            <div class="storage-item">
              <span class="storage-label">區塊鏈帳本資料庫空間 (data)</span>
              <span class="storage-value font-mono">{{ storageData.data }}</span>
            </div>
            <div class="storage-item">
              <span class="storage-label">鏈節點系統總佔用空間 (chainnode)</span>
              <span class="storage-value font-mono">{{ storageData.chainnode }}</span>
            </div>
          </div>

          <!-- 容量佔用視覺化圖表 -->
          <div class="capacity-meter">
            <div class="meter-label-row">
              <span>儲存容量與空間佔用</span>
              <span class="font-mono">
                ChainNode 已使用 {{ storageData.chainnode }}
                <template v-if="storageData.diskFree"> (磁碟剩餘可用 {{ storageData.diskFree }} / 總容量 {{ storageData.diskTotal }})</template>
              </span>
            </div>
            <!-- C: 槽硬碟空間分佈橫條 -->
            <div class="meter-bar-container">
              <div class="meter-bar-segment chainnode" :style="{ width: diskMetrics.chainnodePercent + '%' }" :title="'ChainNode 佔用: ' + diskMetrics.chainnodeGB + ' GB (' + diskMetrics.chainnodePercent + '%)'"></div>
              <div class="meter-bar-segment other" :style="{ width: diskMetrics.otherPercent + '%' }" :title="'其他系統與檔案: ' + diskMetrics.otherGB + ' GB (' + diskMetrics.otherPercent + '%)'"></div>
            </div>
            <div class="meter-legend" v-if="storageData.diskTotal">
              <span><span class="legend-dot chainnode"></span> ChainNode 佔用: {{ diskMetrics.chainnodeGB }} GB ({{ diskMetrics.chainnodePercent }}%)</span>
              <span><span class="legend-dot other"></span> 其他系統/檔案: {{ diskMetrics.otherGB }} GB ({{ diskMetrics.otherPercent }}%)</span>
              <span><span class="legend-dot free"></span> 磁碟剩餘可用: {{ diskMetrics.freeGB }} GB ({{ diskMetrics.freePercent }}%)</span>
            </div>
          </div>
        </div>
      </section>

      <!-- 3. 今日上鏈筆數統計 -->
      <section class="card today-stats-card">
        <div class="card-header">
          <h2><span class="card-icon">📊</span> 3. 今日上鏈筆數統計 (00:00 - 23:59)</h2>
          <span class="badge-blue font-mono">日期: {{ todayDateStr }}</span>
        </div>
        <div class="card-body">
          <div class="stats-cards-row">
            <div class="stat-card primary">
              <div class="stat-num font-mono">{{ todayStats.total }}</div>
              <div class="stat-desc">今日總上鏈筆數</div>
            </div>
            <div class="stat-card success">
              <div class="stat-num font-mono">{{ todayStats.valid }}</div>
              <div class="stat-desc">有效存證紀錄</div>
            </div>
            <div class="stat-card danger">
              <div class="stat-num font-mono">{{ todayStats.revoked }}</div>
              <div class="stat-desc">撤銷/過期紀錄</div>
            </div>
          </div>

          <div class="stats-detail-box">
            <div class="detail-line">
              <span>最後更新時間：</span>
              <span class="font-mono">{{ todayStats.lastUpdated || '尚未同步' }}</span>
            </div>
            <div class="detail-line">
              <span>鏈上雜湊演算法：</span>
              <span class="font-mono highlight">SHA-256 (不可變存證)</span>
            </div>
          </div>
        </div>
      </section>

      <!-- 4. 交易 Hash 歷史與驗證 -->
      <section class="card hash-verification-card full-width">
        <div class="card-header">
          <h2><span class="card-icon">🔍</span> 4. 交易 Hash 歷史與多節點同步驗證</h2>
        </div>
        <div class="card-body">
          
          <!-- 1. TxCode 查詢 (標題與多筆逗號分割說明) -->
          <div class="txcode-query-panel" style="margin-bottom: 24px;">
            <h3 class="panel-subtitle">🔑 TxCode 查詢 <span style="font-size: 12px; font-weight: normal; color: #94a3b8; margin-left: 10px;">(多個查詢時請使用 "," 逗號分割)</span></h3>
            <div class="hash-search-box">
              <input 
                v-model="searchHashInput" 
                type="text" 
                class="hash-input font-mono"
                placeholder="請輸入 Txcode..."
                @keyup.enter="handleSearchHash"
              />
              <button class="btn btn-primary" @click="handleSearchHash" :disabled="searchingHash">
                {{ searchingHash ? '查詢中...' : '查詢' }}
              </button>
            </div>
          </div>

          <!-- 2. 歷史交易查詢 (與儀表板風格一致，寬敞排版) -->
          <div class="condition-query-panel">
            <h3 class="panel-subtitle">📜 歷史交易查詢</h3>
            <div class="condition-query-grid">
              <div class="query-field">
                <label for="dash-query-id">id:</label>
                <input id="dash-query-id" v-model="queryId" type="text" class="dash-input font-mono" placeholder="不填 = 查全部，可輸入如 user:new:" />
              </div>
              <div class="query-field">
                <label for="dash-query-start">開始時間:</label>
                <input id="dash-query-start" v-model="queryStartTime" type="text" class="dash-input font-mono" placeholder="2026-09-01 00:00:00" />
              </div>
              <div class="query-field">
                <label for="dash-query-end">結束時間:</label>
                <input id="dash-query-end" v-model="queryEndTime" type="text" class="dash-input font-mono" placeholder="2026-09-22 08:56:02" />
              </div>
              <div class="query-field">
                <label for="dash-query-limit">limit:</label>
                <input id="dash-query-limit" v-model.number="queryLimit" type="number" min="1" class="dash-input font-mono" placeholder="1000" />
              </div>
              <div class="query-field">
                <label for="dash-query-order">排序:</label>
                <select id="dash-query-order" v-model="queryOrder" class="dash-select font-mono">
                  <option value="desc">降序 (desc)</option>
                  <option value="asc">升序 (asc)</option>
                </select>
              </div>
            </div>
            <div class="query-btn-row">
              <button type="button" class="btn btn-primary btn-submit-query" @click="handleQueryTransactions" :disabled="searchingHash">
                交易查詢
              </button>
            </div>
          </div>

          <!-- 多節點同步驗證結果展示區 -->
          <div v-if="verifyResults.length > 0" class="verification-result-panel" style="margin-top: 16px;">
            <div v-for="(item, idx) in verifyResults" :key="idx" class="result-card">
              <div class="result-header">
                <span :class="item.allNodesConsistent ? 'badge-success' : 'badge-warning'" class="font-mono">
                  {{ item.allNodesConsistent ? '✅ 各節點同步一致 (Consensus OK)' : '⚠️ 節點資料不一致，請確認同步狀態' }}
                </span>
                <span v-if="item.hash && item.hash !== '(查無 Tx Hash)'" class="hash-tag font-mono">Tx Hash: {{ item.hash }}</span>
              </div>
              <!-- 各節點同步狀態列表 -->
              <div class="node-sync-status-row" v-if="item.nodeResults && item.nodeResults.length > 0">
                <span class="node-sync-label">各節點同步狀態：</span>
                <span
                  v-for="(nr, ni) in item.nodeResults"
                  :key="ni"
                  :class="['node-sync-badge', nr.found ? 'node-ok' : 'node-fail']"
                  :title="nr.server"
                >
                  {{ nr.found ? '✅' : '❌' }} {{ nr.name }}
                </span>
              </div>
              <div class="result-body font-mono">
                <div class="res-row"><strong>ID 標識碼：</strong> {{ item.id }}</div>
                <div class="res-row"><strong>紀錄內容：</strong> {{ JSON.stringify(item.document) }}</div>
                <div class="res-row"><strong>狀態：</strong> {{ item.revoked ? '已撤銷 (Revoked)' : '有效存證 (Active)' }}</div>
              </div>
            </div>
          </div>

          <!-- 3. 最後接【查詢結果】表格 -->
          <div class="history-table-container" style="margin-top: 20px;">
            <h3>查詢結果</h3>
            <table class="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>存證識別碼 (ID)</th>
                  <th>歷史狀態</th>
                  <th>紀錄內容摘要</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="displayHistoryList.length === 0">
                  <td colspan="5" class="empty-cell">目前尚無符合條件之交易紀錄</td>
                </tr>
                <tr v-for="(log, idx) in displayHistoryList.slice(0, 50)" :key="log.id || idx">
                  <td class="font-mono">{{ idx + 1 }}</td>
                  <td class="font-mono primary-text">{{ log.id }}</td>
                  <td>
                    <span :class="log.revoked ? 'badge-danger' : 'badge-success'">
                      {{ log.revoked ? '已撤銷' : '存證有效' }}
                    </span>
                  </td>
                  <td class="ellipsis-cell font-mono">{{ getSummaryText(log) }}</td>
                  <td>
                    <button class="btn btn-xs btn-outline" @click="quickVerify(log.id)">節點同步查驗</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

    </div>
  </div>
</template>

<script>
import { 
  fetchServerListFromURL, 
  getServers, 
  setServer, 
  getServer, 
  getFetchURL, 
  fetchStorageSize, 
  searchTodayIdentities, 
  searchTodayIds, 
  searchIdentities,
  loadIdentities,
  loadIdentitiesWithMeta,
  getIdentityByHash,
  fetchRealNodeStatus,
  queryAllNodesForId,
  queryAllNodesForHash
} from '@/api/identity.js';

export default {
  name: 'BlockchainDashboard',
  data() {
    return {
      fetchURL: getFetchURL() || 'https://repeater-passover-blurb.ngrok-free.dev/api/appservers',
      selectedServer: '',
      serverOptions: [],
      loading: false,
      alertMessage: '',
      alertType: 'alert-info',

      // 1. 節點狀態數據
      nodeStatus: {
        latestBlockHeight: 1248,
        peersCount: 2,
        consensusState: 'CometBFT (Tendermint)',
        blockTime: '< 1s'
      },

      // 2. 硬碟儲存空間
      storageData: {
        chainnode: '0 MB',
        data: '0 MB',
        totalMB: 0,
        dataShare: 0,
        diskTotal: '',
        diskFree: ''
      },

      // 3. 今日統計
      todayStats: {
        total: 0,
        valid: 0,
        revoked: 0,
        lastUpdated: ''
      },
      todayList: [],
      todayDateStr: new Date().toISOString().split('T')[0],

      // 4. 交易 Hash 歷史與驗證
      searchHashInput: '',
      searchingHash: false,
      verifyResults: [],

      // 交易歷史進階查詢欄位 (加到 dashboard.vue)
      // 空白 = 查全部（後端無法純時間查詢，內部自動補 'user:new:' 前綴）
      queryId: '',
      queryStartTime: '2026-09-01 00:00:00',
      queryEndTime: (() => {
        const d = new Date();
        d.setHours(d.getHours() + 1);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        const secs = String(d.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${mins}:${secs}`;
      })(),
      queryLimit: 1000,
      queryOrder: 'desc',
      queryLog: '',
      queryResultsList: []
    };
  },
  computed: {
    displayHistoryList() {
      return this.queryResultsList.length > 0 ? this.queryResultsList : this.todayList;
    },
    isNodeOnline() {
      return !!this.selectedServer;
    },
    diskMetrics() {
      const cnMB = parseFloat(this.storageData.chainnode) || 0;
      const cnGB = cnMB / 1024;

      const parseGB = (str) => {
        if (!str) return 0;
        return parseFloat(str) || 0;
      };

      const totalGB = parseGB(this.storageData.diskTotal);
      const freeGB = parseGB(this.storageData.diskFree);

      if (totalGB <= 0) {
        return {
          chainnodeGB: cnGB.toFixed(2),
          otherGB: '0.00',
          freeGB: '0.00',
          chainnodePercent: '5.0',
          otherPercent: '0.0',
          freePercent: '95.0'
        };
      }

      const usedGB = Math.max(totalGB - freeGB, 0);
      const otherGB = Math.max(usedGB - cnGB, 0);

      const chainnodePercent = ((cnGB / totalGB) * 100).toFixed(1);
      const otherPercent = ((otherGB / totalGB) * 100).toFixed(1);
      const freePercent = ((freeGB / totalGB) * 100).toFixed(1);

      return {
        chainnodeGB: cnGB.toFixed(2),
        otherGB: otherGB.toFixed(2),
        freeGB: freeGB.toFixed(2),
        chainnodePercent,
        otherPercent,
        freePercent
      };
    }
  },
  async mounted() {
    const d = new Date();
    d.setHours(d.getHours() + 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    const secs = String(d.getSeconds()).padStart(2, '0');
    this.queryEndTime = `${year}-${month}-${day} ${hours}:${mins}:${secs}`;

    const savedUrl = getFetchURL();
    if (savedUrl) {
      this.fetchURL = savedUrl;
    }
    const currentServ = getServer();
    if (currentServ) {
      this.selectedServer = currentServ;
    }

    await this.initServerList();
    await this.refreshAll();
  },
  methods: {
    showAlert(msg, type = 'alert-info') {
      this.alertMessage = msg;
      this.alertType = type;
      setTimeout(() => {
        if (this.alertMessage === msg) this.alertMessage = '';
      }, 4000);
    },

    async initServerList() {
      try {
        const servers = await fetchServerListFromURL(this.fetchURL);
        if (servers && servers.length > 0) {
          this.serverOptions = servers;
          if (!this.selectedServer) {
            this.selectedServer = typeof servers[0] === 'string' ? servers[0] : servers[0].server;
            setServer(this.selectedServer);
          }
        }
      } catch (e) {
        console.error('initServerList error:', e);
      }
    },

    async applyFetchURL() {
      this.loading = true;
      try {
        await this.initServerList();
        this.showAlert('伺服器列表加載成功！', 'alert-success');
      } catch (e) {
        this.showAlert('無法讀取伺服器列表，請確認 Server 是否運行', 'alert-danger');
      } finally {
        this.loading = false;
      }
    },

    onServerChange() {
      if (this.selectedServer) {
        setServer(this.selectedServer);
        this.showAlert(`已切換目前區塊鏈節點至: ${this.selectedServer}`, 'alert-success');
        this.refreshAll();
      }
    },

    async refreshAll() {
      this.loading = true;
      try {
        await Promise.all([
          this.loadStorageSize(),
          this.loadTodayStatistics(),
          this.fetchRealNodeStatus()
        ]);
        this.showAlert('儀表板數據已更新！', 'alert-success');
      } catch (e) {
        console.error('refreshAll error:', e);
      } finally {
        this.loading = false;
      }
    },

    // 1. 查詢真實區塊高度與節點 RPC
    async fetchRealNodeStatus() {
      const serverUrl = this.selectedServer;
      if (!serverUrl) return;
      const height = await fetchRealNodeStatus(serverUrl);
      if (height !== null && height !== undefined) {
        this.nodeStatus.latestBlockHeight = height;
      }
    },

    // 2. 檢測容量
    async loadStorageSize() {
      try {
        const res = await fetchStorageSize();
        if (res && res.chainnode) {
          this.storageData.chainnode = res.chainnode;
          this.storageData.data = res.data;
          this.storageData.diskTotal = res.diskTotal || '';
          this.storageData.diskFree = res.diskFree || '';

          const cnVal = parseFloat(res.chainnode) || 0;
          const dtVal = parseFloat(res.data) || 0;
          this.storageData.totalMB = cnVal.toFixed(2);
          this.storageData.dataShare = cnVal > 0 ? ((dtVal / cnVal) * 100).toFixed(1) : 0;
        }
      } catch (e) {
        console.error('loadStorageSize error:', e);
      }
    },

    // 3. 今日統計數據加載
    async loadTodayStatistics() {
      try {
        const idList = await searchTodayIdentities();
        const idsRes = await searchTodayIds();

        this.todayList = idList || [];
        const normalCount = idsRes.normal ? idsRes.normal.length : 0;
        const revokedCount = idsRes.revoked ? idsRes.revoked.length : 0;

        this.todayStats.valid = normalCount;
        this.todayStats.revoked = revokedCount;
        this.todayStats.total = normalCount + revokedCount;
        this.todayStats.lastUpdated = new Date().toLocaleTimeString();
      } catch (e) {
        console.error('loadTodayStatistics error:', e);
      }
    },

    // ─── 多節點同步共識查驗：向各節點查詢同一筆記錄，比對是否一致 ───
    async queryAllNodesForId(id) {
      return await queryAllNodesForId(id, this.selectedServer);
    },

    async queryAllNodesForHash(hash) {
      return await queryAllNodesForHash(hash, this.selectedServer);
    },

    // 4. 多節點同步共識查詢（取代舊有防竄改驗證）
    async handleSearchHash() {
      const rawInput = this.searchHashInput.trim();
      if (!rawInput) {
        this.showAlert('請輸入交易 Hash (64位十六進制) 或存證識別碼 (ID)', 'alert-danger');
        return;
      }
      if (!this.selectedServer) {
        this.showAlert('請先在頁面上方【選擇區塊鏈節點】！', 'alert-danger');
        return;
      }

      this.searchingHash = true;
      this.verifyResults = [];

      // 支援多筆逗號分割輸入
      const inputTokens = rawInput.split(',').map(s => s.trim()).filter(Boolean);

      try {
        const allResults = [];

        for (const inputVal of inputTokens) {
          const is64Hex = /^[0-9a-fA-F]{64}$/.test(inputVal);

          if (is64Hex) {
            // ── Tx Hash 模式：向各節點查詢是否持有此 Hash 記錄 ──
            const res = await getIdentityByHash(inputVal);
            console.log('getIdentityByHash res:', res);

            let baseId = 'N/A';
            let baseDoc = {};
            let baseRevoked = false;

            if (res && typeof res === 'object') {
              if (Array.isArray(res.value) && res.value.length > 0) {
                const v = res.value[0];
                baseId = v.id || 'N/A';
                baseDoc = v.document || v;
                baseRevoked = !!v.revoked;
              } else {
                const keys = Object.keys(res);
                if (keys.length > 0) {
                  const rawData = res[keys[0]]?.raw_data || res[keys[0]];
                  baseId = rawData?.id || 'N/A';
                  baseDoc = rawData?.document || rawData || {};
                  baseRevoked = !!rawData?.revoked;
                }
              }
            }

            const nodeResults = await this.queryAllNodesForHash(inputVal);
            const allNodesConsistent = nodeResults.every(n => n.found);

            allResults.push({
              hash: inputVal,
              id: baseId,
              document: baseDoc,
              revoked: baseRevoked,
              nodeResults,
              allNodesConsistent
            });
          } else {
            // ── ID / 前綴模式：向各節點查詢是否持有此 ID 記錄 ──
            const metaList = await this.fetchIdentitiesFlexible(inputVal);
            if (metaList && metaList.length > 0) {
              for (const meta of metaList) {
                const doc = meta.document || meta;
                const candidateHash = meta.hash || meta.tx_hash || meta.txHash || meta.hashcode;
                let realTxHash = '';

                if (candidateHash && /[0-9a-fA-F]{64}/.test(candidateHash)) {
                  try {
                    const txRes = await getIdentityByHash(candidateHash);
                    if (txRes) {
                      const txKeys = Object.keys(txRes).filter(k => k !== 'value' && k !== 'error');
                      realTxHash = txKeys[0] || (Array.isArray(txRes.value) && txRes.value[0]?.hash) || candidateHash;
                    }
                  } catch (e) {
                    realTxHash = candidateHash;
                  }
                } else if (candidateHash && candidateHash !== '(查無 Tx Hash)') {
                  realTxHash = candidateHash;
                }

                const nodeResults = await this.queryAllNodesForId(meta.id);
                const allNodesConsistent = nodeResults.every(n => n.found);

                allResults.push({
                  hash: (realTxHash === '(查無 Tx Hash)') ? '' : realTxHash,
                  id: meta.id,
                  document: doc,
                  revoked: !!meta.revoked,
                  nodeResults,
                  allNodesConsistent
                });
              }
            } else {
              this.showAlert(`⚠️ 各節點均查無識別碼或 Hash [${inputVal}]，請確認資料是否已完成同步上鏈`, 'alert-danger');
            }
          }
        }

        if (allResults.length > 0) {
          this.verifyResults = allResults;
          const consistentCount = allResults.filter(r => r.allNodesConsistent).length;
          if (consistentCount === allResults.length) {
            this.showAlert(`✅ 各節點同步一致 (Consensus OK)：共 ${allResults.length} 筆記錄已在所有節點完整同步！`, 'alert-success');
          } else {
            this.showAlert(`⚠️ 注意：${allResults.length} 筆中有 ${allResults.length - consistentCount} 筆節點資料不一致，請檢查節點同步狀態！`, 'alert-danger');
          }
        }
      } catch (e) {
        console.error('handleSearchHash error:', e);
        this.showAlert(`節點同步查詢失敗: ${e.message || e}`, 'alert-danger');
      } finally {
        this.searchingHash = false;
      }
    },

    /**
     * 多層彈性 ID 搜尋：
     * 1. 嘗試 /did/load 精確載入 (適合完整 ID)
     * 2. 嘗試 /did/search 帶 prefix: q 搜尋 (支援前綴如 le102: 或 le102:new:)
     * 3. 嘗試 searchTodayIdentities 檢索今日全量資料並進行包含過濾
     * 4. 嘗試 /did/search 帶全時間範圍全量搜尋並進行 includes 包含比對
     */
    async fetchIdentitiesFlexible(queryStr) {
      if (!queryStr) return [];
      const q = queryStr.trim();
      const allResults = [];
      const seenKeys = new Set();

      const addItems = (items) => {
        if (!Array.isArray(items)) return;
        items.forEach(item => {
          if (!item) return;
          const docStr = typeof item.document === 'object' ? JSON.stringify(item.document) : String(item.document || '');
          const key = `${item.id || ''}_${docStr}_${item.revoked ?? ''}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            allResults.push(item);
          }
        });
      };

      // 1. 精確載入 (適合完整 ID)
      try {
        const metaList = await loadIdentitiesWithMeta(q);
        if (Array.isArray(metaList) && metaList.length > 0 && metaList[0].id) {
          addItems(metaList);
          return allResults;
        }
      } catch (e) {
        console.warn('[fetchIdentitiesFlexible] precise load missed:', e);
      }

      // 2. 原生前綴搜尋 (適合如 le102:new: 或 le102:)
      try {
        const searchRes = await searchIdentities({
          prefix: q,
          startTime: '20200101_000000',
          endTime: '20301231_235959',
          order: 'asc',
          limit: 10000
        });
        const items = searchRes?.value || [];
        if (items.length > 0) {
          addItems(items);
          return allResults;
        }
      } catch (e) {
        console.warn('[fetchIdentitiesFlexible] prefix search missed:', e);
      }

      // 3. 搜尋今日建立的所有身份並進行 ID 子字串比對
      try {
        const todayItems = await searchTodayIdentities();
        if (Array.isArray(todayItems) && todayItems.length > 0) {
          const filtered = todayItems.filter(item => item.id && item.id.toLowerCase().includes(q.toLowerCase()));
          if (filtered.length > 0) {
            addItems(filtered);
            return allResults;
          }
        }
      } catch (e) {
        console.warn('[fetchIdentitiesFlexible] searchTodayIdentities missed:', e);
      }

      // 4. 帶寬廣時間範圍的空前綴 /did/search 搜尋 + 前端 includes 比對
      try {
        const searchRes = await searchIdentities({
          prefix: '',
          startTime: '20200101_000000',
          endTime: '20301231_235959',
          order: 'asc',
          limit: 10000
        });
        const items = searchRes?.value || [];
        const filtered = items.filter(item => item.id && item.id.toLowerCase().includes(q.toLowerCase()));
        if (filtered.length > 0) {
          addItems(filtered);
          return allResults;
        }
      } catch (e) {
        console.warn('[fetchIdentitiesFlexible] wide search fallback missed:', e);
      }

      return allResults;
    },

    async quickVerify(id) {
      if (!this.selectedServer) {
        this.showAlert('請先在頁面上方【選擇區塊鏈節點】！', 'alert-danger');
        return;
      }
      this.searchingHash = true;
      try {
        const metaList = await this.fetchIdentitiesFlexible(id);
        if (metaList && metaList.length > 0) {
          this.searchHashInput = id;
          const results = [];
          for (const meta of metaList) {
            const doc = meta.document || meta;
            let realTxHash = '';

            const candidateHash = meta.hash 
                                || meta.tx_hash 
                                || meta.txHash 
                                || meta.hashcode;

            if (candidateHash && /[0-9a-fA-F]{64}/.test(candidateHash)) {
              try {
                const txRes = await getIdentityByHash(candidateHash);
                if (txRes) {
                  const txKeys = Object.keys(txRes).filter(k => k !== 'value' && k !== 'error');
                  if (txKeys.length > 0) {
                    realTxHash = txKeys[0];
                  } else if (Array.isArray(txRes.value) && txRes.value[0]?.hash) {
                    realTxHash = txRes.value[0].hash;
                  } else {
                    realTxHash = candidateHash;
                  }
                }
              } catch (e) {
                realTxHash = candidateHash;
              }
            } else if (candidateHash && candidateHash !== '(查無 Tx Hash)') {
              realTxHash = candidateHash;
            }

            const nodeResults = await this.queryAllNodesForId(meta.id);
            const allNodesConsistent = nodeResults.every(n => n.found);

            results.push({
              hash: (realTxHash === '(查無 Tx Hash)') ? '' : realTxHash,
              id: meta.id,
              document: doc,
              revoked: !!meta.revoked,
              nodeResults,
              allNodesConsistent
            });
          }

          this.verifyResults = results;
          const consistentCount = results.filter(r => r.allNodesConsistent).length;
          if (consistentCount === results.length) {
            this.showAlert(`✅ 各節點同步一致 (Consensus OK)：識別碼 [${id}] 已在所有節點完整同步！`, 'alert-success');
          } else {
            this.showAlert(`⚠️ 識別碼 [${id}] 節點資料不一致，請確認各節點同步狀態！`, 'alert-danger');
          }
        } else {
          this.showAlert(`⚠️ 鏈上查無識別碼 [${id}]`, 'alert-danger');
        }
      } catch (e) {
        this.showAlert('載入失敗: ' + (e.message || e), 'alert-danger');
      } finally {
        this.searchingHash = false;
      }
    },

    getSummaryText(log) {
      if (typeof log.document === 'string') return log.document;
      if (typeof log.document === 'object') {
        return JSON.stringify(log.document);
      }
      return log.name || log.id || '---';
    },

    formatTime(date) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      const h = String(date.getHours()).padStart(2, '0');
      const mi = String(date.getMinutes()).padStart(2, '0');
      const s = String(date.getSeconds()).padStart(2, '0');
      return `${y}${m}${d}_${h}${mi}${s}`;
    },

    async handleQueryTransactions() {
      if (!this.selectedServer) {
        this.showAlert('請先在頁面上方選擇區塊鏈節點！', 'alert-danger');
        return;
      }
      if (!this.queryStartTime || !this.queryEndTime) {
        this.showAlert('請先填入開始時間與結束時間！', 'alert-danger');
        return;
      }
      const start = new Date(this.queryStartTime);
      const end = new Date(this.queryEndTime);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        this.showAlert('無效的時間格式，請依 YYYY-MM-DD HH:mm:ss 輸入', 'alert-danger');
        return;
      }

      this.searchingHash = true;
      this.queryLog = `[${new Date().toLocaleTimeString()}] 開始執行交易歷史查詢...\n`;
      this.queryLog += `條件: ID/前綴=[${this.queryId || '全量'}], 時間範圍=[${this.queryStartTime} ~ ${this.queryEndTime}], Limit=[${this.queryLimit}], 排序=[${this.queryOrder}]\n`;
      
      try {
        const startTimeStr = this.formatTime(start);
        const endTimeStr = this.formatTime(end);
        const id_prefix = this.queryId ? this.queryId.trim() : '';
        let allIds = [];
        const seenKeys = new Set();
        const maxLimit = this.queryLimit || 1000;

        const addDeduplicatedItems = (items) => {
          if (!Array.isArray(items)) return 0;
          let addedCount = 0;
          items.forEach(item => {
            if (!item) return;
            const docStr = typeof item.document === 'object' ? JSON.stringify(item.document) : String(item.document || '');
            const uniqueKey = `${item.id || ''}_${docStr}_${item.revoked ?? ''}`;
            if (!seenKeys.has(uniqueKey)) {
              seenKeys.add(uniqueKey);
              allIds.push(item);
              addedCount++;
            }
          });
          return addedCount;
        };

        const doSearch = async (prefixToUse, orderToUse) => {
          let startTime = startTimeStr;
          let endTime = endTimeStr;
          const isOrderDesc = (orderToUse === 'desc');

          for (let round = 1; ; round++) {
            const currentRoundLimit = Math.min(100, maxLimit - allIds.length);
            if (currentRoundLimit <= 0) break;

            const idPartial = await searchIdentities({
              prefix: prefixToUse,
              startTime: startTime,
              endTime: endTime,
              order: orderToUse,
              limit: currentRoundLimit,
            });

            const rawChunk = idPartial.value ?? [];
            let filteredChunk = rawChunk;
            if (id_prefix && prefixToUse === '') {
              filteredChunk = rawChunk.filter(item => item.id && item.id.toLowerCase().includes(id_prefix.toLowerCase()));
            }

            addDeduplicatedItems(filteredChunk);

            if (!idPartial.bookmark || rawChunk.length < currentRoundLimit || allIds.length >= maxLimit) {
              break;
            }

            const nextFilterTime = idPartial.bookmark.split(":").pop();
            if (!nextFilterTime || (isOrderDesc && nextFilterTime === endTime) || (!isOrderDesc && nextFilterTime === startTime)) {
              break;
            }

            if (isOrderDesc) {
              endTime = nextFilterTime;
            } else {
              startTime = nextFilterTime;
            }
          }
        };

        // 後端 db.go 的 emptyPrefixRegex 機制：
        // 當 prefix="" 時，後端組出的搜尋 key 為純時間字串 (如 "20260901_000000")
        // → 後端自動切換為全表掃描 + 時間過濾模式，與 ID 前綴無關
        // 當 prefix 有值時，後端以 (prefix+startTime)～(prefix+endTime) 做範圍掃描
        await doSearch(id_prefix, this.queryOrder);
        // 若有輸入 id_prefix 但找不到，再 fallback 用空 prefix 做全表時間查詢
        if (allIds.length === 0 && id_prefix) {
          await doSearch('', this.queryOrder);
        }

        this.queryResultsList = allIds;
        this.queryLog += `✅ 查詢成功完成！檢索出 ${allIds.length} 筆存證紀錄。\n`;
        this.showAlert(`✅ 查詢完成，共檢索出 ${allIds.length} 筆歷史紀錄！`, 'alert-success');
      } catch (error) {
        console.error('handleQueryTransactions error:', error);
        this.queryLog += `❌ 查詢失敗: ${error.message || error}\n`;
        this.showAlert('查詢交易歷史失敗: ' + (error.message || error), 'alert-danger');
      } finally {
        this.searchingHash = false;
      }
    }
  }
};
</script>

<style scoped>
.dashboard-container {
  padding: 24px;
  background-color: #0f172a;
  color: #f8fafc;
  min-height: 100vh;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}

/* 標題區域 */
.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  border-bottom: 1px solid #1e293b;
  padding-bottom: 16px;
}

.main-title {
  font-size: 26px;
  font-weight: 700;
  margin: 0;
  color: #38bdf8;
  display: flex;
  align-items: center;
  gap: 10px;
}

.subtitle {
  color: #94a3b8;
  font-size: 14px;
  margin-top: 4px;
}

/* 按鈕樣式 */
.btn {
  padding: 8px 16px;
  border-radius: 6px;
  border: none;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-primary {
  background: linear-gradient(135deg, #0284c7, #2563eb);
  color: #ffffff;
}
.btn-primary:hover {
  background: linear-gradient(135deg, #0369a1, #1d4ed8);
}

.btn-secondary {
  background-color: #334155;
  color: #f8fafc;
}
.btn-secondary:hover {
  background-color: #475569;
}

.btn-outline {
  background: transparent;
  border: 1px solid #38bdf8;
  color: #38bdf8;
}
.btn-outline:hover {
  background: rgba(56, 189, 248, 0.1);
}

.btn-sm {
  padding: 4px 10px;
  font-size: 12px;
}
.btn-xs {
  padding: 2px 8px;
  font-size: 11px;
}

/* 伺服器設定卡片 */
.server-config-card {
  background: #1e293b;
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 20px;
  border: 1px solid #334155;
}

.row-align {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}

.flex-1 {
  flex: 1;
  min-width: 280px;
}

.input-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.input-group label {
  font-size: 13px;
  color: #cbd5e1;
  white-space: nowrap;
}

.input-group input,
.input-group select {
  flex: 1;
  padding: 8px 12px;
  background: #0f172a;
  border: 1px solid #475569;
  border-radius: 6px;
  color: #ffffff;
  font-size: 14px;
}

/* Alert 警示條 */
.alert-banner {
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 20px;
  font-size: 14px;
  font-weight: 500;
}
.alert-info { background: #0c4a6e; color: #7dd3fc; border: 1px solid #0284c7; }
.alert-success { background: #064e3b; color: #6ee7b7; border: 1px solid #059669; }
.alert-danger { background: #4c0519; color: #fda4af; border: 1px solid #e11d48; }

/* 網格佈局 */
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
  gap: 20px;
}

/* 通用 Card 樣式 */
.card {
  background: #1e293b;
  border-radius: 12px;
  border: 1px solid #334155;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}

.full-width {
  grid-column: 1 / -1;
}

.card-header {
  padding: 16px 20px;
  background: #1e293b;
  border-bottom: 1px solid #334155;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header h2 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: #f1f5f9;
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-body {
  padding: 20px;
}

/* 狀態徽章 */
.status-badge {
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}
.status-badge.online { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid #10b981; }
.status-badge.offline { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #ef4444; }

/* 1. 節點狀態數據方塊 */
.node-metrics-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.metric-box {
  background: #0f172a;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid #334155;
}

.metric-label {
  display: block;
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 4px;
}

.metric-value {
  font-size: 15px;
  font-weight: 600;
  color: #f8fafc;
}
.metric-value.highlight { color: #38bdf8; font-size: 18px; }
.metric-value.success { color: #34d399; }

/* 拓撲圖 */
.topology-box {
  background: #0f172a;
  border-radius: 8px;
  padding: 14px;
  border: 1px solid #334155;
}

.topology-title {
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 12px;
  text-align: center;
}

.topology-nodes {
  display: flex;
  align-items: center;
  justify-content: space-around;
}

.topo-node {
  background: #1e293b;
  border: 1px solid #475569;
  border-radius: 8px;
  padding: 10px 16px;
  text-align: center;
}
.topo-node.active { border-color: #10b981; }
.topo-icon { font-size: 20px; }
.topo-name { font-size: 13px; font-weight: 600; }
.topo-ip { font-size: 11px; color: #94a3b8; }

.topo-connector {
  flex: 1;
  margin: 0 12px;
  text-align: center;
  border-top: 2px dashed #475569;
  position: relative;
}
.topo-connector.active { border-top-color: #10b981; }
.topo-connector span {
  font-size: 10px;
  color: #34d399;
  background: #0f172a;
  padding: 2px 6px;
  position: relative;
  top: -10px;
}

/* 2. 儲存空間 */
.storage-summary {
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
}

.storage-item {
  flex: 1;
  background: #0f172a;
  padding: 14px;
  border-radius: 8px;
  border: 1px solid #334155;
}

.storage-label { font-size: 12px; color: #94a3b8; display: block; }
.storage-value { font-size: 20px; font-weight: 700; color: #38bdf8; margin-top: 4px; display: block; }

.capacity-meter {
  background: #0f172a;
  padding: 14px;
  border-radius: 8px;
  border: 1px solid #334155;
}

.meter-label-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #cbd5e1;
  margin-bottom: 8px;
}

.meter-bar-container {
  height: 14px;
  background: #1e293b;
  border-radius: 7px;
  overflow: hidden;
  margin-bottom: 10px;
  display: flex;
}

.meter-bar-segment {
  height: 100%;
  transition: width 0.5s ease;
}

.meter-bar-segment.chainnode {
  background: linear-gradient(90deg, #0284c7, #38bdf8);
}

.meter-bar-segment.other {
  background: #64748b;
}

.meter-legend {
  font-size: 12px;
  color: #94a3b8;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.legend-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 4px;
}
.legend-dot.chainnode { background: #38bdf8; }
.legend-dot.other { background: #64748b; }
.legend-dot.free { background: #10b981; }

/* 3. 今日統計 */
.stats-cards-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.stat-card {
  padding: 16px;
  border-radius: 8px;
  text-align: center;
  border: 1px solid #334155;
}
.stat-card.primary { background: rgba(2, 132, 199, 0.15); border-color: #0284c7; }
.stat-card.success { background: rgba(16, 185, 129, 0.15); border-color: #10b981; }
.stat-card.danger { background: rgba(239, 68, 68, 0.15); border-color: #ef4444; }

.stat-num {
  font-size: 26px;
  font-weight: 700;
  color: #ffffff;
}

.stat-desc {
  font-size: 12px;
  color: #cbd5e1;
  margin-top: 4px;
}

.stats-detail-box {
  background: #0f172a;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 13px;
}

.detail-line {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
}

/* 4. 交易 Hash 搜尋與驗證 */
.search-tip-box {
  background: #0f172a;
  border: 1px solid #0284c7;
  color: #7dd3fc;
  padding: 10px 14px;
  border-radius: 6px;
  font-size: 13px;
  margin-bottom: 12px;
}

.hash-search-box {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.hash-input {
  flex: 1;
  padding: 10px 14px;
  background: #0f172a;
  border: 1px solid #475569;
  border-radius: 8px;
  color: #ffffff;
  font-size: 14px;
}

.verification-result-panel {
  background: #0f172a;
  border: 1px solid #059669;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;
}

.result-card {
  margin-top: 10px;
  padding: 12px;
  background: #1e293b;
  border-radius: 6px;
}

.result-header {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 8px;
}

.badge-success { background: #064e3b; color: #6ee7b7; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
.badge-danger { background: #881337; color: #fda4af; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
.badge-blue { background: #075985; color: #bae6fd; padding: 4px 10px; border-radius: 4px; font-size: 12px; }

.hash-tag { font-size: 12px; color: #94a3b8; }
.res-row { font-size: 13px; margin: 4px 0; color: #e2e8f0; }

/* 表格樣式 */
.history-table-container {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
  font-size: 13px;
}

.data-table th,
.data-table td {
  padding: 10px 14px;
  text-align: left;
  border-bottom: 1px solid #334155;
}

.data-table th {
  background: #0f172a;
  color: #94a3b8;
  font-weight: 600;
}

.primary-text { color: #38bdf8; font-weight: 600; }
.ellipsis-cell { max-width: 250px; white-space: nowrap; overflow: hidden; text-shadow: none; text-overflow: ellipsis; color: #94a3b8; }
.empty-cell { text-align: center; color: #64748b; padding: 24px; }

/* 動畫與字型 */
.font-mono { font-family: 'Fira Code', 'Consolas', monospace; }
.spin { display: inline-block; animation: spin 1s infinite linear; }
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 條件查詢面板風格 (與整體儀表板風格一致，寬敞大方) */
.condition-query-panel {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 10px;
  padding: 20px 24px;
  margin-top: 20px;
  margin-bottom: 24px;
}
.panel-subtitle {
  font-size: 15px;
  font-weight: 600;
  color: #38bdf8;
  margin-bottom: 16px;
}
.condition-query-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px 24px;
  margin-bottom: 20px;
}
.query-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.query-field label {
  font-size: 13px;
  font-weight: 600;
  color: #cbd5e1;
}
.dash-input, .dash-select {
  width: 100%;
  padding: 10px 14px;
  background: #1e293b;
  border: 1px solid #475569;
  border-radius: 8px;
  color: #f8fafc;
  font-size: 13px;
  box-sizing: border-box;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.dash-input:focus, .dash-select:focus {
  outline: none;
  border-color: #38bdf8;
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.15);
}
.query-btn-row {
  display: flex;
  justify-content: flex-end;
}
.btn-submit-query {
  padding: 10px 28px;
  font-size: 14px;
  font-weight: 600;
  border-radius: 8px;
}
</style>
