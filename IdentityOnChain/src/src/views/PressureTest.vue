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
          <option v-for="(server, index) in serverOptions" :key="index" :value="server">
            {{ server }}
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
    <button @click="runTests">Run Test</button>
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
  getUserId, searchIdentities, searchTodayIdentities, loadIdentities, updateIdentity,
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
      fetchURL: getFetchURL(),
      serverlist: getServers(),
      selectedServer: getServer(), // 当前选中的服务器
      writeLock: Promise.resolve(),
      lastIndex: 0
    };
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
      if (this.serverOptions.includes(this.selectedServer)) {
        // 保持当前选择
      } else {
        if (this.serverlist.length > 0) {
          this.selectedServer = this.serverlist[0];
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
        this.identities = await this.createIdentities(params.iterations);
        this.log += `${this.identities.length} identities created.\n`;

        await this.sleep(5000);

        // 2. 并发测试 update
        this.log += 'Running updatePerson pressure test...\n';
        const updateResults = await this.runPressureTest(
            async (index) => {
              try {
                //this.outputTime(index)
                await this.sleep(this.getRandom5000());
                //this.outputTime(index)

                const identity = this.getRandomIdentity();
                const updatedPerson = { ...identity, name: this.safeRandom8() };
                const res = await updatePerson(updatedPerson);

                //await this.safeWriteGlobalArr(old => this.updateIdentity(old, updatedPerson));
                const update_result = await this.updateIdentity(updatedPerson);

                this.log += `update identity: ${identity.id}, name: ${updatedPerson.name}, hash: ${res.hash}, result: ${update_result}\n`;
                return updatedPerson;
              }catch (error) {
                this.log += `update failure: ${error}\n`;
                //throw error;
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
              const identity = this.getRandomIdentity();
              const remote = await queryPerson(identity.id);
              if (remote.id !== identity.id || remote.name !== identity.name) {
                this.log += `failed to query identity: ${identity.id} ${remote.name}, name: ${identity.name}\n`;
              }else {
                this.log += `query identity: ${identity.id} name: ${remote.name}; matched\n`;
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
        const deleteResults = await this.runPressureTest(
            async (index) => {
              try {
                const identity = await this.getAndRemoveIdentity(); // 获取并移除 identity
                if (!identity) {
                  return null;
                }
                const res = await deletePerson(identity.id);
                this.log += `revoke identity: ${identity.id}, hash: ${res.hash}\n`;
                return identity.id;
              } catch (error) {
                this.log += `revoke failure: ${error}\n`;
                //throw error;
              }
            },
            params,
            200
        );
        this.log += `deletePerson test completed in ${deleteResults.duration}ms.\n`;

        this.log += 'All pressure tests completed successfully.\n';
      } catch (error) {
        this.log += `Pressure tests failed: ${error}\n`;
      }
    },
    // 创建一批 identities
    async createIdentities(count) {
      const identities = [];
      for (let i = 0; i < count; i++) {
        const person = this.generatePerson();
        const res = await addPerson(person); // 调用 API 创建 identity
        identities.push(person);
        this.log += `Created identity: ${person.id}, hash: ${res.hash}\n`;
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
      let randomIndex = 0

      while (this.lastIndex == randomIndex) {
        randomIndex = Math.floor(Math.random() * this.identities.length);
      }

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

    async updateIdentity(person) {
      let res = false
      while (this.lock) {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // 等待锁释放
      }
      this.lock = true; // 加锁
      const targetIndex = this.identities.findIndex(item => item.id === person.id);
      if (targetIndex !== -1) {
        this.identities[targetIndex] = person;
        res = true;
      }
      this.lock = false; // 释放锁
      return res
    },

    // 从 identities 中获取并移除一个元素
    async getAndRemoveIdentity() {
      while (this.lock) {
        await new Promise((resolve) => setTimeout(resolve, 10)); // 等待锁释放
      }
      this.lock = true; // 加锁
      const identity = this.identities.shift(); // 获取并移除第一个元素
      this.lock = false; // 释放锁
      return identity;
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
      })
      return str;
    },

    getRandom5000() {
      // Math.random() → [0,1)
      return Math.floor(Math.random() * 500);
    },

    outputTime(id) {
      const now = new Date();
      const fullTime = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}.${now.getMilliseconds()}`;
      this.log += `${id}_${fullTime}\n`;
    }
  },
};
</script>

<style scoped>
textarea {
  margin-top: 20px;
  width: 100%;
}

div {
  margin-bottom: 10px;
}

label {
  display: inline-block;
  width: 120px;
}

/* 服务器配置区域样式 */
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
</style>