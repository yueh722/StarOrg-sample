// server.js

import { createServer, request as httpRequest } from "http";
import { GetServerAddrOfABCIApp } from "./setup.js";
import { setServerAddress, GetConnection } from "./conn.js";
import { SetupClient } from "../src/SetupClient.js";
import { StreamClient } from "../src/StreamClient.js";
import fs from "fs";
import path from "path";
import os from "os";
import { logger } from "./logger.js";

function getLocalIp() {
    try {
        const ifaces = os.networkInterfaces();
        for (const name of Object.keys(ifaces)) {
            for (const net of ifaces[name]) {
                if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.')) {
                    return net.address;
                }
            }
        }
    } catch (e) { }
    return '127.0.0.1';
}


// 自動從 Agent 回報的網卡列表中取得真實區域網 IPv4
function getRealHostIPv4(node) {
    const addresses = node.host_info?.ip_addresses || [];
    for (const entry of addresses) {
        const parts = entry.split(" | ", 2);
        if (parts.length === 2) {
            const ip = parts[1].trim();
            if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip) && !ip.startsWith('127.') && !ip.startsWith('169.254.')) {
                return ip;
            }
        }
    }
    return '';
}

// 判斷是否為 Docker 內部虛擬網橋網段 (172.17.0.0/16 ~ 172.31.255.255)
function isDockerInternalIp(ip) {
    if (!ip) return false;
    return /^172\.(1[7-9]|2[0-9]|3[0-1])\./.test(ip);
}


// ── 節點設定（全動態化機制，支援 node1 ~ nodeN 任意數量擴充）────────────
const localHostName = os.hostname() || process.env.COMPUTERNAME || process.env.HOSTNAME || 'localhost';

// 動態推導節點預設連線資訊（Port 泛用公式：apiPort = 1001 + (N-1)*1000, rpcPort = 26657 + (N-1)*1000）
function createDefaultNodeConfig(nodeIdOrNum, customHost = '', customHostName = '') {
    const num = typeof nodeIdOrNum === 'number' 
        ? nodeIdOrNum 
        : (parseInt(String(nodeIdOrNum).replace(/\D/g, ''), 10) || 1);
    const id = `node${num}`;
    const envHost = process.env[`NODE${num}_HOST`] || (num === 4 ? (process.env.NODE4_HOST || '') : '');
    const finalHost = customHost || envHost || '127.0.0.1';
    return {
        id,
        host: finalHost,
        hostName: customHostName || (finalHost !== '127.0.0.1' && finalHost !== 'localhost' ? finalHost : localHostName),
        apiPort: 1001 + (num - 1) * 1000,
        rpcPort: 26657 + (num - 1) * 1000,
        token: ''
    };
}

// 動態獲取指定節點配置（若 Master 已同步則優先使用真實數據，否則自動推導，絕不丟失）
function getNodeConfig(nodeIdOrNum) {
    const num = typeof nodeIdOrNum === 'number' 
        ? nodeIdOrNum 
        : (parseInt(String(nodeIdOrNum).replace(/\D/g, ''), 10) || 1);
    const id = `node${num}`;
    const found = NODES.find(n => n.id === id);
    if (found) return found;
    return createDefaultNodeConfig(num);
}

// 預設節點清單（在 Master 尚未連線時的基本兜底，Master 連線後自動全量替換）
let NODES = [1, 2, 3].map(i => createDefaultNodeConfig(i));

