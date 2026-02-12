// src/api/identity.js
import axios from 'axios';


// CORS - Cross-origin resource sharing 问题已经由webservice支持。
//const host = '/api';
const revokedFlag = ' - #revoked#'

const hosts = [];

export function setServer(url){
  hosts[0] = url;
}

export function getServer(){
  return hosts[0]
}


// 创建 axios 实例
const axiosInstance = axios.create();

// 请求拦截器
axiosInstance.interceptors.request.use((config) => {
  // 随机选择一个 host
  const randomHost = hosts[Math.floor(Math.random() * hosts.length)];
  config.baseURL = randomHost; // 动态设置 baseURL
  console.log('Using host:', randomHost);
  return config;
});

// 设置默认请求头
axiosInstance.defaults.headers.post['Content-Type'] = 'application/json';
axiosInstance.defaults.headers.put['Content-Type'] = 'application/json';

/**
 * 新增人员
 * @param {Object} person - 人员信息
 * @returns {Promise} - 请求结果
 */
export async function createIdentity(person) {
  try {
    const response = await axiosInstance.post(`/did/create`, convertPersonToIdentity(person), {
      headers: {
        'Content-Type': 'application/json', // 确保请求头为 JSON
      },
    });

    // example response from create
    // succeed
    /*
    {
      "hash": "B03E5E7CD5424265F767F61E8DFBA7BDC9FB716074C5603A4F44F3A33DF9BD4A",
    }

    //failure
    {
      "error": ""
    }
    */

    if (response.data.error) {
      throw (response.data.error);
    }

    return response.data;
  } catch (error) {
    console.error('failed to add identity:', error);
    throw error;
  }
}

/**
 * 查询人员
 * @param {string} id - 人员 ID
 * @returns {Promise} - 请求结果
 */
export async function searchIdentity(id) {
  try {
    const response = await axiosInstance.get(`/did/search/${id}`);

    // response from search
    // succeed
    /*
    {
      "key": "key1",
      "value": value,
    }

    //failure
    {
      "error": ""
    }
    */

    if (response.data.error) {
      throw (response.data.error);
    }

    let person = convertIdentityToPerson(response.data.value);
    if (response.data.value.revoked){
      person.name += revokedFlag
    }

    return person;

  } catch (error) {
    console.error('failed to search identity:', error);
    throw error;
  }
}

export async function isPersonRevokedRemote(id) {
  try {
    const response = await axiosInstance.get(`/did/search/${id}`);
    if (response.data.value.id === '') {
      throw new Error(id + ' not exist');
    }
    return (response.data.value.revoked)
  } catch (error) {
    console.error('failed to find identity:', error);
    throw error;
  }
}

export function isPersonRevoked(person) {
  return person.name.includes(revokedFlag)
}

/**
 * 查询所有人员
 * * @returns {Object} - 返回一个对象，包含两个数组：
 *  *   - normal: value 为 normal 状态 的 person id 数组
 *  *   - revoked: value 为 revoked 状态 的 person id 数组
 */
export async function getAllIdentity() {
  try {
    const response = await axiosInstance.get(`/did/list`);

    // response from list
    // succeed
    /*
    {
      "key": "key1",
      "value": {
        "id1": 1,
        "id2": 0,  //revoked
        "id3": 1,
      },
    }

    //failure
    {
      "error": ""
    }
    */

    if (response.data.error) {
      throw (response.data.error);
    }



    //const IdsArray = Object.keys(response.data.value);
    //return IdsArray;
    //return response.data.value;

    const normalPersons = [];
    const revokedPersons = [];

    Object.entries(response.data.value).forEach(([id,state]) => {
      if (state === 0) {
        revokedPersons.push(id);
      } else if (state === 1) {
        normalPersons.push(id);
      }
    });

    return {
      normal: normalPersons,
      revoked: revokedPersons
    }
  } catch (error) {
    console.error('failed to get all identities:', error);
    throw error;
  }
}

/**
 * 修改人员
 * @param {Object} person - 人员信息
 * @returns {Promise} - 请求结果
 */
export async function updateIdentity(person) {
  try {
    const response = await axiosInstance.post(`/did/update`, convertPersonToIdentity(person), {
      headers: {
        'Content-Type': 'application/json', // 确保请求头为 JSON
      },
    });

    // example response from update
    // succeed
    /*
    {
      "hash": "B03E5E7CD5424265F767F61E8DFBA7BDC9FB716074C5603A4F44F3A33DF9BD4A",
    }

    //failure
    {
      "error": ""
    }
    */

    if (response.data.error) {
      throw (response.data.error);
    }

    return response.data;
  } catch (error) {
    console.error('failed to update identity:', error);
    throw error;
  }
}

/**
 * 删除人员
 * @param {string} id - 人员 ID
 * @returns {Promise} - 请求结果
 */
export async function revokeIdentity(id) {
  try {
/*    if (await isPersonRevokedRemote(id)){
      throw new Error(id + ' is already revoked');
    }*/

    const response = await axiosInstance.delete(`/did/revoke/${id}`);

    // example response from revoke
    // succeed
    /*
    {
      "hash": "B03E5E7CD5424265F767F61E8DFBA7BDC9FB716074C5603A4F44F3A33DF9BD4A",
    }

    //failure
    {
      "error": ""
    }
    */

    if (response.data.error) {
      throw (response.data.error);
    }

    return response.data;
  } catch (error) {
    console.error('failed to revoke identity:', error);
    throw error;
  }
}

//////////////////////////////////////////////////////////////////////////
//
// identity & person functions
//
export function convertPersonToIdentity(person) {
  const jstr = JSON.stringify(person)

  return {
    id: person.id,
    document: btoa(encodeURIComponent(jstr)),
    hashcode: '',
    revoked: false
  }
}

export const getDefaultPerson = () => ({
  id: getUserId(),
  name: '',
  gender: '男', // 默认性别为男
  department: '',
  hireDate: '',
  status: '在职', // 默认状态为在职
});

export function generateGuid() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}

function getUserId() {
  return generateGuid().substring(0, 8);
}

export function getNewPerson(person) {
  person.id = getUserId();
  return person;
}

export function convertIdentityToPerson(identity) {
  try {
    //validate identity's hashcode here if we need to
    //identity.hashcode

    const utf8String = atob(identity.document); // 解码 Base64
    const jsonString = decodeURIComponent(utf8String); //UTF8 -> json string

    return JSON.parse(jsonString);
  } catch (error) {
    //console.error("Failed to convert identity to person:", error);
    //return a person object without any other details but id.
    return {
      ...getDefaultPerson(),
      id: identity.id,
    }
    //throw error;
  }
}