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
  return cacheHosts;
}

export function setServer(server){
  hosts = [server]

  // 取得所選 server 的 Port
  let selectedPort = '';
  try {
    selectedPort = new URL(server).port;
  } catch (e) {
    const match = server.match(/:(\d+)/);
    if (match) selectedPort = match[1];
  }

  // 根據 Port 在 cacheHosts 中尋找對應的 token
  const matchedItem = cacheHosts.find(item => {
    try {
      const portA = new URL(item.server).port;
      return portA && portA === selectedPort;
    } catch (e) {
      return false;
    }
  }) || cacheHosts.find(item => item.server === server);

  const token = matchedItem?.token || "";
  console.log('select server:', server, 'matched port:', selectedPort, 'token:', token)
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

    // 獲取 fetchURL 的 hostname (例如 192.168.171.194 或 localhost)
    let fetchHostname = '';
    try {
      fetchHostname = new URL(fetchURL).hostname;
    } catch (e) {
      // 如果 fetchURL 是相對路徑，使用目前瀏覽器的 window.location.hostname
      fetchHostname = window.location.hostname;
    }

    cacheHosts = data.data.map(item => {
      let nodeServer = item.server;
      // 如果 nodeServer 包含 127.0.0.1 或 localhost
      if (nodeServer.includes('127.0.0.1') || nodeServer.includes('localhost')) {
        const isLocalNodePort = nodeServer.includes(':4001') || nodeServer.includes(':5001');
        if (!isLocalNodePort) {
          // VM 上的節點 (node1, node2, node3)
          // 當從外部（非 localhost/127.0.0.1，如 ngrok 或實體 IP）連線時，
          // 直接對應到 Vite Proxy 相對路徑，避免外部無法存取 1001/2001/3001 port 以及 Mixed Content 封鎖。
          if (fetchHostname !== 'localhost' && fetchHostname !== '127.0.0.1') {
            if (nodeServer.includes(':1001')) {
              nodeServer = '/node1-api';
            } else if (nodeServer.includes(':2001')) {
              nodeServer = '/node2-api';
            } else if (nodeServer.includes(':3001')) {
              nodeServer = '/node3-api';
            } else {
              try {
                const url = new URL(nodeServer);
                url.hostname = fetchHostname;
                nodeServer = url.toString().replace(/\/$/, "");
              } catch (e) {
                nodeServer = nodeServer.replace('127.0.0.1', fetchHostname).replace('localhost', fetchHostname);
              }
            }
          } else {
            // 本機開發環境，直接替換 hostname
            try {
              const url = new URL(nodeServer);
              url.hostname = fetchHostname;
              nodeServer = url.toString().replace(/\/$/, ""); // 移除結尾的斜線
            } catch (e) {
              nodeServer = nodeServer.replace('127.0.0.1', fetchHostname).replace('localhost', fetchHostname);
            }
          }
        } else {
          // 本機上的節點 (node4, node5)，將 127.0.0.1 替換為本機實體 LAN IP (192.168.171.43)
          try {
            const url = new URL(nodeServer);
            url.hostname = '192.168.171.43';
            nodeServer = url.toString().replace(/\/$/, "");
          } catch (e) {
            nodeServer = nodeServer.replace('127.0.0.1', '192.168.171.43').replace('localhost', '192.168.171.43');
          }
        }
      }
      return { ...item, server: nodeServer };
    });

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

// 返回今天日期字串 YYYYMMDD
function formatTodayDateOnlyString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * 搜索今天建立的所有 Identities（不限前綴，以今天日期前端筛選）
 * @returns {Promise} - Identity array
 */
export async function searchTodayIdentities(){
  try {
    const todayStr = formatTodayDateOnlyString(); // e.g. "20260709"
    const [startTime, endTime] = formatTodayStringPair(); // "YYYYMMDD_000000" ~ "YYYYMMDD_235959"

    // prefix 空白 + 今天時間範圍，後端會搜尋 key 在時間範圍內的所有資料
    const idPartial = await searchIdentities({
      prefix:    '',
      startTime: startTime,
      endTime:   endTime,
      order:     'asc',
      limit:     10000,
    });

    // 前端再以 ID 包含今天日期確認（防御跨日残留資料）
    const allIds = (idPartial.value ?? []).filter(item => item.id && item.id.includes(todayStr));
    console.log(`searchTodayIdentities: fetched ${idPartial.value?.length ?? 0} total, filtered ${allIds.length} for today (${todayStr})`);

    return allIds;

  } catch (error) {
    console.error('failed to fetch identities:', error);
    throw error;
  }
}


/*
* 搜索今天建立的 identities 的 ids（不限前綴）
* @returns {Promise} - { normal: string[], revoked: string[] }
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
      let person = item.document || {};
      if (!person.id) {
        person.id = item.id;
      }
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
    // 1. 将参数展平（支持传入数组或多个独立的字符串参数）
    const flatHashes = hashes.flat(Infinity);

    // 2. 使用正则提取出所有符合 64 位十六进制格式的哈希值
    const cleanHashes = [];
    for (const item of flatHashes) {
      if (typeof item === 'string') {
        const matches = item.match(/[0-9a-fA-F]{64}/g);
        if (matches) {
          cleanHashes.push(...matches);
        }
      }
    }

    if (cleanHashes.length === 0) {
      throw new Error('未找到有效的 transaction hash (64位十六进制字符)');
    }

    const response = await axiosInstance.post(`/did/tx`, { "hashes": cleanHashes }, {
      headers: {
        'Content-Type': 'application/json', // 确保请求头为 JSON
      },
    });

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