let lastSyncTime = 0;
// 從 Master 取得最新在線 ABCI App 節點清單，動態更新與對齊真實節點清單、Host 與 Port
async function syncNodeTargetsFromMaster(force = false) {
    const now = Date.now();
    if (!force && (now - lastSyncTime) < 10000) {
        return;
    }
    try {
        const conn = await GetConnection();
        let chainState = null;
        if (conn) {
            try {
                const setupClient = new SetupClient(conn);
                chainState = await setupClient.MakeChainState();
            } catch (e) { }
        }
        const allChainNodes = chainState ? chainState.AllNodes() : [];

        const servers = await GetServerAddrOfABCIApp();
        if (servers && servers.success && Array.isArray(servers.data) && servers.data.length > 0) {
            const syncedNodes = [];
            const localIp = getLocalIp();

            servers.data.forEach((item, idx) => {
                if (!item || !item.server) return;
                // item.server 格式: "192.168.171.43:2001" 或 "127.0.0.1:1001"
                const cleanAddr = String(item.server).replace(/^https?:\/\//, '');
                const colonIdx = cleanAddr.lastIndexOf(':');
                if (colonIdx === -1) return;
                let host = cleanAddr.slice(0, colonIdx) || '127.0.0.1';
                const port = parseInt(cleanAddr.slice(colonIdx + 1), 10);
                if (!port) return;

                // 若為 Docker 內部虛擬網段 IP，Windows 宿主機必須透過 127.0.0.1 連線映射端口
                if (isDockerInternalIp(host)) {
                    host = '127.0.0.1';
                }

                let nodeIndex = idx;
                if (port >= 1001) {
                    nodeIndex = Math.round((port - 1001) / 1000);
                }
                const nodeId = item.node_name || `node${nodeIndex + 1}`;
                const rpcPort = 26657 + nodeIndex * 1000;

                // 比對在線 Agent 的節點資訊 (比對 node_name 或 node_id)
                const matchedChainNode = allChainNodes.find(n => 
                    (n.node_info?.node_name && n.node_info?.node_name.toLowerCase() === nodeId.toLowerCase()) ||
                    (item.node_name && n.node_info?.node_name.toLowerCase() === item.node_name.toLowerCase()) ||
                    (item.node_id && n.node_info?.node_id === item.node_id)
                );

                // 完全動態自在線 Agent / Master 取得真實主機名稱，無需任何寫死
                let detectedHostName = item.host_name || 
                                       matchedChainNode?.host_info?.host_name || 
                                       nodeStorageCache[nodeId]?.host_name || 
                                       '';

                // 若回報為本機回環或節點名，自動比對在線 Agent 的實體 IP
                if (host === '127.0.0.1' || host === 'localhost' || host === nodeId) {
                    if (matchedChainNode) {
                        const detectedIp = getRealHostIPv4(matchedChainNode);
                        if (detectedIp && detectedIp !== localIp && !isDockerInternalIp(detectedIp)) {
                            host = detectedIp;
                        }
                    }
                    const envHost = process.env[`NODE${nodeIndex + 1}_HOST`] || (nodeId === 'node4' ? (process.env.NODE4_HOST || '') : '');
                    if (envHost) {
                        host = envHost;
                    }
                }

                // 泛用動態 fallback：若無特定主機名稱，本機則為 localHostName，遠端則帶 host IP
                if (!detectedHostName) {
                    detectedHostName = (host === '127.0.0.1' || host === 'localhost' || host === localIp) ? localHostName : host;
                }

                syncedNodes.push({
                    id: nodeId,
                    host: host,
                    hostName: detectedHostName,
                    apiPort: port,
                    rpcPort: rpcPort,
                    token: item.token || ''
                });
            });

            if (syncedNodes.length > 0) {
                const prevDesc = NODES.map(n => `${n.id}=${n.host}:${n.apiPort}`).join(', ');
                const newDesc = syncedNodes.map(n => `${n.id}=${n.host}:${n.apiPort}`).join(', ');
                if (prevDesc !== newDesc) {
                    logger.info(`[NodeSync] 節點目標已更新: ${newDesc}`);
                }
                NODES = syncedNodes;
            }
            lastSyncTime = now;
        }
    } catch (e) {
        // Master 尚未啟動時略過
    }
}

// 各節點主機儲存空間與鏈資料快取（由 Agent 定時回報至 Master，再傳入 server.js）
// 快取鍵規範：改以 `${hostName}_${nodeName}` 為主要鍵，同時保留 node_id 避免跨主機同名 node 互相覆蓋
const nodeStorageCache = {};
let streamClientInstance = null;

// 初始化 WebSocket Stream 監聽 Master 廣播的各 Agent 儲存空間狀態
async function initStorageStream() {
    if (streamClientInstance) return;
    try {
        const conn = await GetConnection();
        if (conn) {
            streamClientInstance = new StreamClient(conn, {
                onStorage: (storage) => {
                    if (storage) {
                        const h = storage.host_name || '';
                        const n = storage.node_name || '';
                        // 以 hostName + "_" + nodeName 作為主要複合 key，避免跨機資料覆蓋
                        if (h && n) {
                            nodeStorageCache[`${h}_${n}`] = storage;
                        }
                        if (storage.node_id) {
                            nodeStorageCache[storage.node_id] = storage;
                        }
                        if (storage.node_name) {
                            nodeStorageCache[storage.node_name] = storage;
                        }
                    }
                }
            });
        }
    } catch (e) {
        // Stream 尚未連線時略過
    }
}

// 主動向 Master 查詢所有 Agent 最新回報的儲存狀態
async function getStorageFromMaster() {
    try {
        const conn = await GetConnection();
        if (conn) {
            const res = await conn.callMethod('status_getStorageStatus');
            if (res && res.success && res.data && typeof res.data === 'object') {
                for (const [k, v] of Object.entries(res.data)) {
                    if (v) {
                        const h = v.host_name || '';
                        const n = v.node_name || '';
                        // 以 hostName + "_" + nodeName 作為主要複合 key
                        if (h && n) {
                            nodeStorageCache[`${h}_${n}`] = v;
                        }
                    }
                    nodeStorageCache[k] = v;
                }
            }
        }
    } catch (e) {
        // master 尚未啟動或呼叫異常時 fallback
    }
    return nodeStorageCache;
}

function getDirSize(dirPath) {
    let size = 0;
    try {
        if (!fs.existsSync(dirPath)) return 0;
        const stats = fs.statSync(dirPath);
        if (stats.isFile()) {
            return stats.size;
        } else if (stats.isDirectory()) {
            const files = fs.readdirSync(dirPath);
            for (let i = 0; i < files.length; i++) {
                size += getDirSize(path.join(dirPath, files[i]));
            }
        }
    } catch (e) {
        // Ignore errors
    }
    return size;
}

async function fetchServers() {
    await syncNodeTargetsFromMaster();
    //在浏览器中调用GetServerAddrOfABCIApp会出错，所以用server转发一下。
    const servers = await GetServerAddrOfABCIApp();
    if (servers.success && Array.isArray(servers.data)) {
        const localHost = os.hostname() || process.env.COMPUTERNAME || process.env.HOSTNAME || 'localhost';
        servers.data = servers.data.map((item, idx) => {
            const cleanAddr = String(item.server).replace(/^https?:\/\//, '');
            const colonIdx = cleanAddr.lastIndexOf(':');
            const port = colonIdx !== -1 ? parseInt(cleanAddr.slice(colonIdx + 1), 10) : 0;

            let nodeProxyPath = `node${idx + 1}`;
            if (port >= 1001) {
                const nodeNum = Math.round((port - 1001) / 1000) + 1;
                nodeProxyPath = `node${nodeNum}`;
            }

            const matchedNode = NODES.find(n => n.apiPort === port || n.id === nodeProxyPath);
            const hostName = item.host_name || matchedNode?.hostName || localHost;

            return {
                "server": nodeProxyPath,
                "hostName": hostName,
                "token": item.token,
            };
        });
    }
    return servers;
}

// Token → Port 對照表快取，TTL 60 秒
let tokenPortCache = null;
let tokenPortCacheTime = 0;
const TOKEN_PORT_CACHE_TTL = 60 * 1000;

async function getTokenPortMap() {
    const now = Date.now();
    if (tokenPortCache && (now - tokenPortCacheTime) < TOKEN_PORT_CACHE_TTL) {
        return tokenPortCache;
    }
    try {
        const servers = await GetServerAddrOfABCIApp();
        if (servers.success && Array.isArray(servers.data)) {
            const map = {};
            for (const item of servers.data) {
                // item.server 格式: "127.0.0.1:1001"
                const portMatch = String(item.server).match(/:([0-9]+)$/);
                if (portMatch && item.token) {
                    map[item.token] = parseInt(portMatch[1], 10);
                }
            }
            tokenPortCache = map;
            tokenPortCacheTime = now;
            return map;
        }
    } catch (e) {
        console.error('[getTokenPortMap] error:', e.message);
    }
    return tokenPortCache || {};
}

// 向指定 RPC port 查詢 CometBFT 節點狀態（內部用，不經 proxyToLocal）
function fetchNodeRpcStatus(rpcPort, host = '127.0.0.1') {
    let targetHost = host;
    if (isDockerInternalIp(targetHost)) {
        targetHost = '127.0.0.1';
    }
    if (targetHost === '127.0.0.1' || targetHost === 'localhost' || targetHost.startsWith('node')) {
        const matched = NODES.find(n => n.rpcPort === rpcPort);
        if (matched && matched.host && matched.host !== '127.0.0.1' && matched.host !== 'localhost') {
            targetHost = matched.host;
        }
    }
    return new Promise((resolve) => {
        const req = httpRequest(
            { hostname: targetHost, port: rpcPort, path: '/status', method: 'GET' },
            (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try { resolve({ ok: true, data: JSON.parse(data) }); }
                    catch (e) { resolve({ ok: false }); }
                });
            }
        );
        req.on('error', () => resolve({ ok: false }));
        req.setTimeout(3000, () => { req.destroy(); resolve({ ok: false }); });
        req.end();
    });
}

