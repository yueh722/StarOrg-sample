// src/api/identity.js
import axios from 'axios';


// CORS - Cross-origin resource sharing 问题已经由webservice支持。
//const host = '/api';
const revokedFlag = ' - #revoked#'

let cacheHosts = [];
let hosts = [];
let fetchURL = '';

export async function fetchServerListFromURL(urlStr){
  fetchURL = urlStr
  return await fetchServers()
}

export function getServers(){
  return cacheHosts.map(item => item.server);
}

export function setServer(server){
  hosts = [server]

  const token = cacheHosts.find(item => item.server === server)?.token || "";
  console.log('select server:', server, token)
  setGlobalToken(token)
}

export function getServer(){
  return hosts[0];
}

export function getFetchURL(){
  return fetchURL
}

export async function fetchServers(){

  try {
    const res = await fetch(fetchURL);
    const data = await res.json();
    cacheHosts = data.data;
    console.info(cacheHosts);
    return getServers();
  } catch (err) {
    console.error('Error while fetching server, err:', err);
  }
}


// 创建 axios 实例
const axiosInstance = axios.create();

const setGlobalToken = (token) => {
  if (token) {
    // common 表示对所有请求方法生效
    axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    localStorage.setItem('auth_token', token);
  } else {
    delete axiosInstance.defaults.headers.common['Authorization'];
    localStorage.removeItem('auth_token');
  }
};

