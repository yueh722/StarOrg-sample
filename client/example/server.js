// server.js

import { createServer, request as httpRequest } from "http";
import { GetServerAddrOfABCIApp } from "./setup.js";
import { setServerAddress, GetConnection } from "./conn.js";
import { StreamClient } from "../src/StreamClient.js";
import fs from "fs";
import path from "path";
import os from "os";

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


// ── 節點設定（A 電腦本機 node1, node2, node3；B 電腦 node4）────────────
const NODE4_HOST = process.env.NODE4_HOST || '192.168.170.102';
let NODES = [
    { id: 'node1', host: '127.0.0.1', apiPort: 1001, rpcPort: 26657, token: '' },
    { id: 'node2', host: '127.0.0.1', apiPort: 2001, rpcPort: 27657, token: '' },
    { id: 'node3', host: '127.0.0.1', apiPort: 3001, rpcPort: 28657, token: '' },
    { id: 'node4', host: NODE4_HOST, apiPort: 4001, rpcPort: 29657, token: '' }
];

let lastSyncTime = 0;
// 從 Master 取得最新在線 ABCI App 節點清單，動態更新與對齊真實節點清單、Host 與 Port
async function syncNodeTargetsFromMaster(force = false) {
    const now = Date.now();
    if (!force && (now - lastSyncTime) < 10000) {
        return;
    }
    try {
        const servers = await GetServerAddrOfABCIApp();
        if (servers && servers.success && Array.isArray(servers.data) && servers.data.length > 0) {
            const syncedNodes = [];
            servers.data.forEach((item, idx) => {
                if (!item || !item.server) return;
                // item.server 格式: "192.168.171.43:2001" 或 "127.0.0.1:1001"
                const cleanAddr = String(item.server).replace(/^https?:\/\//, '');
                const colonIdx = cleanAddr.lastIndexOf(':');
                if (colonIdx === -1) return;
                let host = cleanAddr.slice(0, colonIdx) || '127.0.0.1';
                const port = parseInt(cleanAddr.slice(colonIdx + 1), 10);
                if (!port) return;

                let nodeIndex = idx;
                if (port >= 1001) {
                    nodeIndex = Math.round((port - 1001) / 1000);
                }
                const nodeId = `node${nodeIndex + 1}`;
                const rpcPort = 26657 + nodeIndex * 1000;

                // 跨電腦部署校正：node4 運行於 B 電腦，若被回報為本機回環則校正為真實 IP
                if (nodeId === 'node4' && (host === '127.0.0.1' || host === 'localhost' || host === 'node4')) {
                    host = NODE4_HOST;
                }

                syncedNodes.push({
                    id: nodeId,
                    host: host,
                    apiPort: port,
                    rpcPort: rpcPort,
                    token: item.token || ''
                });
            });

            if (syncedNodes.length > 0) {
                NODES = syncedNodes;
            }
            lastSyncTime = now;
        }
    } catch (e) {
        // Master 尚未啟動時略過
    }
}

// 各節點主機儲存空間與鏈資料快取（由 Agent 定時回報至 Master，再傳入 server.js）
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
                        if (storage.node_id) nodeStorageCache[storage.node_id] = storage;
                        if (storage.node_name) nodeStorageCache[storage.node_name] = storage;
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
        servers.data = servers.data.map((item, idx) => {
            const cleanAddr = String(item.server).replace(/^https?:\/\//, '');
            const colonIdx = cleanAddr.lastIndexOf(':');
            const port = colonIdx !== -1 ? parseInt(cleanAddr.slice(colonIdx + 1), 10) : 0;

            let nodeProxyPath = `node${idx + 1}`;
            if (port === 1001) { nodeProxyPath = 'node1'; }
            else if (port === 2001) { nodeProxyPath = 'node2'; }
            else if (port === 3001) { nodeProxyPath = 'node3'; }

            return {
                "server": nodeProxyPath,
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
    if (rpcPort === 29657 && (targetHost === '127.0.0.1' || targetHost === 'localhost' || targetHost === 'node4')) {
        targetHost = NODE4_HOST;
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
        const csRpc = await fetchNodeRpcStatus(26657, '127.0.0.1');
        if (csRpc.ok) {
            node1SyncInfo = csRpc.data?.result?.sync_info;
        }
        consensusData = await fetchNodeDumpConsensus(26657, '127.0.0.1');
    } catch (e) { }

    const results = await Promise.all(NODES.map(async (node) => {
        const host = node.host || '127.0.0.1';
        const rpc = await fetchNodeRpcStatus(node.rpcPort, host);

        // 查找該節點所屬 Agent 回報的硬碟
        const nodeStorage = masterStorageMap[node.id] ||
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

        if (rpc.ok) {
            const sync = rpc.data?.result?.sync_info || {};
            return {
                nodeId: node.id,
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

            const isAgentOnline = !!(nodeStorage && nodeStorage.updated_at) || isConsensusOnline;
            return {
                nodeId: node.id,
                online: isAgentOnline,
                latestBlockHeight: peerHeight !== null ? peerHeight : (isConsensusOnline && node1SyncInfo ? parseInt(node1SyncInfo.latest_block_height || '0', 10) : null),
                latestBlockHash: (isConsensusOnline && node1SyncInfo) ? node1SyncInfo.latest_block_hash : null,
                latestBlockTime: (isConsensusOnline && node1SyncInfo) ? node1SyncInfo.latest_block_time : null,
                disk: diskInfo
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
    console.log(`[/did/] token-based → ${targetNode.id} (${targetNode.host}:${targetNode.apiPort})`);

    proxyToHost(targetNode.host, targetNode.apiPort, cleanPath, req, res);
}

function proxyToHost(targetHost, targetPort, targetPath, req, res) {
    const host = targetHost || '127.0.0.1';
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
        console.error(`[Server Proxy Error] ${req.method} ${req.url} -> ${host}:${targetPort}${targetPath} failed:`, err.message);
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

    // 整理出非重複節點列表（依 NodeID 或 NodeName 去重）
    const seenNodes = new Set();
    const nodesList = [];

    for (const [key, item] of Object.entries(masterStorageMap)) {
        if (!item) continue;
        const id = item.node_name || item.node_id || key;
        if (!seenNodes.has(id) && item.node_id) {
            seenNodes.add(id);
            const totalBytes = Number(item.disk_total_bytes) || 0;
            const freeBytes = Number(item.disk_free_bytes) || 0;
            const usedBytes = (totalBytes > freeBytes) ? (totalBytes - freeBytes) : 0;
            const targetId = item.node_name || id;
            const matchedNode = NODES.find(n => n.id === targetId || n.id === item.node_id);
            let nodeLocation = matchedNode?.host || '-';
            if (nodeLocation === '127.0.0.1' || nodeLocation === 'localhost') {
                nodeLocation = getLocalIp() || '127.0.0.1';
            }

            nodesList.push({
                nodeId: item.node_id,
                nodeName: item.node_name || id,
                hostName: item.host_name || (process.env.COMPUTERNAME || process.env.HOSTNAME || ''),
                diskTotal: item.total_space || (totalBytes > 0 ? (totalBytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB' : '-'),
                diskFree: item.free_space || (freeBytes > 0 ? (freeBytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB' : '-'),
                diskUsed: item.used_space || (usedBytes > 0 ? (usedBytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB' : '-'),
                diskUsedPercent: item.used_percent || (totalBytes > 0 ? ((usedBytes / totalBytes) * 100).toFixed(1) + ' %' : '-'),
                diskTotalBytes: totalBytes,
                diskFreeBytes: freeBytes,
                chainDataSize: item.chain_data_size || '',
                totalChainnodeSize: item.total_chainnode_size || '',
                dataSizeBytes: Number(item.data_size_bytes) || 0,
                totalSizeBytes: Number(item.total_size_bytes) || 0,
                updatedAt: item.updated_at || ''
            });
        }
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

    // 當 Master 尚未廣播各 Agent 儲存時，依已知節點清單建立預設節點狀態（無 Agent 回報時明確標示 '-'，不捏造虛擬數值）
    if (nodesList.length === 0) {
        for (const node of NODES) {
            const isLocal = node.host === '127.0.0.1' || node.host === 'localhost';
            const nodeChainnodeSize = isLocal ? getDirSize(chainnodePath) : 0;
            const nodeDataSize = isLocal ? getDirSize(dataPath) : 0;
            const nodeLocation = isLocal ? (getLocalIp() || '127.0.0.1') : (node.host || '-');

            nodesList.push({
                nodeId: node.id,
                nodeName: node.id,
                hostName: isLocal ? (process.env.COMPUTERNAME || process.env.HOSTNAME || 'Local') : '-',
                diskTotal: isLocal && localDiskTotal ? localDiskTotal : '-',
                diskFree: isLocal && localDiskFree ? localDiskFree : '-',
                diskUsed: '-',
                diskUsedPercent: '-',
                diskTotalBytes: isLocal ? localTotalBytes : 0,
                diskFreeBytes: isLocal ? localFreeBytes : 0,
                chainDataSize: isLocal && nodeDataSize > 0 ? (nodeDataSize / (1024 * 1024)).toFixed(2) + " MB" : '-',
                totalChainnodeSize: isLocal && nodeChainnodeSize > 0 ? (nodeChainnodeSize / (1024 * 1024)).toFixed(2) + " MB" : '-',
                dataSizeBytes: nodeDataSize,
                totalSizeBytes: nodeChainnodeSize,
                updatedAt: ''
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
    } else if (cleanPath.startsWith('/node1-rpc') || cleanPath.startsWith('/node-rpc')) {
        const targetPath = fullUrl.replace(/^\/node1-rpc|^\/node-rpc/, '') || '/';
        const n1 = NODES.find(n => n.id === 'node1') || { host: '127.0.0.1', rpcPort: 26657 };
        proxyToHost(n1.host, n1.rpcPort, targetPath, req, res);
    } else if (cleanPath.startsWith('/node2-rpc')) {
        const targetPath = fullUrl.replace(/^\/node2-rpc/, '') || '/';
        const n2 = NODES.find(n => n.id === 'node2') || { host: NODE2_HOST, rpcPort: 27657 };
        const host = (n2.host === '127.0.0.1' || n2.host === 'localhost' || n2.host === 'node2') ? NODE2_HOST : n2.host;
        proxyToHost(host, n2.rpcPort, targetPath, req, res);
    } else if (cleanPath.startsWith('/node3-rpc')) {
        const targetPath = fullUrl.replace(/^\/node3-rpc/, '') || '/';
        const n3 = NODES.find(n => n.id === 'node3') || { host: '127.0.0.1', rpcPort: 28657 };
        proxyToHost(n3.host, n3.rpcPort, targetPath, req, res);
    } else if (cleanPath.startsWith('/node4-rpc')) {
        const targetPath = fullUrl.replace(/^\/node4-rpc/, '') || '/';
        const n4 = NODES.find(n => n.id === 'node4') || { host: NODE4_HOST, rpcPort: 29657 };
        const host = (n4.host === '127.0.0.1' || n4.host === 'localhost' || n4.host === 'node4') ? NODE4_HOST : n4.host;
        proxyToHost(host, n4.rpcPort, targetPath, req, res);
    } else if (cleanPath === '/node1' || cleanPath.startsWith('/node1/') || cleanPath.startsWith('/node1-api')) {
        const targetPath = fullUrl.replace(/^\/node1(-api)?/, '') || '/';
        const n1 = NODES.find(n => n.id === 'node1') || { host: '127.0.0.1', apiPort: 1001 };
        proxyToHost(n1.host, n1.apiPort, targetPath, req, res);
    } else if (cleanPath === '/node2' || cleanPath.startsWith('/node2/') || cleanPath.startsWith('/node2-api')) {
        const targetPath = fullUrl.replace(/^\/node2(-api)?/, '') || '/';
        const n2 = NODES.find(n => n.id === 'node2') || { host: '127.0.0.1', apiPort: 2001 };
        proxyToHost(n2.host, n2.apiPort, targetPath, req, res);
    } else if (cleanPath === '/node3' || cleanPath.startsWith('/node3/') || cleanPath.startsWith('/node3-api')) {
        const targetPath = fullUrl.replace(/^\/node3(-api)?/, '') || '/';
        const n3 = NODES.find(n => n.id === 'node3') || { host: '127.0.0.1', apiPort: 3001 };
        proxyToHost(n3.host, n3.apiPort, targetPath, req, res);
    } else if (cleanPath === '/node4' || cleanPath.startsWith('/node4/') || cleanPath.startsWith('/node4-api')) {
        const targetPath = fullUrl.replace(/^\/node4(-api)?/, '') || '/';
        const n4 = NODES.find(n => n.id === 'node4') || { host: NODE4_HOST, apiPort: 4001 };
        const host = (n4.host === '127.0.0.1' || n4.host === 'localhost' || n4.host === 'node4') ? NODE4_HOST : n4.host;
        proxyToHost(host, n4.apiPort, targetPath, req, res);
    } else if (cleanPath.startsWith('/status')) {
        const n1 = NODES.find(n => n.id === 'node1') || { host: '127.0.0.1', rpcPort: 26657 };
        proxyToHost(n1.host, n1.rpcPort, fullUrl, req, res);
    } else if (req.method === 'GET' && cleanPath === '/nodes/status') {
        await handleNodesStatus(res);
    } else if (cleanPath.startsWith('/did/')) {
        await proxyDid(req, res, fullUrl);
    } else {
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
    console.log(`✅ HTTP server on http://localhost:${PORT}`);
    console.log(`👉 NodeMaster WebSocket target: ${nodeMasterWs}`);
    console.log(`👉 Query http://localhost:${PORT}/api/appservers to fetch webservice addresses of node app`);
    initStorageStream();
    await syncNodeTargetsFromMaster(true);
});

// 定期自動向 Master/Agent 同步最新節點清單與 IP 位址（每 15 秒）
setInterval(() => {
    syncNodeTargetsFromMaster().catch(() => { });
}, 15000);