// 查詢 CometBFT 共識狀態（內部用，交叉檢驗 P2P Peer 參與出塊狀況）
function fetchNodeDumpConsensus(rpcPort = 26657, host = '127.0.0.1') {
    return new Promise((resolve) => {
        const req = httpRequest(
            { hostname: host, port: rpcPort, path: '/dump_consensus_state', method: 'GET' },
            (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try { resolve(JSON.parse(data).result); }
                    catch (e) { resolve(null); }
                });
            }
        );
        req.on('error', () => resolve(null));
        req.setTimeout(2000, () => { req.destroy(); resolve(null); });
        req.end();
    });
}

// 判定指定節點是否在線（直連 RPC 回應或參與 P2P 共識出塊）
async function isNodeActive(node, consensusData = null) {
    if (!node) return false;
    const host = node.host || '127.0.0.1';
    const rpc = await fetchNodeRpcStatus(node.rpcPort, host);
    if (rpc.ok) {
        return true;
    }
    if (consensusData && Array.isArray(consensusData.peers)) {
        const targetHost = node.host === '127.0.0.1' ? '' : node.host;
        const matchedPeer = consensusData.peers.find(p => 
            (targetHost && p.node_address?.includes(targetHost)) ||
            (p.node_address?.includes(node.id))
        );
        if (matchedPeer) {
            const rHeight = parseInt(matchedPeer.peer_state?.round_state?.height || '0', 10);
            if (rHeight > 1) {
                return true;
            }
        }
    }
    return false;
}

