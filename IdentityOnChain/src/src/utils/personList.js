// src/utils/personList.js
import person from "@/views/person.vue";

export const personList = []; // 全局人员列表

/**
 * 新增人员
 * @param {Object} person - 人员信息
 */
export function localInsertPerson(person) {
    personList.push({ ...person }); // 深拷贝后添加到列表
}

/**
 * 查询人员
 * @param {string} id - 人员 ID
 * @returns {Object|null} - 查询到的人员信息，未找到时返回 null
 */
export function localGetPerson(id) {
    return personList.find((p) => p.id === id) || null;
}

/**
 * 查询所有人员
 * @returns {Array} - 所有人员列表
 */
export function localGetPersonList() {
    return personList;
}

/**
 * 修改人员
 * @param {Object} person - 人员信息
 */
export function localUpdatePerson(person) {
    const index = personList.findIndex((p) => p.id === person.id);
    if (index !== -1) {
        personList[index] = { ...person }; // 深拷贝后更新
    }
}

/**
 * 删除人员
 * @param {string} id - 人员 ID
 */
export function localRemovePerson(id) {
    const index = personList.findIndex((p) => p.id === id);
    if (index !== -1) {
        personList.splice(index, 1); // 删除人员
    }
}

export function cleanupLocalPersonList() {
    personList.splice(0, personList.length); // 清空人员
}