// server.js

import { createServer, request as httpRequest } from "http";
import { GetServerAddrOfABCIApp } from "./setup.js";
import { setServerAddress } from "./conn.js";
import fs from "fs";
import path from "path";

// ── 節點設定（新增節點時在此擴充）──────────────────────────────────
const NODES = [
    { id: 'node1', apiPort: 1001, rpcPort: 26657 },
    { id: 'node2', apiPort: 2001, rpcPort: 27657 },
    { id: 'node3', apiPort: 3001, rpcPort: 28657 },
];

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
    //在浏览器中调用GetServerAddrOfABCIApp会出错，所以用server转发一下。
    const servers = await GetServerAddrOfABCIApp();
    if (servers.success) {
        servers.data = servers.data.map(item => {
            return {
                "server": 'http://' + item.server,
                "token": item.token,
            }
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
function fetchNodeRpcStatus(rpcPort) {
    return new Promise((resolve) => {
        const req = httpRequest(
            { hostname: '127.0.0.1', port: rpcPort, path: '/status', method: 'GET' },
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

// GET /nodes/status：並行查全部節點 RPC + 共用硬碟資訊
async function handleNodesStatus(res) {
    // 硬碟資訊（各節點跑在同一台機器，共用同一顆磁碟）
    const programDataPath = process.env.ProgramData || 'C:\\ProgramData';
    let totalBytes = 0, usedBytes = 0;
    try {
        if (typeof fs.statfsSync === 'function') {
            const st = fs.statfsSync(programDataPath);
            totalBytes = st.bsize * st.blocks;
            usedBytes  = totalBytes - st.bsize * st.bavail;
        }
    } catch (e) { /* statfs 不可用時留 0 */ }

    const results = await Promise.all(NODES.map(async (node) => {
        const rpc = await fetchNodeRpcStatus(node.rpcPort);
        if (rpc.ok) {
            const sync = rpc.data?.result?.sync_info || {};
            return {
                nodeId:            node.id,
                online:            true,
                latestBlockHeight: parseInt(sync.latest_block_height || '0', 10),
                latestBlockHash:   sync.latest_block_hash   || null,
                latestBlockTime:   sync.latest_block_time   || null,
                disk: { totalBytes, usedBytes }
            };
        } else {
            return {
                nodeId:            node.id,
                online:            false,
                latestBlockHeight: null,
                latestBlockHash:   null,
                latestBlockTime:   null,
                disk: { totalBytes, usedBytes }
            };
        }
    }));

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(results));
}

// /did/ 路由：優先用 ?node= 參數，次用 Bearer Token，最後 fallback node1
async function proxyDid(req, res, urlPath) {
    // 解析 query string，取出 ?node=，轉發時去除該參數
    const qIdx = urlPath.indexOf('?');
    const cleanPath   = qIdx >= 0 ? urlPath.slice(0, qIdx) : urlPath;
    const queryString = qIdx >= 0 ? urlPath.slice(qIdx + 1) : '';
    const params      = new URLSearchParams(queryString);
    const nodeParam   = params.get('node'); // e.g. "node2" 或 "2"

    let targetPort = 1001; // fallback

    if (nodeParam) {
        // ?node=node2 或 ?node=2 都支援
        const found = NODES.find(n => n.id === nodeParam || n.id === `node${nodeParam}`);
        if (found) targetPort = found.apiPort;
        console.log(`[/did/] ?node=${nodeParam} → port ${targetPort}`);
    } else {
        // 以 Bearer Token 比對節點
        const authHeader = req.headers['authorization'] || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
        if (token) {
            const map = await getTokenPortMap();
            if (map[token]) targetPort = map[token];
        }
        console.log(`[/did/] token-based → port ${targetPort}`);
    }

    proxyToLocal(targetPort, cleanPath, req, res);
}

function proxyToLocal(targetPort, targetPath, req, res) {
    const options = {
        hostname: '127.0.0.1',
        port: targetPort,
        path: targetPath,
        method: req.method,
        headers: {
            ...req.headers,
            host: `127.0.0.1:${targetPort}`
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
        console.error(`[Server Proxy Error] ${req.method} ${req.url} -> 127.0.0.1:${targetPort}${targetPath} failed:`, err.message);
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({ error: `Proxy to local port ${targetPort} failed: ${err.message}` }));
    });

    req.pipe(proxyReq, { end: true });
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

    const urlPath = req.url || '/';

    if (req.method === 'GET' && (urlPath === '/api/appservers' || urlPath === '/app-api/api/appservers')) {
        const data = await fetchServers();
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(data));
    } else if (req.method === 'GET' && (urlPath === '/api/storagesize' || urlPath === '/app-api/api/storagesize')) {
        const programDataPath = process.env.ProgramData || "C:\\ProgramData";
        const chainnodePath = path.join(programDataPath, "chainnode");
        const dataPath = path.join(chainnodePath, "data");

        const chainnodeSize = getDirSize(chainnodePath);
        const dataSize = getDirSize(dataPath);

        let diskTotal = "";
        let diskFree = "";
        try {
            if (typeof fs.statfsSync === 'function') {
                const stats = fs.statfsSync(programDataPath);
                const totalBytes = stats.bsize * stats.blocks;
                const freeBytes = stats.bsize * stats.bavail;
                diskTotal = (totalBytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
                diskFree = (freeBytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
            }
        } catch (e) {
            // Ignore error if statfs not available
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({
            success: true,
            chainnode: (chainnodeSize / (1024 * 1024)).toFixed(2) + " MB",
            data: (dataSize / (1024 * 1024)).toFixed(2) + " MB",
            diskTotal,
            diskFree
        }));
    } else if (urlPath.startsWith('/node1-api')) {
        const targetPath = urlPath.replace(/^\/node1-api/, '') || '/';
        proxyToLocal(1001, targetPath, req, res);
    } else if (urlPath.startsWith('/node2-api')) {
        const targetPath = urlPath.replace(/^\/node2-api/, '') || '/';
        proxyToLocal(2001, targetPath, req, res);
    } else if (urlPath.startsWith('/node3-api')) {
        const targetPath = urlPath.replace(/^\/node3-api/, '') || '/';
        proxyToLocal(3001, targetPath, req, res);
    } else if (urlPath.startsWith('/node1-rpc') || urlPath.startsWith('/node-rpc')) {
        const targetPath = urlPath.replace(/^\/node1-rpc|^\/node-rpc/, '') || '/';
        proxyToLocal(26657, targetPath, req, res);
    } else if (urlPath.startsWith('/node2-rpc')) {
        const targetPath = urlPath.replace(/^\/node2-rpc/, '') || '/';
        proxyToLocal(27657, targetPath, req, res);
    } else if (urlPath.startsWith('/node3-rpc')) {
        const targetPath = urlPath.replace(/^\/node3-rpc/, '') || '/';
        proxyToLocal(28657, targetPath, req, res);
    } else if (urlPath.startsWith('/status')) {
        proxyToLocal(26657, urlPath, req, res);
    } else if (req.method === 'GET' && urlPath === '/nodes/status') {
        await handleNodesStatus(res);
    } else if (urlPath.startsWith('/did/')) {
        await proxyDid(req, res, urlPath);
    } else {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Not Found' }));
    }
});

// must set server address to nodemaster.
setServerAddress('localhost:8080/websocket');

const PORT = 3166;
server.listen(PORT, () => {
    console.log(`✅ HTTP server on http://localhost:${PORT}`);
    console.log(`👉 Query http://localhost:${PORT}/api/appservers to fetch webservice addresses of node app`);
});