<template>
  <div>
    <h1>API Pressure Test</h1>

    <!-- 服务器配置区域 -->
    <div class="server-section">
      <div class="url-group">
        <label for="fetch-url">fetch server list from URL:</label>
        <input id="fetch-url" v-model="fetchURL" type="text" required />
        <button @click="applyFetchURL">应用</button>
      </div>
      <div class="server-select-group">
        <label for="server-select">选择服务器:</label>
        <select id="server-select" v-model="selectedServer" @change="onServerChange">
          <option value="">-- 请选择服务器 --</option>
          <option v-for="(opt, index) in serverOptions" :key="index" :value="typeof opt === 'string' ? opt : opt.server">
            {{ formatNodeName(opt) }}{{ (typeof opt === 'string' || opt.token) ? '' : ' (未連線)' }}
          </option>
        </select>
      </div>
    </div>

    <!-- 压力测试配置 -->
    <div>
      <label>创建人员数量: </label>
      <input v-model.number="iterations" type="number" min="1" />
    </div>
    <div>
      <label>间隔时间 (ms): </label>
      <input v-model.number="interval" type="number" min="0" />
    </div>
    <div>
      <label>开启随机间隔: </label>
      <input v-model="randomInterval" type="checkbox" />
    </div>
    <div>
      <label>并发数量: </label>
      <input v-model.number="concurrency" type="number" min="1" />
    </div>
    <div class="button-group">
      <button @click="runTests">Run Test</button>
      <button @click="queryBlockHeight">查詢最新區塊高度</button>
      <button @click="queryStorageSize">查詢儲存空間</button>
    </div>
    <textarea v-model="log" rows="20" cols="80" readonly></textarea>
  </div>
</template>

<script>
import {
  createIdentity as addPerson,
  loadIdentities as queryPerson,
  updateIdentity as updatePerson,
  revokeIdentity as deletePerson,
  getDefaultPerson, getFetchURL, fetchServerListFromURL, getServers, setServer as setServerAPI, setServer, getServer,
  getUserId, searchIdentities, searchTodayIdentities, loadIdentities, updateIdentity, fetchStorageSize, formatNodeName,
} from '@/api/identity.js';
import {localInsertPerson} from "@/api/personList.js";