// GET /nodes/status：並行查全部節點 RPC + 依節點各自所屬主機的硬碟狀態與鏈資料大小
async function handleNodesStatus(res) {
    await syncNodeTargetsFromMaster();
    // 本地預設磁碟資訊（作為 Master 尚未收到回報時的 fallback）
    const programDataPath = process.env.ProgramData || 'C:\\ProgramData';
    let localTotalBytes = 0, localUsedBytes = 0;
    try {
        if (typeof fs.statfsSync === 'function') {
            const st = fs.statfsSync(programDataPath);
            localTotalBytes = st.bsize * st.blocks;
            localUsedBytes = localTotalBytes - st.bsize * st.bavail;
        }
    } catch (e) { /* statfs 不可用時留 0 */ }

    // 向 Master 查詢各節點 Agent 最新回報的儲存資訊（支援跨電腦部署）
    const masterStorageMap = await getStorageFromMaster();

    // 取得本地 node1 的共識狀態作為 fallback 比對（若遠端節點 RPC 暫被防火牆阻擋時可交叉驗證出塊狀態）
    let consensusData = null;
    let node1SyncInfo = null;
    try {
        const firstNode = getNodeConfig(1);
        const csRpc = await fetchNodeRpcStatus(firstNode.rpcPort, firstNode.host);
        if (csRpc.ok) {
            node1SyncInfo = csRpc.data?.result?.sync_info;
        }
        consensusData = await fetchNodeDumpConsensus(firstNode.rpcPort, firstNode.host);
    } catch (e) { }

    const results = await Promise.all(NODES.map(async (node) => {
        const host = node.host || '127.0.0.1';
        const rpc = await fetchNodeRpcStatus(node.rpcPort, host);

        // 查找該節點所屬 Agent 回報的硬碟（優先依 hostName + "_" + nodeName 查找，防止同名跨機覆蓋）
        const hostKey = (node.hostName && node.id) ? `${node.hostName}_${node.id}` : '';
        const nodeStorage = (hostKey && masterStorageMap[hostKey]) ||
            masterStorageMap[node.id] ||
            masterStorageMap[node.id.toLowerCase()] ||
            null;

        let totalBytes = null;
        let usedBytes = null;

        if (nodeStorage && Number(nodeStorage.disk_total_bytes) > 0) {
            totalBytes = Number(nodeStorage.disk_total_bytes);
            const freeBytes = Number(nodeStorage.disk_free_bytes) || 0;
            usedBytes = (totalBytes > freeBytes) ? (totalBytes - freeBytes) : 0;
        } else {
            // 本地節點且能讀取到本地真實磁碟時帶入真實量測值；其餘尚未收到 Agent 回報時明確回傳 null，不捏造數值
            const isLocal = node.host === '127.0.0.1' || node.host === 'localhost';
            if (isLocal && localTotalBytes > 0) {
                totalBytes = localTotalBytes;
                usedBytes = localUsedBytes;
            } else {
                totalBytes = null;
                usedBytes = null;
            }
        }

        const diskInfo = {
            totalBytes,
            usedBytes
        };

        const resolvedHostName = node.hostName || nodeStorage?.host_name || localHostName;

        if (rpc.ok) {
            const sync = rpc.data?.result?.sync_info || {};
            return {
                nodeName: node.id,
                hostName: resolvedHostName,
                online: true,
                latestBlockHeight: parseInt(sync.latest_block_height || '0', 10),
                latestBlockHash: sync.latest_block_hash || null,
                latestBlockTime: sync.latest_block_time || null,
                disk: diskInfo
            };
        } else {
            // 若直連 RPC 被防火牆阻擋 (ETIMEDOUT)，但共識網路 (P2P) 中該節點正常會簽出塊
            let peerHeight = null;
            let isConsensusOnline = false;
            if (consensusData && Array.isArray(consensusData.peers)) {
                const targetHost = node.host === '127.0.0.1' ? '' : node.host;
                const matchedPeer = consensusData.peers.find(p => 
                    (targetHost && p.node_address?.includes(targetHost)) ||
                    (p.node_address?.includes(node.id))
                );
                if (matchedPeer) {
                    const rHeight = parseInt(matchedPeer.peer_state?.round_state?.height || '0', 10);
                    if (rHeight > 1) {
                        peerHeight = rHeight - 1;
                        isConsensusOnline = true;
                    }
                }
            }

            // 只有在直連 RPC 成功，或共識網路 (P2P) 確認該節點有參與出塊時，節點才算在線 (online)
            // 不應僅因主機 NodeAgent 曾回報過硬碟磁碟資訊 (nodeStorage.updated_at) 就判定節點在線
            const isNodeOnline = isConsensusOnline && (peerHeight !== null);
            return {
                nodeName: node.id,
                hostName: resolvedHostName,
                online: isNodeOnline,
                latestBlockHeight: isNodeOnline ? peerHeight : null,
                latestBlockHash: (isNodeOnline && node1SyncInfo) ? node1SyncInfo.latest_block_hash : null,
                latestBlockTime: (isNodeOnline && node1SyncInfo) ? node1SyncInfo.latest_block_time : null,
                disk: isNodeOnline ? diskInfo : { totalBytes: null, usedBytes: null }
            };
        }
    }));

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(results));
}

