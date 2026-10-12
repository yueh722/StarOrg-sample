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
    let targetURL = fetchURL;

    // 清理與修正 fetchURL 避免無效的 /app-api/api/ 組合導致 404
    if (targetURL.includes('/app-api/api/appservers') && targetURL.startsWith('http')) {
      try {
        const u = new URL(targetURL);
        if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
          targetURL = `${u.origin}/api/appservers`;
        }
      } catch(e) {}
    }

    let res;
    try {
      res = await fetch(targetURL, {
        headers: { 'ngrok-skip-browser-warning': 'true' }
      });
      if (!res.ok) throw new Error(`HTTP status ${res.status}`);
    } catch (e) {
      console.warn('[fetchServers] Direct fetch failed/CORS, attempting /app-api proxy fallback...', e);
      res = await fetch('/app-api/api/appservers', {
        headers: { 'ngrok-skip-browser-warning': 'true' }
      });
    }

    const data = await res.json();

    cacheHosts = (data.data || []).map(item => {
      let nodeServer = typeof item === 'string' ? item : (item.server || '');
      // 只要包含 1001, 2001, 3001 埠，一律對應至 Vite Proxy 相對路徑 /node1-api, /node2-api, /node3-api
      if (nodeServer.includes(':1001')) {
        nodeServer = '/node1-api';
      } else if (nodeServer.includes(':2001')) {
        nodeServer = '/node2-api';
      } else if (nodeServer.includes(':3001')) {
        nodeServer = '/node3-api';
      } else if (nodeServer.includes('127.0.0.1') || nodeServer.includes('localhost')) {
        const isLocalNodePort = nodeServer.includes(':4001') || nodeServer.includes(':5001');
        if (isLocalNodePort) {
          try {
            const url = new URL(nodeServer);
            url.hostname = '192.168.171.43';
            nodeServer = url.toString().replace(/\/$/, "");
          } catch (e) {
            nodeServer = nodeServer.replace('127.0.0.1', '192.168.171.43').replace('localhost', '192.168.171.43');
          }
        }
      }
      return typeof item === 'string' ? { server: nodeServer } : { ...item, server: nodeServer };
    });

    console.info('[fetchServers] Successfully loaded hosts:', cacheHosts);
    return getServers();
  } catch (err) {
    console.error('Error while fetching server, err:', err);
    return [];
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

// ── 401 自動刷新 Token 攔截器 ────────────────────────────────────────────
// 注意 axios 的 Promise 鏈機制：
//   success handler 裡 return Promise.reject() 不會觸發「同一個」interceptor 的 error handler，
//   而是直接傳給呼叫端。因此必須在兩個 handler 裡都直接執行刷新重試邏輯。

async function doRefreshAndRetry(config) {
  config._isRetry = true;
  console.warn('[axiosInstance] 401 Token 失效，自動刷新 Token 後重試...');
  try {
    const newServers = await fetchServers();
    if (newServers && newServers.length > 0) {
      const firstItem = cacheHosts[0];
      if (firstItem?.token) {
        setGlobalToken(firstItem.token);
        config.headers = config.headers || {};
        config.headers['Authorization'] = `Bearer ${firstItem.token}`;
      }
      console.info('[axiosInstance] Token 已刷新，重試請求:', config.url);
      return axiosInstance(config);
    }
  } catch (refreshErr) {
    console.error('[axiosInstance] 刷新 Token 失敗:', refreshErr.message);
  }
  return Promise.reject(new Error('Token 刷新失敗，請手動重新整理頁面'));
}

axiosInstance.interceptors.response.use(
  async (response) => {
    const data = response.data;
    // 後端以 HTTP 200 + body {code:401} 回報 Token 失效
    if (data && (data.code === 401 || data.code === '401')) {
      const config = response.config;
      if (config?._isRetry) {
        // 已重試過仍 401，直接拋錯給呼叫端
        const err = new Error(data.message || 'Token is invalid or expired');
        err.response = { status: 401, data };
        throw err;
      }
      // 在 success handler 內直接執行刷新重試（不能靠 reject 轉給 error handler）
      return doRefreshAndRetry(config);
    }
    return response;
  },
  async (error) => {
    const config = error.config;

    // 判斷是否為 HTTP 401
    const is401 = error.response?.status === 401
      || error.response?.data?.code === 401
      || error.response?.data?.code === '401';

    if (is401 && !config?._isRetry) {
      return doRefreshAndRetry(config);
    }

    return Promise.reject(error);
  }
);

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
 * 查询指定 id 的人员，並保留 meta 資訊（hashcode、revoked）
 * 供需要取得真實 Tx Hash 的場景使用
 * @param {...string} ids
 * @returns {Promise<Array<{id, document, hashcode, revoked}>>}
 */
export async function loadIdentitiesWithMeta(...ids) {
  try {
    const response = await axiosInstance.post(`/did/load`, {ids: ids}, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.data.error) {
      throw (response.data.error);
    }

    const items = response.data.value || [];
    // 印出完整 raw item 供診斷，確認後端究竟回傳哪些欄位
    console.log('[loadIdentitiesWithMeta] raw response.data:', JSON.stringify(response.data, null, 2));
    items.forEach((item, i) => {
      console.log(`[loadIdentitiesWithMeta] item[${i}] keys:`, Object.keys(item), 'values:', JSON.stringify(item));
    });
    return items;
  } catch (error) {
    console.error('failed to get identities with meta:', error);
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

/**
 * 獲取硬碟與儲存空間資訊
 */
export async function fetchStorageSize() {
  const endpoints = [
    '/app-api/api/storagesize',
    '/api/storagesize'
  ];

  if (fetchURL) {
    try {
      const u = new URL(fetchURL);
      // 如果 fetchURL 包含 /app-api/api/appservers，導出 /app-api/api/storagesize
      const storageUrl = fetchURL.replace('/appservers', '/storagesize');
      endpoints.unshift(storageUrl);
    } catch (e) {
      // fallback
    }
  }

  endpoints.push('http://localhost:3166/api/storagesize');

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        headers: { 'ngrok-skip-browser-warning': 'true' }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.success) {
          return data;
        }
      }
    } catch (e) {
      // continue to next endpoint
    }
  }

  return { success: false, chainnode: 'N/A', data: 'N/A' };
}