export default {
  data() {
    return {
      iterations: 100,
      interval: 100,
      randomInterval: true,
      concurrency: 10,
      log: '',
      identities: [], // 保存生成的 identities
      lock: false, // 简单的锁标志
      fetchURL: (() => {
        const saved = getFetchURL();
        if (saved && !saved.includes('ngrok-free.dev')) return saved;
        return typeof window !== 'undefined' && window.location?.hostname
          ? `http://${window.location.hostname}:3166/api/appservers`
          : 'http://localhost:3166/api/appservers';
      })(),
      serverlist: getServers(),
      selectedServer: getServer(), // 当前选中的服务器
      writeLock: Promise.resolve(),
      lastIndex: 0,
      latestHeight: null
    };
  },
  async mounted() {
    if (!this.fetchURL || this.fetchURL.includes('ngrok-free.dev')) {
      this.fetchURL = typeof window !== 'undefined' && window.location?.hostname
        ? `http://${window.location.hostname}:3166/api/appservers`
        : 'http://localhost:3166/api/appservers';
    }
    await this.applyFetchURL();
  },
  computed: {
    // 将serverlist转换为选项数组
    serverOptions() {
      if (!this.serverlist) return [];
      // 如果serverlist是字符串，按换行分割
      if (typeof this.serverlist === 'string') {
        return this.serverlist.split('\n').filter(s => s.trim());
      }
      // 如果是数组，直接返回
      if (Array.isArray(this.serverlist)) {
        return this.serverlist;
      }
      return [];
    },
  },
  methods: {
    // 获取当前选中的服务器内容
    getSelectedServer() {
      return this.selectedServer;
    },

    // 服务器选择变化时的处理
    onServerChange() {
      console.log('选中的服务器:', this.selectedServer);
      setServer(this.selectedServer)
    },

    checkSelectedServer() {
      return (this.selectedServer.length > 0)
    },

    async applyFetchURL() {

      this.serverlist = await fetchServerListFromURL(this.fetchURL);
      // 如果之前有选中的服务器，尝试保留选择
      const hasSelected = this.serverOptions.some(opt => {
        const url = typeof opt === 'string' ? opt : opt.server;
        return url === this.selectedServer;
      });
      if (hasSelected) {
        // 保持当前选择
      } else {
        if (this.serverlist.length > 0) {
          const firstOpt = this.serverlist[0];
          this.selectedServer = typeof firstOpt === 'string' ? firstOpt : firstOpt.server;
        } else {
          this.selectedServer = '';
        }

        this.onServerChange()
      }
    },

    async safeWriteGlobalArr(updater) {
      // 抢占锁队列
      const prevTask = this.writeLock;
      let releaseLock;
      this.writeLock = new Promise(resolve => releaseLock = resolve);

      // 等待前面所有写入完成再执行
      await prevTask;
      try {
        this.identities = updater([...this.identities]);
      } finally {
        // 无论成功失败都释放锁，防止死锁
        releaseLock();
      }
    },

    sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    },

    async runTests() {
      this.identities = []; // 清空 identities
      this.lock = false; // 重置锁标志

      if (!this.checkSelectedServer()) {
        alert('choose a server first')
        return;
      }

      this.log = 'Starting pressure tests...\n';

      const params = {
        iterations: this.iterations,
        interval: this.interval,
        randomInterval: this.randomInterval,
        concurrency: this.concurrency,
      };

      try {
        // 1. 集中创建 identities
        this.log += 'Creating identities...\n';
        const createStartTime = Date.now();
        this.identities = await this.createIdentities(params.iterations);
        const createdCount = this.identities.length;
        const createDuration = Date.now() - createStartTime;
        this.log += `${createdCount} identities created.\n`;

        await this.sleep(5000);

        // 2. 并发测试 update
        this.log += 'Running updatePerson pressure test...\n';
        const updateResults = await this.runPressureTest(
            async (index) => {
              try {
                const identity = this.getRandomIdentity();
                if (!identity) {
                  return null;
                }
                const updatedPerson = { ...identity, name: this.safeRandom8() };
                const res = await updatePerson(updatedPerson);

                const update_result = this.updateIdentity(updatedPerson);

                this.log += `update identity: ${identity.id}, name: ${updatedPerson.name}, hash: ${res.hash}, result: ${update_result}\n`;
                return updatedPerson;
              } catch (error) {
                this.log += `update failure: ${error}\n`;
                return null;
              }
            },
            params,
            100
        );
        this.log += `updatePerson test completed in ${updateResults.duration}ms.\n`;

        await this.sleep(1000 * 5);

        // 3. 并发测试 query
        this.log += 'Running queryPerson pressure test...\n';
        const queryResults = await this.runPressureTest(
            async (index) => {
              try {
                const identity = this.getRandomIdentity();
                if (!identity) {
                  return null;
                }
                const remote = await queryPerson(identity.id);
                if (remote.id !== identity.id || remote.name !== identity.name) {
                  this.log += `failed to query identity: ${identity.id} ${remote.name}, name: ${identity.name}\n`;
                  return null;
                } else {
                  this.log += `query identity: ${identity.id} name: ${remote.name}; matched\n`;
                  return remote;
                }
              } catch (error) {
                this.log += `query failure: ${error}\n`;
                return null;
              }
            },
            params,
            200
        );
        this.log += `queryPerson test completed in ${queryResults.duration}ms.\n`;

        // search 测试
        this.log += 'Running searchTodayIdentities test...\n';
        const ids = await searchTodayIdentities();
        this.log += `total today: ${ids.length}, this round: ${params.iterations}\n`;

        let matchedCount = 0;
        let dismatchedCount = 0;
        for (const id of ids) {
          const person = id.document
          const localPerson = this.getIdentity(person.id);
          if (localPerson == null) {
            continue;
          }
          const matched = (person.name === localPerson.name)
          this.log += `found identity: ${person.id} revoked: ${id.revoked??'false'}
           name: ${person.name} gender: ${person.gender}
           department: ${person.department} status: ${person.status}
           matched: ${matched}\n`;

          matched ? matchedCount++ : dismatchedCount++;
        }
        this.log += `check ${matchedCount + dismatchedCount} persons, matched: ${matchedCount}, dismatched: ${dismatchedCount}.\n`;
        this.log += `searchTodayIdentities test completed.\n`;

        // 4. 最后进行 revoke（删除）
        this.log += 'Running deletePerson pressure test...\n';
        const deleteConcurrency = params.concurrency;
        const deleteIterations = Math.ceil(this.identities.length / deleteConcurrency) || 1;
        const deleteParams = {
          ...params,
          iterations: deleteIterations,
          concurrency: deleteConcurrency
        };
        const deleteResults = await this.runPressureTest(
            async (index) => {
              try {
                const identity = this.getAndRemoveIdentity(); // 改为同步获取
                if (!identity) {
                  return null;
                }
                const res = await deletePerson(identity.id);
                this.log += `revoke identity: ${identity.id}, hash: ${res.hash}\n`;
                return identity.id;
              } catch (error) {
                this.log += `revoke failure: ${error}\n`;
                return null;
              }
            },
            deleteParams,
            200
        );
        this.log += `deletePerson test completed in ${deleteResults.duration}ms.\n`;

        this.log += 'All pressure tests completed successfully.\n';

        // 5. 輸出統計摘要報告
        const createTps = (createdCount / (createDuration / 1000)).toFixed(2);
        const updateTps = (updateResults.results.length / (updateResults.duration / 1000)).toFixed(2);
        const queryTps = (queryResults.results.length / (queryResults.duration / 1000)).toFixed(2);
        const deleteTps = (deleteResults.results.length / (deleteResults.duration / 1000)).toFixed(2);

        this.log += `\n======================================\n`;
        this.log += `       PRESSURE TEST SUMMARY REPORT   \n`;
        this.log += `       測試時間: ${new Date().toLocaleString()}\n`;
        this.log += `======================================\n`;
        this.log += `Target Server: ${this.selectedServer}\n`;
        this.log += `Config:\n`;
        this.log += `  - Total Identities to Create: ${params.iterations}\n\n`;
        this.log += `  - Loop Iterations (Update/Query/Delete): ${params.iterations}\n`;
        this.log += `  - Base Interval: ${params.interval} ms\n`;
        this.log += `  - Random Interval: ${params.randomInterval ? 'Yes' : 'No'}\n`;
        this.log += `  - Concurrency (Update/Query/Delete): ${params.concurrency}\n\n`;
        this.log += `--------------------------------------\n`;
        this.log += `Durations:\n`;
        this.log += `  - Create Phase: ${createDuration} ms (Sequential)\n`;
        this.log += `  - Update Phase: ${updateResults.duration} ms (Concurrent)\n`;
        this.log += `  - Query  Phase: ${queryResults.duration} ms (Concurrent)\n`;
        this.log += `  - Delete Phase: ${deleteResults.duration} ms (Concurrent)\n`;
        this.log += `--------------------------------------\n`;
        this.log += `Throughput (TPS):\n`;
        this.log += `  - Create API: ${createTps} tx/s (Total: ${params.iterations} tx)\n`;
        this.log += `  - Update API: ${updateTps} tx/s (Total: ${params.iterations * params.concurrency} tx)\n`;
        this.log += `  - Query  API: ${queryTps} tx/s (Total: ${params.iterations * params.concurrency} tx)\n`;
        this.log += `  - Delete API: ${deleteTps} tx/s (Total: ${params.iterations} tx)\n`;
        this.log += `======================================\n`;

        try {
          const extraReport = await this.getBlockHeightAndStorageReport();
          if (extraReport.trim()) {
            this.log += extraReport;
            this.log += `======================================\n`;
          }
        } catch (e) {
          this.log += `Failed to query heights or storage: ${e}\n`;
        }

      } catch (error) {
        this.log += `Pressure tests failed: ${error}\n`;
      }
    },
    async getBlockHeightAndStorageReport() {
      let reportStr = "";
      if (this.serverOptions && this.serverOptions.length > 0) {
        const heightPromises = this.serverOptions.map(async (opt) => {
          const serverUrl = typeof opt === 'string' ? opt : opt.server;
          const isOnline = typeof opt === 'string' || !!opt.token;
          const nodeName = formatNodeName(opt);
          if (!isOnline) {
            return `${nodeName} 目前狀態: 未連線\n`;
          }

          let rpcUrl = '';
          if (serverUrl.includes('node1') || serverUrl.includes(':1001')) {
            rpcUrl = '/node1-rpc/status';
          } else if (serverUrl.includes('node2') || serverUrl.includes(':2001')) {
            rpcUrl = '/node2-rpc/status';
          } else if (serverUrl.includes('node3') || serverUrl.includes(':3001')) {
            rpcUrl = '/node3-rpc/status';
          } else if (serverUrl.includes('node4') || serverUrl.includes(':4001')) {
            rpcUrl = '/node4-rpc/status';
          } else {
            try {
              const url = new URL(serverUrl);
              const port = parseInt(url.port, 10);
              if (port >= 1001) {
                const nodeIndex = Math.round((port - 1001) / 1000);
                rpcUrl = `/node${nodeIndex + 1}-rpc/status`;
              } else {
                rpcUrl = `${serverUrl}/status`;
              }
            } catch (e) {
              rpcUrl = `${serverUrl}/status`;
            }
          }
          try {
            const response = await fetch(rpcUrl);
            if (response.ok) {
              const data = await response.json();
              const height = data.result?.sync_info?.latest_block_height;
              if (height !== undefined) {
                return `${nodeName} 目前區塊高度: ${height}\n`;
              }
            }
          } catch (e) {
            return `${nodeName} 查詢失敗: 無法連線 (${e.message || e})\n`;
          }
          return `${nodeName} 目前狀態: 無法取得高度\n`;
        });

        const results = await Promise.all(heightPromises);
        results.forEach((res) => {
          if (res) {
            reportStr += res;
          }
        });
      }
      reportStr += `\n`;
      try {
        const data = await fetchStorageSize();
        if (data && data.success && Array.isArray(data.nodes) && data.nodes.length > 0) {
          const selectedNodeName = formatNodeName(this.selectedServer);
          const targetNode = data.nodes.find(n => n.nodeId === selectedNodeName || n.nodeName === selectedNodeName) || data.nodes[0];
          if (targetNode) {
            if (targetNode.hostName && targetNode.hostName !== '-') {
              reportStr += `系統主機名稱 (Hostname): ${targetNode.hostName}\n`;
            }
            reportStr += `區塊鏈帳本資料庫空間 (C:\\ProgramData\\chainnode\\data): ${targetNode.chainDataSize || 'N/A'}\n`;
            reportStr += `鏈節點系統總佔用空間 [包含上述帳本及日誌/配置/執行檔] (C:\\ProgramData\\chainnode): ${targetNode.totalChainnodeSize || 'N/A'}\n`;
            if (targetNode.diskTotal && targetNode.diskFree) {
              reportStr += `系統磁碟總容量: ${targetNode.diskTotal}，剩餘可用: ${targetNode.diskFree}\n`;
            }
          }
        } else {
          reportStr += `[警告] 無法自動讀取儲存空間 (請確認 node server.js 後台服務是否已重啟)\n`;
        }
      } catch (e) {
        reportStr += `[警告] 無法自動讀取儲存空間 (請確認 node server.js 後台服務是否已重啟)，錯誤: ${e.message || e}\n`;
      }
      return reportStr;
    },
    // 创建一批 identities
    async createIdentities(count) {
      const identities = [];
      for (let i = 0; i < count; i++) {
        try {
          const person = this.generatePerson();
          const res = await addPerson(person); // 调用 API 创建 identity
          identities.push(person);
          this.log += `Created identity: ${person.id}, hash: ${res.hash}\n`;
        } catch (error) {
          this.log += `Failed to create identity at index ${i}: ${error.message || error}\n`;
        }
        await this.sleep(50);
      }
      return identities;
    },

    getIdentity(id){
      const targetIndex = this.identities.findIndex(item => item.id === id);
      if (targetIndex > -1) {
        return this.identities[targetIndex];
      }

      return null
    },

    // 从保存的 identities 中随机获取一个
    getRandomIdentity() {
      if (!this.identities || this.identities.length === 0) {
        return null;
      }
      if (this.identities.length === 1) {
        return this.identities[0];
      }

      let randomIndex = 0;
      do {
        randomIndex = Math.floor(Math.random() * this.identities.length);
      } while (this.lastIndex === randomIndex);

      this.lastIndex = randomIndex;
      return this.identities[randomIndex];
    },

    fnupdateIdentity(identities, person) {
      const targetIndex = identities.findIndex(item => item.id === person.id);
      if (targetIndex !== -1) {
        identities[targetIndex] = person;
      }

      return identities
    },

    updateIdentity(person) {
      const targetIndex = this.identities.findIndex(item => item.id === person.id);
      if (targetIndex !== -1) {
        this.identities[targetIndex] = person;
        return true;
      }
      return false;
    },

    // 从 identities 中获取并移除一个元素（改为纯同步）
    getAndRemoveIdentity() {
      return this.identities.shift();
    },

    // 运行压力测试
    async runPressureTest(apiFunc, params, mockReply) {
      const { iterations, interval, randomInterval, concurrency } = params;
      const results = [];
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        const requests = Array.from({ length: concurrency }, () => apiFunc(i));
        const batchResults = await Promise.all(requests);
        results.push(...batchResults.filter((result) => result !== null)); // 过滤掉无效结果

        if (interval > 0) {
          const delay = randomInterval ? Math.random() * interval : interval;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      const endTime = Date.now();
      return {
        results,
        duration: endTime - startTime,
      };
    },
    // 生成随机的 person 对象
    generatePerson() {
      const id = getUserId();
      const name = `Person_${id}`; // 生成随机名称
      return { ...getDefaultPerson(), id: id, name: name, department: 'dev' };
    },

    safeRandom8() {
      const arr = new Uint32Array(8);
      crypto.getRandomValues(arr);
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let str = '';
      arr.forEach(num => {
        str += chars[num % chars.length];
      });
      return str;
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



    getRandom5000() {
      // Math.random() → [0,1)
      return Math.floor(Math.random() * 500);
    },

    outputTime(id) {
      const now = new Date();
      const fullTime = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}.${now.getMilliseconds()}`;
      this.log += `${id}_${fullTime}\n`;
    },

    async fetchNodeRpcHeight(serverOpt) {
      const server = typeof serverOpt === 'string' ? serverOpt : (serverOpt?.server || '');
      const nodeName = formatNodeName(serverOpt);

      let rpcUrl = '';
      if (server.includes('node1') || server.includes(':1001')) {
        rpcUrl = '/node1-rpc/status';
      } else if (server.includes('node2') || server.includes(':2001')) {
        rpcUrl = '/node2-rpc/status';
      } else if (server.includes('node3') || server.includes(':3001')) {
        rpcUrl = '/node3-rpc/status';
      } else if (server.includes('node4') || server.includes(':4001')) {
        rpcUrl = '/node4-rpc/status';
      } else {
        try {
          const url = new URL(server);
          const port = parseInt(url.port, 10);
          if (port >= 1001) {
            const nodeIndex = Math.round((port - 1001) / 1000);
            rpcUrl = `/node${nodeIndex + 1}-rpc/status`;
          } else {
            rpcUrl = `${server}/status`;
          }
        } catch (e) {
          rpcUrl = `${server}/status`;
        }
      }

      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const tid = controller ? setTimeout(() => controller.abort(), 5000) : null;
        const response = await fetch(rpcUrl, { signal: controller ? controller.signal : undefined });
        if (tid) clearTimeout(tid);
        if (!response.ok) throw new Error(`HTTP 錯誤! 狀態碼: ${response.status}`);
        const data = await response.json();
        const height = data.result?.sync_info?.latest_block_height;
        return {
          name: nodeName,
          online: true,
          height: height !== undefined ? parseInt(height, 10) : null
        };
      } catch (error) {
        return {
          name: nodeName,
          online: false,
          height: null,
          error: error.message || '無法連線'
        };
      }
    },

    async queryBlockHeight() {
      this.log += `[${new Date().toLocaleTimeString()}] 開始查詢所有節點最新區塊高度...\n`;

      // 1. 優先嘗試向 server.js 的 /nodes/status 一次性取回全部節點狀態
      let nodesStatusList = null;
      try {
        const endpoints = ['/nodes/status', 'http://localhost:3166/nodes/status'];
        if (typeof window !== 'undefined' && window.location?.hostname) {
          endpoints.splice(1, 0, `http://${window.location.hostname}:3166/nodes/status`);
        }
        for (const ep of endpoints) {
          try {
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const tid = controller ? setTimeout(() => controller.abort(), 5000) : null;
            const res = await fetch(ep, {
              headers: { 'ngrok-skip-browser-warning': 'true' },
              signal: controller ? controller.signal : undefined
            });
            if (tid) clearTimeout(tid);
            if (res.ok) {
              const list = await res.json();
              if (Array.isArray(list) && list.length > 0) {
                nodesStatusList = list;
                break;
              }
            }
          } catch {}
        }
      } catch {}

      if (nodesStatusList && nodesStatusList.length > 0) {
        this.log += `[${new Date().toLocaleTimeString()}] 全節點區塊高度查詢結果 (共 ${nodesStatusList.length} 個節點)：\n`;
        this.log += `--------------------------------------------------\n`;
        nodesStatusList.forEach(n => {
          const name = formatNodeName(n.nodeId || n.nodeName || n);
          if (n.online && n.latestBlockHeight !== null && n.latestBlockHeight !== undefined) {
            this.log += `  • 【${name}】目前區塊高度: ${n.latestBlockHeight} (在線)\n`;
            if (this.latestHeight === null || n.latestBlockHeight > this.latestHeight) {
              this.latestHeight = n.latestBlockHeight;
            }
          } else {
            this.log += `  • 【${name}】未連線或無法取得高度\n`;
          }
        });
        this.log += `--------------------------------------------------\n\n`;
        return;
      }

      // 2. Fallback: 若無 /nodes/status，並行向 serverOptions 各節點 RPC 查詢
      let targets = (this.serverOptions && this.serverOptions.length > 0)
        ? this.serverOptions
        : ['node1', 'node2'];

      const results = await Promise.all(targets.map(opt => this.fetchNodeRpcHeight(opt)));
      this.log += `[${new Date().toLocaleTimeString()}] 全節點區塊高度查詢結果 (共 ${results.length} 個節點)：\n`;
      this.log += `--------------------------------------------------\n`;
      results.forEach(res => {
        if (res.online && res.height !== null) {
          this.log += `  • 【${res.name}】目前區塊高度: ${res.height} (在線)\n`;
          if (this.latestHeight === null || res.height > this.latestHeight) {
            this.latestHeight = res.height;
          }
        } else {
          this.log += `  • 【${res.name}】未連線 (${res.error || '無法取得'})\n`;
        }
      });
      this.log += `--------------------------------------------------\n\n`;
    },

    formatNodeName(opt) {
      return formatNodeName(opt);
    },

    async queryStorageSize() {
      try {
        const data = await fetchStorageSize();
        if (data && data.success && Array.isArray(data.nodes) && data.nodes.length > 0) {
          this.log += `[${new Date().toLocaleTimeString()}] 查詢硬碟與儲存空間成功 (全節點共 ${data.nodes.length} 個)：\n`;
          data.nodes.forEach(node => {
            const nodeName = node.nodeName || node.nodeId || '未知節點';
            const hostName = node.hostName && node.hostName !== '-' ? node.hostName : '';
            const diskTotal = node.diskTotal || '-';
            const diskFree = node.diskFree || '-';
            const chainnode = node.totalChainnodeSize || '-';
            const chainData = node.chainDataSize || '-';
            const loc = node.location && node.location !== '-' ? ` (${node.location})` : '';
            const hostTag = hostName ? ` (主機: ${hostName})` : '';

            this.log += `--------------------------------------------------\n`;
            this.log += `【節點: ${nodeName}${hostTag}${loc}】\n`;
            if (hostName) {
              this.log += `  - 系統主機名稱 (Hostname): ${hostName}\n`;
            }
            this.log += `  - 區塊鏈帳本資料庫空間 (data): ${chainData}\n`;
            this.log += `  - 鏈節點系統總佔用空間 (chainnode): ${chainnode}\n`;
            if (diskTotal !== '-' || diskFree !== '-') {
              this.log += `  - 系統磁碟總容量: ${diskTotal}，剩餘可用: ${diskFree}\n`;
            }
          });
          this.log += `--------------------------------------------------\n\n`;
        } else {
          this.log += `[${new Date().toLocaleTimeString()}] [警告] 無法讀取儲存空間 (請確認 node server.js 後台服務是否已啟動)\n\n`;
        }
      } catch (e) {
        this.log += `[${new Date().toLocaleTimeString()}] [警告] 無法讀取儲存空間: ${e.message || e}\n\n`;
      }
    }
  },
};
</script>