// /did/ 路由：以 Bearer Token 比對目標節點，比對不到則 fallback node1
async function proxyDid(req, res, urlPath) {
    await syncNodeTargetsFromMaster();

    const qIdx = urlPath.indexOf('?');
    const cleanPath = qIdx >= 0 ? urlPath.slice(0, qIdx) : urlPath;

    let targetNode = NODES[0]; // fallback to node1

    // 以 Bearer Token 比對節點
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (token) {
        const foundByToken = NODES.find(n => n.token === token);
        if (foundByToken) {
            targetNode = foundByToken;
        } else {
            const map = await getTokenPortMap();
            if (map[token]) {
                const foundByPort = NODES.find(n => n.apiPort === map[token]);
                if (foundByPort) targetNode = foundByPort;
            }
        }
    }
    logger.info(`[/did/] token-based → ${targetNode.id} (${targetNode.host}:${targetNode.apiPort})`);

    proxyToHost(targetNode.host, targetNode.apiPort, cleanPath, req, res);
}

function proxyToHost(targetHost, targetPort, targetPath, req, res) {
    let host = targetHost || '127.0.0.1';
    if (isDockerInternalIp(host)) {
        host = '127.0.0.1';
    }
    const options = {
        hostname: host,
        port: targetPort,
        path: targetPath,
        method: req.method,
        headers: {
            ...req.headers,
            host: `${host}:${targetPort}`
        }
    };

    const proxyReq = httpRequest(options, (proxyRes) => {
        const headers = { ...proxyRes.headers };
        headers['access-control-allow-origin'] = '*';
        headers['access-control-allow-headers'] = '*';
        headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS';

        res.writeHead(proxyRes.statusCode, headers);
        proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (err) => {
        logger.error(`[Server Proxy Error] ${req.method} ${req.url} -> ${host}:${targetPort}${targetPath} failed: ${err.message}`);
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({ error: `Proxy to ${host}:${targetPort} failed: ${err.message}` }));
    });

    req.pipe(proxyReq, { end: true });
}

