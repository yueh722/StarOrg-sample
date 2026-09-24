// server.js

import { createServer, request as httpRequest } from "http";
import { GetServerAddrOfABCIApp } from "./setup.js";
import { setServerAddress } from "./conn.js";
import fs from "fs";
import path from "path";

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
    } else if (urlPath.startsWith('/did/')) {
        proxyToLocal(1001, urlPath, req, res);
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