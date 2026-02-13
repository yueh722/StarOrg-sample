<template>
  <div class="container">
    <!-- 服务器配置区域 -->
    <div class="server-section">
      <h1>Server Address</h1>
      <div class="server-controls">
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
    </div>

    <!-- 消息区域 -->
    <label v-if="message" :class="messageClass">{{ message }}</label>

    <!-- 人员管理区域 -->
    <div class="person-section">
      <!-- 左侧：表单 -->
      <div class="form-area">
        <h2>人员管理</h2>
        <form @submit.prevent="handleAddPerson">
          <div class="form-row">
            <label>ID: <input v-model="person.id" type="text" required :disabled="isEditing" /></label>
            <label>姓名: <input v-model="person.name" type="text" required /></label>
          </div>
          <div class="form-row">
            <label>性别:
              <select v-model="person.gender" required>
                <option value="男">男</option>
                <option value="女">女</option>
              </select>
            </label>
            <label>部门: <input v-model="person.department" type="text" required /></label>
          </div>
          <div class="form-row">
            <label>入职日期: <input v-model="person.hireDate" type="date" required /></label>
            <label>状态:
              <select v-model="person.status" required>
                <option value="在职">在职</option>
                <option value="离职">离职</option>
              </select>
            </label>
          </div>
          <div class="form-buttons">
            <button type="submit">{{ isEditing ? '更新' : '新增' }}</button>
            <button type="button" @click="handleUpdatePerson" :disabled="!isEditing || !isModified">修改</button>
            <button type="button" @click="handleRevokeAllPersons">删除全部</button>
            <button type="button" @click="resetForm()" :disabled="!selectedPersonId && !person.id">重置</button>
          </div>
        </form>
      </div>

      <!-- 右侧：列表 -->
      <div class="list-area">
        <h3>人员列表</h3>
        <div class="list-container">
          <!-- 左侧：控制区域 -->
          <div class="list-controls">
            <div class="filter-group">
              <input v-model="filterText" type="text" placeholder="按姓名过滤" />
            </div>
            <div class="checkbox-group">
              <label>
                <input type="checkbox" v-model="showRevokedPerson" />
                显示已删除的人员
              </label>
            </div>
            <div class="button-group">
              <button type="button" @click="handleFetchAllPersons()">获取所有人员信息</button>
            </div>
          </div>

          <!-- 右侧：人员列表 -->
          <div class="person-list">
            <ul>
              <li v-for="person in filteredPersonList" :key="person.id"
                  @click="selectPerson(person)"
                  :class="{ selected: person.id === selectedPersonId }">
                <div class="person-info">
                  {{ person.name }} (ID: {{ person.id }}, 性别: {{ person.gender }}, 状态: {{ person.status }})
                </div>
                <button @click.stop="handleDeletePerson(person.id)">删除</button>
              </li>
              <li v-if="filteredPersonList.length === 0" class="empty">暂无人员数据</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
// JavaScript 代码保持不变
import {
  getDefaultPerson, getFetchURL,
  getNewPerson, getServers,
  isPersonRevokedRemote, fetchServerListFromURL, setServer, getServer,
} from '@/api/identity.js';
import {
  localInsertPerson,
  localUpdatePerson,
  localRemovePerson,
  personList,
  cleanupLocalPersonList,
  localGetPersonList
} from '@/api/personList';
import {
  createIdentity,
  getAllIdentity,
  isPersonRevoked,
  revokeIdentity,
  searchIdentity,
  updateIdentity
} from "@/api/identity.js";

function getCurrentDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default {
  data() {
    return {
      person: {
        ...getDefaultPerson(),
        hireDate: getCurrentDate(),
      },
      selectedPersonId: null,
      filterText: '',
      preFilterText: '',
      isEditing: false,
      message: '',
      messageClass: '',
      showRevokedPerson: false,
      fetchURL: getFetchURL(),
      serverlist: getServers(),
      selectedServer: getServer(), // 当前选中的服务器
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
    filteredPersonList() {
      if (this.preFilterText) {
        this.filterText = this.preFilterText;
        this.preFilterText = '';
      }

      if (!this.filterText) {
        return this.personList;
      }

      return this.personList.filter((person) =>
          person.name.toLowerCase().includes(this.filterText.toLowerCase())
      );
    },
    personList() {
      return personList;
    },
    isModified() {
      if (!this.selectedPersonId) return false;
      const selectedPerson = this.personList.find((p) => p.id === this.selectedPersonId);
      return (
          this.person.id !== selectedPerson.id ||
          this.person.name !== selectedPerson.name ||
          this.person.gender !== selectedPerson.gender ||
          this.person.department !== selectedPerson.department ||
          this.person.hireDate !== selectedPerson.hireDate ||
          this.person.status !== selectedPerson.status
      );
    },
  },
  methods: {
    // 获取当前选中的服务器内容
    getSelectedServer() {
      return this.selectedServer;
    },

    checkSelectedServer() {
      if (this.selectedServer.length === 0) {
        throw('choose a server first')
      }
    },

    // 服务器选择变化时的处理
    onServerChange() {
      console.log('选中的服务器:', this.selectedServer);
      setServer(this.selectedServer)
    },

    async applyFetchURL() {
      if (this.fetchURL.length === 0) {
        throw('input URL first');
      }

      this.serverlist = await fetchServerListFromURL(this.fetchURL);
      // 如果之前有选中的服务器，尝试保留选择
      if (this.serverOptions.includes(this.selectedServer)) {
        // 保持当前选择
      } else {
        if (this.serverlist.length > 0) {
          this.selectedServer = this.serverlist[0];
          this.onServerChange()
        } else {
          this.selectedServer = '';
        }
      }
    },
    async handleAddPerson() {
      try {
        await this.checkSelectedServer();
        const res = await createIdentity(this.person);
        localInsertPerson(this.person);
        this.message = '新增成功！' + '\n' + JSON.stringify(res);
        this.messageClass = 'success';
        this.resetForm(getNewPerson(this.person));
      } catch (error) {
        this.message = '新增失败，' + error;
        this.messageClass = 'error';
      }
    },
    async handleUpdatePerson() {
      try {
        await this.checkSelectedServer();
        const res = await updateIdentity(this.person);
        localUpdatePerson(this.person);
        this.message = '修改成功！' + '\n' + JSON.stringify(res);
        this.messageClass = 'success';
        this.resetForm();
      } catch (error) {
        this.message = '修改失败，' + error;
        this.messageClass = 'error';
      }
    },
    async handleDeletePerson(id) {
      try {
        await this.checkSelectedServer();
        const res = await revokeIdentity(id);
        localRemovePerson(id);
        this.message = '删除成功！' + '\n' + JSON.stringify(res);
        this.messageClass = 'success';
        this.resetForm();
      } catch (error) {
        this.message = '删除失败，' + error;
        this.messageClass = 'error';
      }
    },
    async selectPerson(person) {
      try {
        await this.checkSelectedServer();
        const remotePerson = await searchIdentity(person.id)
        this.selectedPersonId = remotePerson.id;
        this.person = { ...remotePerson };
        this.isEditing = true;
      } catch(error) {
        this.message = '查询失败，' + error;
        this.messageClass = 'error';
      }
    },
    async handleFetchAllPersons() {
      try{
        await this.checkSelectedServer();
        cleanupLocalPersonList()
        let total = 0, revokedCount = 0, normalCount = 0, loadedCount = 0;
        const ids = await getAllIdentity();
        normalCount = ids.normal.length;
        revokedCount = ids.revoked.length;
        total = normalCount + revokedCount;
        var logText = `total: ${total}, revoked: ${revokedCount}, normal: ${normalCount}\n`;
        this.message = logText
        this.messageClass = 'info';
        for (const id of ids.normal) {
          const normalPerson = await searchIdentity(id)
          localInsertPerson(normalPerson);
          this.refresh(normalPerson);
          loadedCount++
          this.message = logText + `loaded: ${loadedCount}\n`
        }
        if (this.showRevokedPerson) {
          for (const id of ids.revoked) {
            const revokedPerson = await searchIdentity(id)
            localInsertPerson(revokedPerson);
            this.refresh(revokedPerson);
            loadedCount++
            this.message = logText + `loaded: ${loadedCount}\n`
          }
        }
        this.message += '查询结束';
        this.resetForm(getDefaultPerson())
      } catch (error) {
        this.message = '查询失败，' + error + '\n';
        this.messageClass = 'error';
      }
    },
    async handleRevokeAllPersons() {
      try{
        await this.checkSelectedServer();
        var persons = localGetPersonList().slice(0)
        for (const i in persons) {
          await revokeIdentity(persons[i].id)
          localRemovePerson(persons[i].id)
          this.resetForm()
          this.message = `删除成功！left: ${personList.length}, id: ${persons[i].id}, name: ${persons[i].name}`;
          this.messageClass = 'success';
        }
        this.message = '删除成功！count: ' + persons.length;
        this.messageClass = 'success';
        cleanupLocalPersonList()
      } catch (error) {
        this.message = '删除失败，' + error + '\n';
        this.messageClass = 'error';
      }
    },
    refresh(person) {
      this.selectedPersonId = person.id;
      this.person = { ...person };
    },
    resetForm(person) {
      if (person != null){
        this.person = person;
      }else{
        this.person = {
          ...getDefaultPerson(),
          hireDate: getCurrentDate(),
        };
      }
      this.selectedPersonId = null;
      this.isEditing = false;
      this.preFilterText = this.filterText;
      this.filterText = '';
    },
  },
};
</script>

<style>

/* 基础交互元素鼠标样式 */
button {
  cursor: pointer;
}

select {
  cursor: pointer;
}

input[type="text"],
input[type="number"],
input[type="date"],
textarea {
  cursor: text;
}

input[type="checkbox"],
input[type="radio"] {
  cursor: pointer;
}

/* 人员列表项（如果适用） */
.person-list li {
  cursor: pointer;
}

/* 确保禁用状态有正确的鼠标样式 */
button:disabled,
input:disabled {
  cursor: not-allowed;
}

/* 重置基础样式 */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

.container {
  max-width: 1500px;
  margin: 0 auto;
  padding: 15px; /* 减小整体padding */
  width: 100%;
}

/* 服务器配置区域 - 紧凑化 */
.server-section {
  margin-bottom: 20px; /* 从30px减小到20px */
}

.server-section h1 {
  margin-bottom: 12px; /* 从15px减小到12px */
  font-size: 18px; /* 从20px减小到18px */
}

.server-controls {
  display: flex;
  flex-direction: column;
  gap: 12px; /* 从15px减小到12px */
}

.server-controls label {
  font-weight: bold;
  margin-bottom: 4px; /* 从5px减小到4px */
  display: block;
  font-size: 13px;
}

.url-group, .server-select-group {
  display: flex;
  align-items: center;
  gap: 8px; /* 从10px减小到8px */
  flex-wrap: wrap;
}

.url-group label, .server-select-group label {
  margin: 0;
  white-space: nowrap;
  min-width: 160px; /* 从180px减小到160px */
  font-size: 13px;
}

.url-group input {
  flex: 1;
  min-width: 220px; /* 从250px减小到220px */
  padding: 7px 10px; /* 从8px 12px减小 */
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 13px;
}

.url-group button, .server-select-group button {
  padding: 7px 14px; /* 从8px 16px减小 */
  border: 1px solid #ccc;
  background: #f0f0f0;
  cursor: pointer;
  border-radius: 4px;
  white-space: nowrap;
  font-size: 13px;
}

.server-select-group select {
  flex: 1;
  min-width: 220px; /* 从250px减小到220px */
  padding: 7px 10px; /* 从8px 12px减小 */
  border: 1px solid #ccc;
  border-radius: 4px;
  background-color: white;
  font-size: 13px;
}

/* 消息区域 */
label.messageClass {
  margin: 10px 0; /* 从15px减小到10px */
  padding: 8px;
  border-radius: 4px;
  white-space: pre-line;
  display: block;
}

.success { color: green; background-color: #e8f5e9; border: 1px solid #4caf50; }
.error { color: red; background-color: #ffebee; border: 1px solid #f44336; }
.info { color: #1976d2; background-color: #e3f2fd; border: 1px solid #2196f3; }

/* 人员管理区域 */
.person-section {
  display: flex;
  flex-direction: column;
  gap: 15px; /* 从20px减小到15px */
}

@media (min-width: 1000px) {
  .person-section {
    flex-direction: row;
  }

  .form-area {
    flex: 0 0 400px; /* 从420px减小到400px */
  }

  .list-area {
    flex: 1;
    min-width: 0;
  }
}

/* 表单区域 - 紧凑化 */
.form-area h2 {
  margin-bottom: 12px; /* 从15px减小到12px */
  font-size: 17px; /* 从18px减小到17px */
}

.form-area form {
  display: flex;
  flex-direction: column;
  gap: 12px; /* 从15px减小到12px */
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 8px; /* 从10px减小到8px */
}

@media (min-width: 600px) {
  .form-row {
    flex-direction: row;
    gap: 12px; /* 从15px减小到12px */
  }

  .form-row label {
    flex: 1;
  }
}

.form-row label {
  display: flex;
  flex-direction: column;
  gap: 4px; /* 从5px减小到4px */
  font-weight: bold;
  font-size: 13px;
}

.form-row input,
.form-row select {
  padding: 7px; /* 从8px减小到7px */
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 13px;
}

.form-row input:disabled {
  background-color: #f5f5f5;
  color: #999;
}

.form-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px; /* 从10px减小到8px */
  padding-top: 8px; /* 从10px减小到8px */
  border-top: 1px solid #ccc;
}

.form-buttons button {
  padding: 7px 14px; /* 从8px 16px减小 */
  border: 1px solid #ccc;
  background: #f0f0f0;
  cursor: pointer;
  border-radius: 4px;
  white-space: nowrap;
  font-size: 13px;
}

.form-buttons button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 列表区域 */
.list-area h3 {
  margin-bottom: 12px; /* 从15px减小到12px */
  font-size: 15px; /* 从16px减小到15px */
}

/* 列表容器 - 左右分栏 */
.list-container {
  display: flex;
  flex-direction: column;
  gap: 12px; /* 从15px减小到12px */
  height: 100%;
}

@media (min-width: 800px) {
  .list-container {
    flex-direction: row;
  }

  .list-controls {
    flex: 0 0 260px; /* 从280px减小到260px */
    height: auto;
  }

  .person-list {
    flex: 1;
    min-width: 0;
    height: 100%;
  }
}

/* 控制区域 - 紧凑设计 */
.list-controls {
  display: flex;
  flex-direction: column;
  gap: 8px; /* 从10px减小到8px */
  padding: 8px; /* 从10px减小到8px */
  background-color: #f9f9f9;
  border-radius: 4px;
  border: 1px solid #ddd;
  font-size: 13px;
}

.filter-group input {
  width: 100%;
  padding: 7px 10px; /* 从8px 10px减小 */
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 13px;
}

.checkbox-group label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 13px;
  margin: 0;
  font-weight: normal;
}

.checkbox-group input[type="checkbox"] {
  margin: 0;
  width: auto;
  height: auto;
  cursor: pointer;
}

.button-group button {
  width: 100%;
  padding: 7px; /* 从8px减小到7px */
  border: 1px solid #ccc;
  background: #f0f0f0;
  cursor: pointer;
  border-radius: 4px;
  font-size: 13px;
  font-weight: bold;
  white-space: nowrap;
}

.button-group button:hover {
  background: #e0e0e0;
}

/* 人员列表 - 合理高度（关键修改） */
.person-list {
  border: 1px solid #ccc;
  border-radius: 4px;
  max-height: calc(100vh - 320px); /* 优化计算：确保在大多数屏幕下不超出视口 */
  min-height: 300px; /* 减小最小高度 */
  overflow-y: auto;
  background-color: white;
  min-width: 300px;
}

.person-list ul {
  list-style: none;
  padding: 0;
  margin: 0;
  min-height: 300px; /* 与容器保持一致 */
}

.person-list li {
  padding: 10px 15px; /* 从12px减小到10px */
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
}

.person-list li:last-child {
  border-bottom: none;
}

.person-list li:hover {
  background-color: #f5f5f5;
}

.person-list li.selected {
  background-color: #e3f2fd;
  border-left: 3px solid #2196f3;
  padding-left: 12px;
}

.person-info {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.person-list button {
  flex-shrink: 0;
  padding: 5px 10px; /* 从6px 12px减小 */
  border: 1px solid #ff5252;
  background: #ff5252;
  color: white;
  cursor: pointer;
  border-radius: 4px;
  margin-left: 8px; /* 从10px减小到8px */
  white-space: nowrap;
  font-size: 12px; /* 从13px减小到12px */
}

.person-list button:hover {
  background: #ff1a1a;
  border-color: #ff1a1a;
}

.empty {
  text-align: center;
  color: #999;
  padding: 20px; /* 从40px 20px减小 */
  font-style: italic;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%; /* 使用百分比高度，避免固定min-height */
}

/* 小屏幕适配 */
@media (max-width: 800px) {
  .container {
    padding: 10px;
  }

  .url-group label, .server-select-group label {
    min-width: auto;
    width: 100%;
    font-size: 12px;
  }

  .url-group, .server-select-group {
    flex-direction: column;
    align-items: stretch;
  }

  .url-group input, .server-select-group select {
    width: 100%;
    min-width: auto;
    font-size: 12px;
  }

  .url-group button, .server-select-group button {
    width: 100%;
    font-size: 12px;
  }

  .server-section {
    margin-bottom: 15px;
  }

  .server-section h1 {
    font-size: 16px;
    margin-bottom: 10px;
  }

  .list-controls {
    padding: 6px;
    font-size: 12px;
    gap: 6px;
  }

  .filter-group input,
  .button-group button {
    padding: 6px;
    font-size: 12px;
  }

  .form-buttons {
    flex-direction: column;
  }

  .form-buttons button {
    width: 100%;
  }

  .person-list {
    max-height: calc(100vh - 350px); /* 小屏幕优化 */
    min-height: 250px;
  }

  .person-list ul {
    min-height: 250px;
  }

  .person-list li {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px; /* 从8px减小到6px */
    padding: 8px 12px; /* 从12px 15px减小 */
  }

  .person-list button {
    align-self: flex-end;
    width: 100%;
    max-width: 100px;
    margin-left: 0;
    margin-top: 6px;
  }

  .empty {
    padding: 15px;
    font-size: 13px;
  }
}
</style>