// GET /api/storagesize：回傳各節點主機硬碟空間與鏈資料庫大小（彙整各 Agent 回報）
async function handleStorageSize(req, res) {
    await syncNodeTargetsFromMaster();
    // 先向 Master 查詢所有在線節點 Agent 回報的硬碟與鏈資料大小
    const masterStorageMap = await getStorageFromMaster();

    // 取得本地 node1 的共識狀態，供比對 P2P 出塊狀態
    let consensusData = null;
    try {
        const firstNode = getNodeConfig(1);
        consensusData = await fetchNodeDumpConsensus(firstNode.rpcPort, firstNode.host);
    } catch (e) { }

    // 並行檢測 NODES 中各節點的在線狀態
    const onlineStatusMap = {};
    await Promise.all(NODES.map(async (n) => {
        onlineStatusMap[n.id] = await isNodeActive(n, consensusData);
    }));

    // 1. 整理 MasterStorageMap：以 (hostName + "_" + nodeName) 聚合，只保留該節點最新的一次回報記錄
    const latestStorageMap = new Map();
    for (const [key, item] of Object.entries(masterStorageMap)) {
        if (!item || !item.node_name) continue;
        const name = String(item.node_name).trim();
        // 過濾已廢棄或無效節點名稱 (如 node2,node3)
        if (name.includes(',') || name.includes('+') || name.includes(' ')) continue;

        const host = item.host_name || '';
        const compositeKey = `${host}_${name}`;

        const existing = latestStorageMap.get(compositeKey);
        if (!existing) {
            latestStorageMap.set(compositeKey, item);
        } else {
            // 比對更新時間，只保留較新的一筆記錄
            const existingTime = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
            const newTime = item.updated_at ? new Date(item.updated_at).getTime() : 0;
            if (newTime >= existingTime) {
                latestStorageMap.set(compositeKey, item);
            }
        }
    }

    // 2. 以真實註冊節點清單 NODES 為主幹依序產出，確保節點名稱、主機名與順序皆精準對齊 /nodes/status
    const nodesList = [];
    const emittedKeys = new Set();

    for (const node of NODES) {
        const compositeKey = `${node.hostName}_${node.id}`;
        emittedKeys.add(compositeKey);

        // 查找該節點的最新儲存記錄
        const item = latestStorageMap.get(compositeKey) || 
                     latestStorageMap.get(`_${node.id}`) ||
                     masterStorageMap[node.id] ||
                     null;

        const isOnline = onlineStatusMap[node.id] ?? false;
        const totalBytes = Number(item?.disk_total_bytes) || 0;
        const freeBytes = Number(item?.disk_free_bytes) || 0;
        const usedBytes = (totalBytes > freeBytes) ? (totalBytes - freeBytes) : 0;

        nodesList.push({
            nodeName: node.id,
            hostName: node.hostName,
            online: isOnline,
            diskTotal: isOnline ? (item?.total_space || (totalBytes > 0 ? (totalBytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB' : null)) : null,
            diskFree: isOnline ? (item?.free_space || (freeBytes > 0 ? (freeBytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB' : null)) : null,
            diskUsed: isOnline ? (item?.used_space || (usedBytes > 0 ? (usedBytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB' : null)) : null,
            diskUsedPercent: isOnline ? (item?.used_percent || (totalBytes > 0 ? ((usedBytes / totalBytes) * 100).toFixed(1) + ' %' : null)) : null,
            diskTotalBytes: isOnline ? totalBytes : null,
            diskFreeBytes: isOnline ? freeBytes : null,
            chainDataSize: isOnline ? (item?.chain_data_size || null) : null,
            totalChainnodeSize: isOnline ? (item?.total_chainnode_size || null) : null,
            dataSizeBytes: isOnline ? (Number(item?.data_size_bytes) || 0) : null,
            totalSizeBytes: isOnline ? (Number(item?.total_size_bytes) || 0) : null,
            updatedAt: isOnline ? (item?.updated_at || null) : null
        });
    }

    // 3. 補上外部獨立上線且未在預設 NODES 內的合法節點 (依 hostName + nodeName 唯一輸出)
    for (const [compositeKey, item] of latestStorageMap.entries()) {
        if (emittedKeys.has(compositeKey)) continue;
        emittedKeys.add(compositeKey);

        const name = item.node_name;
        const host = item.host_name || '';
        const totalBytes = Number(item.disk_total_bytes) || 0;
        const freeBytes = Number(item.disk_free_bytes) || 0;
        const usedBytes = (totalBytes > freeBytes) ? (totalBytes - freeBytes) : 0;

        nodesList.push({
            nodeName: name,
            hostName: host,
            online: true,
            diskTotal: item.total_space || (totalBytes > 0 ? (totalBytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB' : null),
            diskFree: item.free_space || (freeBytes > 0 ? (freeBytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB' : null),
            diskUsed: item.used_space || (usedBytes > 0 ? (usedBytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB' : null),
            diskUsedPercent: item.used_percent || (totalBytes > 0 ? ((usedBytes / totalBytes) * 100).toFixed(1) + ' %' : null),
            diskTotalBytes: totalBytes,
            diskFreeBytes: freeBytes,
            chainDataSize: item.chain_data_size || null,
            totalChainnodeSize: item.total_chainnode_size || null,
            dataSizeBytes: Number(item.data_size_bytes) || 0,
            totalSizeBytes: Number(item.total_size_bytes) || 0,
            updatedAt: item.updated_at || null
        });
    }

    // 本機 fallback 統計（在單機或未連 Master 時使用）
    const programDataPath = process.env.ProgramData || "C:\\ProgramData";
    const chainnodePath = path.join(programDataPath, "chainnode");
    const dataPath = path.join(chainnodePath, "data");

    let localDiskTotal = "";
    let localDiskFree = "";
    let localTotalBytes = 0;
    let localFreeBytes = 0;
    try {
        if (typeof fs.statfsSync === 'function') {
            const stats = fs.statfsSync(programDataPath);
            localTotalBytes = stats.bsize * stats.blocks;
            localFreeBytes = stats.bsize * stats.bavail;
            localDiskTotal = (localTotalBytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
            localDiskFree = (localFreeBytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
        }
    } catch (e) { }

    // 當 Master 尚未廣播各 Agent 儲存時，依已知節點清單建立預設節點狀態（無 Agent 回報或離線時明確以 null 標記，不捏造虛擬數值）
    if (nodesList.length === 0) {
        for (const node of NODES) {
            const isOnline = onlineStatusMap[node.id] ?? false;
            const isLocal = node.host === '127.0.0.1' || node.host === 'localhost';
            const nodeChainnodeSize = (isOnline && isLocal) ? getDirSize(chainnodePath) : 0;
            const nodeDataSize = (isOnline && isLocal) ? getDirSize(dataPath) : 0;

            nodesList.push({
                nodeName: node.id,
                hostName: isLocal ? (process.env.COMPUTERNAME || process.env.HOSTNAME || 'Local') : '-',
                online: isOnline,
                diskTotal: isOnline && isLocal && localDiskTotal ? localDiskTotal : null,
                diskFree: isOnline && isLocal && localDiskFree ? localDiskFree : null,
                diskUsed: null,
                diskUsedPercent: null,
                diskTotalBytes: isOnline && isLocal ? localTotalBytes : null,
                diskFreeBytes: isOnline && isLocal ? localFreeBytes : null,
                chainDataSize: isOnline && isLocal && nodeDataSize > 0 ? (nodeDataSize / (1024 * 1024)).toFixed(2) + " MB" : null,
                totalChainnodeSize: isOnline && isLocal && nodeChainnodeSize > 0 ? (nodeChainnodeSize / (1024 * 1024)).toFixed(2) + " MB" : null,
                dataSizeBytes: isOnline ? nodeDataSize : null,
                totalSizeBytes: isOnline ? nodeChainnodeSize : null,
                updatedAt: null
            });
        }
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
        success: true,
        nodes: nodesList
    }));
}

const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
    }

    const fullUrl = req.url || '/';
    const cleanPath = fullUrl.split('?')[0];

    if (req.method === 'GET' && (cleanPath === '/api/appservers' || cleanPath === '/app-api/api/appservers')) {
        const data = await fetchServers();
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(data));
    } else if (req.method === 'GET' && (cleanPath === '/api/storagesize' || cleanPath === '/app-api/api/storagesize')) {
        await handleStorageSize(req, res);
    } else if (cleanPath.startsWith('/node') && (cleanPath.includes('-rpc') || cleanPath.includes('-api') || /^\/node\d+/.test(cleanPath))) {
        // ── 動態 RPC 路由 (支援 /nodeN-rpc 以及 /node-rpc，相容任意 N 節點) ──
        const rpcMatch = cleanPath.match(/^\/(?:node(\d+)|node)-rpc(.*)/);
        if (rpcMatch) {
            const nodeNum = rpcMatch[1] ? parseInt(rpcMatch[1], 10) : 1;
            const targetNode = getNodeConfig(nodeNum);
            const targetPath = fullUrl.replace(/^\/(?:node\d+|node)-rpc/, '') || '/';
            proxyToHost(targetNode.host, targetNode.rpcPort, targetPath, req, res);
            return;
        }

        // ── 動態 Web/API 路由 (支援 /nodeN, /nodeN/... 以及 /nodeN-api，相容任意 N 節點) ──
        const apiMatch = cleanPath.match(/^\/node(\d+)(?:-api)?(\/.*)?$/);
        if (apiMatch) {
            const nodeNum = parseInt(apiMatch[1], 10);
            const targetNode = getNodeConfig(nodeNum);
            const targetPath = fullUrl.replace(/^\/node\d+(-api)?/, '') || '/';
            proxyToHost(targetNode.host, targetNode.apiPort, targetPath, req, res);
            return;
        }
    } else if (cleanPath.startsWith('/status')) {
        const n1 = getNodeConfig(1);
        proxyToHost(n1.host, n1.rpcPort, fullUrl, req, res);
    } else if (req.method === 'GET' && cleanPath === '/nodes/status') {
        await handleNodesStatus(res);
    } else if (cleanPath.startsWith('/did/')) {
        await proxyDid(req, res, fullUrl);
    } else {
        logger.warn(`[404 Not Found] ${req.method} ${cleanPath}`);
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Not Found' }));
    }
});

// must set server address to nodemaster.
const nodeMasterWs = process.env.NODE_MASTER_WS || 'localhost:8080/websocket';
setServerAddress(nodeMasterWs);

const PORT = parseInt(process.env.PORT, 10) || 3166;
server.listen(PORT, async () => {
    logger.info(`✅ HTTP server on http://localhost:${PORT}`);
    logger.info(`👉 NodeMaster WebSocket target: ${nodeMasterWs}`);
    logger.info(`👉 Query http://localhost:${PORT}/api/appservers to fetch webservice addresses of node app`);
    logger.info(`📁 日誌儲存目錄: ${logger.logDir}`);
    initStorageStream();
    await syncNodeTargetsFromMaster(true);
});

// 定期自動向 Master/Agent 同步最新節點清單與 IP 位址（每 15 秒）
setInterval(() => {
    syncNodeTargetsFromMaster().catch(() => { });
}, 15000);

// 全域未攔截錯誤監聽，防止服務默默閃退
process.on('uncaughtException', (err) => {
    logger.error('[Uncaught Exception]', err);
});
process.on('unhandledRejection', (reason) => {
    logger.error('[Unhandled Rejection]', reason);
});