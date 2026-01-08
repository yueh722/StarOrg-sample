<template>
  <div class="person-container">
    <!-- 表单 -->
    <div class="form-container">
      <h1>人员管理</h1>
      <form @submit.prevent="handleAddPerson">
        <label>ID: <input v-model="person.id" type="text" required /></label>
        <label>姓名: <input v-model="person.name" type="text" required /></label>
        <label>性别:
          <select v-model="person.gender" required>
            <option value="男">男</option>
            <option value="女">女</option>
          </select>
        </label>
        <label>部门: <input v-model="person.department" type="text" required /></label>
        <label>入职日期: <input v-model="person.hireDate" type="date" required /></label>
        <label>状态:
          <select v-model="person.status" required>
            <option value="在职">在职</option>
            <option value="离职">离职</option>
          </select>
        </label>
        <button type="submit">新增</button>
        <button type="button" @click="handleUpdatePerson" :disabled="!isEditing || !isModified">修改</button>
        <button type="button" @click="handleRevokeAllPersons" >删除全部</button>
      </form>

    </div>

    <!-- 人员列表 -->
    <div class="list-container">
      <h3>人员列表</h3>
      <!-- 过滤输入框 -->
      <input
          v-model="filterText"
          type="text"
          placeholder="按姓名过滤"
          class="filter-input"
      />
      <!-- 人员列表 -->
      <div class="person-list">
        <ul>
          <li
              v-for="person in filteredPersonList"
              :key="person.id"
              @click="selectPerson(person)"
              :class="{ selected: person.id === selectedPersonId }"
          >
            {{ person.name }} (ID: {{ person.id }}, 性别: {{ person.gender }}, 状态: {{ person.status }})
            <button @click.stop="handleDeletePerson(person.id)">删除</button>
          </li>
        </ul>
      </div>
    </div>

    <div class="list-footer">
      <p><button type="button" @click="handleFetchAllPersons()">获取所有人员信息</button></p>
      <p><input type="checkbox" v-model="showRevokedPerson"> 显示已删除的人员</p>
    </div>
  </div>

  <p v-if="message" :class="messageClass">{{ message }}</p>

</template>

<script>
import {getDefaultPerson, getNewPerson, isPersonRevokedRemote} from '@/utils/api.js';
import {
  localInsertPerson,
  localUpdatePerson,
  localRemovePerson,
  personList,
  cleanupLocalPersonList,
  localGetPersonList
} from '@/utils/personList';
import {
  createIdentity,
  getAllIdentity,
  isPersonRevoked,
  revokeIdentity,
  searchIdentity,
  updateIdentity
} from "@/utils/api.js";

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
      selectedPersonId: null, // 当前选中的人员 ID
      filterText: '', // 过滤文本
      preFilterText: '',
      isEditing: false, // 是否处于编辑模式
      message: '',
      messageClass: '',
      showRevokedPerson: false,
    };
  },
  computed: {
    // 按姓名过滤的人员列表
    filteredPersonList() {
      if (this.preFilterText) {
        this.filterText = this.preFilterText;
        this.preFilterText = '';
      }

      if (!this.filterText) {
        return this.personList; // 如果没有过滤文本，显示所有人员
      }

      return this.personList.filter((person) =>
          person.name.toLowerCase().includes(this.filterText.toLowerCase())
      );
    },
    personList() {
      return personList;
    },
    // 检查表单内容是否被修改
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
    // 新增人员
    async handleAddPerson() {
      try {
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
    // 修改人员
    async handleUpdatePerson() {
      try {
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
    // 删除人员
    async handleDeletePerson(id) {
      try {
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
    // 选择人员
    async selectPerson(person) {
      try {
        const remotePerson = await searchIdentity(person.id)
        this.selectedPersonId = remotePerson.id; // 设置选中的人员 ID
        this.person = { ...remotePerson }; // 更新表单内容
        this.isEditing = true; // 进入编辑模式
      } catch(error) {
        this.message = '查询失败，' + error;
        this.messageClass = 'error';
      }
    },
    async handleFetchAllPersons() {
      try{
        cleanupLocalPersonList()

        let total = 0, revokedCount = 0, normalCount = 0, loadedCount = 0;

        const ids = await getAllIdentity();

        normalCount = ids.normal.length;
        revokedCount = ids.revoked.length;

        total = normalCount + revokedCount;
        var logText = `total: ${total}, revoked: ${revokedCount}, normal: ${normalCount}\n`;
        this.message = logText
        this.messageClass = 'info';

        //normal persons
        for (const id of ids.normal) {
          const normalPerson = await searchIdentity(id)
          localInsertPerson(normalPerson);
          this.refresh(normalPerson);

          loadedCount++
          this.message = logText + `loaded: ${loadedCount}\n`
        }

        if (this.showRevokedPerson) {
          //revoked persons
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
        this.message += '查询失败，' + error + '\n';
        this.messageClass = 'error';
      }
    },

    async handleRevokeAllPersons() {
      try{
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
        this.message += '删除失败，' + error + '\n';
        this.messageClass = 'error';
      }
    },

    refresh(person) {
      this.selectedPersonId = person.id; // 设置选中的人员 ID
      this.person = { ...person }; // 更新表单内容
    },

    // 重置表单
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
.person-container {
  display: flex;
  gap: 20px;
  padding: 20px;
}

/* 表单容器 */
.form-container {
  flex: 1;
  width: 300px;
  max-width: 400px;
}

/* 列表容器 */
.list-container {
  flex: 2;
  width: 600px;
  border: 2px solid #ccc;
  border-radius: 5px;
  padding: 10px;
}

/* 表单样式 */
form label {
  display: block;
  align-items: center;
  margin-bottom: 10px;
}

form label {
  min-width: 120px;
  margin-right: 10px;
  white-space: nowrap;
}

form label input,
form label select {
  display: block;
  flex: 1;
  padding: 5px;
  border: 1px solid #ccc;
  border-radius: 4px;
}

/* 按钮样式 */
form button {
  margin-right: 10px;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

form button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

/* 过滤输入框 */
.filter-input {
  width: 100%;
  padding: 8px;
  margin-bottom: 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
}

/* 人员列表 */
.person-list {
  width: 100%;
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 10px;
}

.person-list ul {
  list-style-type: none;
  padding: 0;
  margin: 0;
}

.person-list li {
  padding: 10px;
  border-bottom: 1px solid #eee;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.person-list li:hover {
  background-color: #f5f5f5;
}

.person-list li.selected {
  background-color: #e0f7fa;
}

.person-list button {
  background-color: #ff4d4d;
  color: white;
  border: none;
  padding: 5px 10px;
  border-radius: 3px;
  cursor: pointer;
}

.person-list button:hover {
  background-color: #ff1a1a;
}

/* 列表底部样式 */
.list-footer {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #ccc;
}

/* 其他样式 */
.success {
  color: green;
}

.error {
  color: red;
}
</style>