/**
 * 查詢真實區塊高度與節點 RPC 狀態
 * @param {string} serverUrl - 伺服器網址
 * @returns {Promise<number|null>} - 最新區塊高度或 null
 */
export async function fetchRealNodeStatus(serverUrl) {
  if (!serverUrl) return null;

  let rpcUrl = '';
  if (serverUrl.includes('/node1-api') || serverUrl.includes(':1001')) {
    rpcUrl = '/node-rpc/status';
  } else if (serverUrl.includes('/node2-api') || serverUrl.includes(':2001')) {
    rpcUrl = '/node2-rpc/status';
  } else if (serverUrl.includes('/node3-api') || serverUrl.includes(':3001')) {
    rpcUrl = '/node3-rpc/status';
  } else {
    try {
      const url = new URL(serverUrl);
      const port = parseInt(url.port, 10);
      let rpcPort = 26657;
      if (port >= 1001) {
        const nodeIndex = Math.round((port - 1001) / 1000);
        rpcPort = 26657 + nodeIndex * 1000;
      }
      const targetHostname = url.hostname === '192.168.171.43' ? '127.0.0.1' : url.hostname;
      rpcUrl = `http://${targetHostname}:${rpcPort}/status`;
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
        return parseInt(height, 10);
      }
    }
  } catch (e) {
    console.error('fetchRealNodeStatus error:', e);
  }
  return null;
}

/**
 * 多節點同步共識查驗：向各節點查詢同一筆 ID 紀錄，比對是否一致
 * @param {string} id - 識別碼
 * @param {string} [fallbackServer] - 選取的備用 Server
 * @returns {Promise<Array<{server: string, name: string, found: boolean, data: object|null, error?: string}>>}
 */
export async function queryAllNodesForId(id, fallbackServer = '') {
  const allServers = getServers();
  const currentFallback = fallbackServer || getServer() || '';
  if (!allServers || allServers.length === 0) {
    return [{ server: currentFallback, name: 'Node1', found: false, data: null }];
  }

  const nodeResults = await Promise.all(
    allServers.map(async (item, idx) => {
      const serverUrl = typeof item === 'string' ? item : item.server;
      const token = (typeof item === 'object' && item.token) ? item.token : null;
      const nodeName = `Node${idx + 1}`;
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const resp = await axios.post(`${serverUrl}/did/load`, { ids: [id] }, { headers, timeout: 8000 });
        const items = resp.data?.value || [];
        const found = items.some(v => v.id === id || (v.document && (v.document.id === id)));
        return { server: serverUrl, name: nodeName, found, data: items[0] || null };
      } catch (e) {
        console.warn(`[multiNodeCheck] ${nodeName} (${serverUrl}) failed:`, e.message);
        return { server: serverUrl, name: nodeName, found: false, data: null, error: e.message };
      }
    })
  );
  return nodeResults;
}

/**
 * 多節點同步共識查驗：向各節點查詢同一筆 Tx Hash 紀錄，比對是否一致
 * @param {string} hash - 交易 Hash
 * @param {string} [fallbackServer] - 選取的備用 Server
 * @returns {Promise<Array<{server: string, name: string, found: boolean, data: object|null, error?: string}>>}
 */
export async function queryAllNodesForHash(hash, fallbackServer = '') {
  const allServers = getServers();
  const currentFallback = fallbackServer || getServer() || '';
  if (!allServers || allServers.length === 0) {
    return [{ server: currentFallback, name: 'Node1', found: false, data: null }];
  }

  const nodeResults = await Promise.all(
    allServers.map(async (item, idx) => {
      const serverUrl = typeof item === 'string' ? item : item.server;
      const token = (typeof item === 'object' && item.token) ? item.token : null;
      const nodeName = `Node${idx + 1}`;
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const resp = await axios.post(`${serverUrl}/did/tx`, { hashes: [hash] }, { headers, timeout: 8000 });
        const found = resp.data && !resp.data.error && Object.keys(resp.data).length > 0;
        return { server: serverUrl, name: nodeName, found, data: resp.data || null };
      } catch (e) {
        console.warn(`[multiNodeCheck] ${nodeName} (${serverUrl}) failed:`, e.message);
        return { server: serverUrl, name: nodeName, found: false, data: null, error: e.message };
      }
    })
  );
  return nodeResults;
}
