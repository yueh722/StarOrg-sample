// server.js

import { createServer } from "http";
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
    const servers = await GetServerAddrOfABCIApp()
    if (servers.success) {
        servers.data = servers.data.map(item => {
            return {
                "server": 'http://' + item.server,
                "token": item.token,
            }
        })
    }
    return servers
}

const server = createServer(async (req, res) => {

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.method === 'GET' && req.url === '/api/appservers') {
        const data = await fetchServers()
        res.statusCode = 200;
        res.end(JSON.stringify(data));
    } else if (req.method === 'GET' && req.url === '/api/storagesize') {
        const programDataPath = process.env.ProgramData || "C:\\ProgramData";
        const chainnodePath = path.join(programDataPath, "chainnode");
        const dataPath = path.join(chainnodePath, "data");

        const chainnodeSize = getDirSize(chainnodePath);
        const dataSize = getDirSize(dataPath);

        res.statusCode = 200;
        res.end(JSON.stringify({
            success: true,
            chainnode: (chainnodeSize / (1024 * 1024)).toFixed(2) + " MB",
            data: (dataSize / (1024 * 1024)).toFixed(2) + " MB"
        }));
    } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Not Found' }));
    }
});

// must set server address to nodemaster.
setServerAddress('localhost:8080/websocket')

const PORT = 3166;
server.listen(PORT, () => {
    console.log(`✅ HTTP server on http://localhost:${PORT}`);
    console.log(`👉 Query http://localhost:${PORT}/api/appservers to fetch webservice addresses of node app`);
});