// 请求拦截器
axiosInstance.interceptors.request.use((config) => {

  if (hosts.length === 0) {
    console.error('No hosts found.');
    return config;
  }

  // 随机选择一个 host
  const randomHost = hosts[Math.floor(Math.random() * hosts.length)];
  if (randomHost) {
    config.baseURL = randomHost; // 动态设置 baseURL
  } else {
    config.baseURL = hosts[0];
  }
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

const id_prefix = 'user:new:';

/**
 * 搜索今天创建的Identities
 * @returns {Promise} - Identity array
 */
export async function searchTodayIdentities(){
  try {
    const desc = true
    let endTime = formatTodayStringPair()[1]
    let startTime = formatTodayStringPair()[0]
    let allIds = []

    for (let round = 1;;round++){
      const idPartial = await searchIdentities({
        prefix:    id_prefix,

        // 前缀与起始时间完全一致的记录，都会被纳入结果中.
        // 20260623_090000, 20260623_0900001234 两种时间格式都接受，因为bookmark中的时间格式是后者
        startTime: startTime,

        // 前缀与结束时间（endTime）完全一致的记录，将从结果集中剔除.
        // 20260623_090000, 20260623_0900001234 两种时间格式都接受，因为bookmark中的时间格式是后者
        endTime:   endTime,

        order:     desc?'desc':'asc',
        limit:     100,
      })

      const len = idPartial.value?.length ?? 0
      const lastId = idPartial.value?.at(-1).id ?? undefined
      console.log("round:", round, ", got:", len, ", limit:", 100, ", bookmark:", idPartial.bookmark, " , lastId:", lastId)

      allIds.push(...idPartial.value??[]);

      if (idPartial.bookmark == null || idPartial.bookmark === '') {
        // bookmark 是查询下一页所需的标识ID。
        // a. 采用降序（desc）排序时，bookmark 等于 idPartial.value 中的最后一条数据ID,
        //    所以此时使用bookmark和idPartial.value最后一条记录id中的时间作为下一次查询的endTime的效果是一样的。
        // b. 采用升序（asc）排序时，bookmark 为下一页第一条数据的ID字符串。
        // c. 若 bookmark 为空，则代表在当前筛选条件下，已查询到结果集的最后一页。
        break
      }

      const nextFilterTime = idPartial.bookmark?.split(":").pop()
      if (desc) {
        // use either bookmark or last element of idTrunk.value, because they are identical.
        // endTime = idPartial.value[-1]
        endTime = nextFilterTime
      } else {
        // must use bookmark to do next search.
        startTime = nextFilterTime
      }
    }

    //allIds holds all result of identities at this moment.
    return allIds

  } catch (error) {
    console.error('failed to fetch identities:', error);
    throw error;
  }
}


/*
* 搜索今天创建的identities的ids
* @returns {Promise} - array that have id and revoke-state
 */
export async function searchTodayIds(){
  try {
    const allIds = await searchTodayIdentities();

    const normalPersons = [];
    const revokedPersons = [];

    allIds.forEach(item => {
      if (item.revoked) {
        revokedPersons.push(item.id);
      } else if (item.id != "") {
        normalPersons.push(item.id);
      }
    });

    return {
      normal: normalPersons,
      revoked: revokedPersons
    }
  }catch(error){
    console.error('failed to fetch identities:', error);
    throw error;
  }
}

/**
 * 查询人员
 * @param {object} filter - 搜索条件
 * @returns {Promise} - 返回对象数组
 */
export async function searchIdentities(filter) {
  try {
    const response = await axiosInstance.post(`/did/search`, filter, {
      headers: {
        'Content-Type': 'application/json', // 确保请求头为 JSON
      },
    });

    // response from search
    // succeed
    /*
    {
      "value": [{...},{...},...],
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
    console.error('failed to search identity:', error);
    throw error;
  }
}

export async function isPersonRevokedRemote(id) {
  try {
    const response = await loadIdentities(id);
    const person = response.data.value[0]
    if (person.id === '') {
      throw new Error(id + ' not exist');
    }
    return (person.revoked)
  } catch (error) {
    console.error('failed to find identity:', error);
    throw error;
  }
}

export function isPersonRevoked(person) {
  return person.name.includes(revokedFlag)
}

/**
 * 查询指定id的人员
 * * @param id array
 * * @returns {Object} - 返回对象数组
 */
export async function loadIdentities(...ids) {
  try {
    const response = await axiosInstance.post(`/did/load`, {ids: ids},{
      headers: {
        'Content-Type': 'application/json', // 确保请求头为 JSON
      },
    });

    // response from load
    // succeed
    /*
    {
      "value": [{...},{...},...],
    }

    //failure
    {
      "error": ""
    }
    */

    if (response.data.error) {
      throw (response.data.error);
    }

    let value = []
    response.data.value.forEach((item) => {
      let person = item.document;
      if (item.revoked){
        person.name += revokedFlag
      }

      value.push(person);
    })

    if (value.length === 1) {
      return value[0];
    }

    return value

  } catch (error) {
    console.error('failed to get identities:', error);
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

export async function getIdentityByHash(...hashes) {
  try {
    const response = await axiosInstance.post(`/did/history`, {"hashes": hashes}, {
      headers: {
        'Content-Type': 'application/json', // 确保请求头为 JSON
      },
    });

    // example response from history
    /*
    {
      "B03E5E7CD5424265F767F61E8DFBA7BDC9FB716074C5603A4F44F3A33DF9BD4A": {
          "error": "error message" //not empty if failure happenes on this tx
      },
      "FF3E5E7CD5424265F767F61E8DFBA7BDC9FB716074C5603A4F44F3A33DF9BDD0": {
          "raw_data": {...}, // succeed
      },
    }
    */

    if (response.data.error) {
      throw (response.data.error);
    }

    return response.data;
  } catch (error) {
    console.error('failed to get identity by hash:', error);
    throw error;
  }
}

//////////////////////////////////////////////////////////////////////////
//
// identity & person functions
//
export function convertPersonToIdentity(person) {
  //const jstr = JSON.stringify(person)

  return {
    id: person.id,
    document: person,
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


export function getUserId() {
  return id_prefix + formatNowStringLong();
}

export function getNewPerson(person) {
  person.id = getUserId();
  return person;
}

export function convertIdentityToPerson(identity) {
  try {
    //validate identity's hashcode here if we need to
    //identity.hashcode

    //const utf8String = atob(identity.document); // 解码 Base64
    //const jsonString = decodeURIComponent(utf8String); //UTF8 -> json string
    //return JSON.parse(jsonString);

    return JSON.parse(identity.document);
    //return identity.document
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

// format: yyyyMMdd_hhmmssSSSS
function formatTimeString(date) {
  const now = date
  // 年
  const y = now.getFullYear();
  // 月 补0
  const m = String(now.getMonth() + 1).padStart(2, '0');
  // 日
  const d = String(now.getDate()).padStart(2, '0');
  // 时
  const h = String(now.getHours()).padStart(2, '0');
  // 分
  const mi = String(now.getMinutes()).padStart(2, '0');
  // 秒
  const s = String(now.getSeconds()).padStart(2, '0');

  //毫秒
  const ms = String(now.getMilliseconds()).padStart(4, '0');

  return `${y}${m}${d}_${h}${mi}${s}${ms}`;
}

// format: yyyyMMdd_hhmmssSSSS
function formatNowStringLong(){
  return formatTimeString(new Date());
}

function formatTodayStringPair() {
  const now = new Date();
  // 今日零点 00:00:00
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  // 今日结束 23:59:59
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  const startStr = formatTimeString(start).slice(0, -4);
  const endStr = formatTimeString(end).slice(0, -4);
  return [startStr, endStr];
}