<style scoped>
  textarea {
    margin-top: 20px;
    width: 100%;
  }

  .button-group {
    display: flex;
    gap: 24px;
    margin-bottom: 20px;
  }

  div {
    margin-bottom: 10px;
  }

  label {
    display: inline-block;
    width: 120px;
  }

  input[type="number"], input[type="datetime-local"] {
    padding: 6px 10px;
    border: 1px solid #ccc;
    border-radius: 4px;
  }

  .server-section {
    margin-bottom: 20px;
  }

  .url-group, .server-select-group {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }

  .url-group label, .server-select-group label {
    margin: 0;
    white-space: nowrap;
    min-width: 180px;
  }

  .url-group input, .server-select-group select {
    flex: 1;
    min-width: 250px;
    padding: 8px 12px;
    border: 1px solid #ccc;
    border-radius: 4px;
  }

  .url-group button {
    padding: 8px 16px;
    border: 1px solid #ccc;
    background: #f0f0f0;
    cursor: pointer;
    border-radius: 4px;
    white-space: nowrap;
  }

  .button-group button {
    padding: 4px 8px;
    font-size: 13px;
    border: 1px solid #ccc;
    background: #f0f0f0;
    cursor: pointer;
    border-radius: 4px;
    white-space: nowrap;
    outline: none;
  }

  .button-group button:hover {
    background: #e0e0e0;
  }

  .button-group button:focus, .button-group button:active {
    outline: none;
    box-shadow: none;
  }
</style>