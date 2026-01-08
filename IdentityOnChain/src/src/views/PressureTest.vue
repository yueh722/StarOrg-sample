<template>
  <div>
    <h1>API Pressure Test</h1>
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
  searchIdentity as queryPerson,
  updateIdentity as updatePerson,
  revokeIdentity as deletePerson,
  getDefaultPerson,
} from '@/utils/api';

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
    };
  },
  methods: {
    async runTests() {
      this.log = 'Starting pressure tests...\n';
      this.identities = []; // 清空 identities
      this.lock = false; // 重置锁标志

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

        function sleep(ms) {
          return new Promise((resolve) => setTimeout(resolve, ms));
        }

        await sleep(5000);

        // 2. 并发测试 update
        this.log += 'Running updatePerson pressure test...\n';
        const updateResults = await this.runPressureTest(
            async () => {

              try {
                const identity = this.getRandomIdentity();
                const updatedPerson = { ...identity, name: this.generatePerson().name };
                const res = await updatePerson(updatedPerson);
                this.log += `update identity: ${identity.id}, ${updatedPerson.name}, hash: ${res.hash}\n`;
                return res;
              }catch (error) {
                this.log += `update failure: ${error}\n`;
                //throw error;
              }
            },
            params,
            200
        );
        this.log += `updatePerson test completed in ${updateResults.duration}ms.\n`;

        // 3. 并发测试 query
        this.log += 'Running queryPerson pressure test...\n';
        const queryResults = await this.runPressureTest(
            async () => {
              const identity = this.getRandomIdentity();
              const remote = await queryPerson(identity.id);
              if (remote.id !== identity.id) {
                this.log += `failed to query identity: ${identity.id} ${remote.name}\n`;
              }else {
                this.log += `query identity: ${identity.id} ${remote.name}; matched\n`;
              }
            },
            params,
            200
        );
        this.log += `queryPerson test completed in ${queryResults.duration}ms.\n`;

        // 4. 最后进行 revoke（删除）
        this.log += 'Running deletePerson pressure test...\n';
        const deleteResults = await this.runPressureTest(
            async () => {
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
      }
      return identities;
    },

    // 从保存的 identities 中随机获取一个
    getRandomIdentity() {
      const randomIndex = Math.floor(Math.random() * this.identities.length);
      return this.identities[randomIndex];
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
        const requests = Array.from({ length: concurrency }, () => apiFunc());
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
      const id = Math.random().toString(36).substring(7); // 生成随机 ID
      const name = `Person_${id}`; // 生成随机名称
      return { ...getDefaultPerson(), id: id, name: name };
    },
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
</style>