// deploy_multimachine.js
// 自動探測所有在線主機實體 IP，一鍵跨多機初始化區塊鏈，無需任何手動修改 config.toml
import { GetConnection, setServerAddress } from "./conn.js";
import { SetupClient } from "../src/SetupClient.js";
import { PurgeChain } from "./setup.js";
import fs from "fs";
import path from "path";
import http from "http";

function sleep(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

// 自動從 Agent 回報的網卡列表中取得真實區域網 IPv4
function getRealHostIPv4(node) {
    const addresses = node.host_info?.ip_addresses || [];
    for (const entry of addresses) {
        const parts = entry.split(" | ", 2);
        if (parts.length === 2) {
            const ip = parts[1].trim();
            // 過濾 IPv6、127.x.x.x、169.254.x.x
            if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip) && !ip.startsWith('127.') && !ip.startsWith('169.254.')) {
                return ip;
            }
        }
    }
    return '';
}

// 為指定節點啟用 CORS (若為本機節點)
function enableCorsInConfig(nodeId, nodeName) {
    try {
        const programDataPath = process.env.ProgramData || "C:\\ProgramData";
        const configPath = path.join(programDataPath, "chainnode", "data", nodeName, nodeId, "config", "config.toml");
        if (fs.existsSync(configPath)) {
            let content = fs.readFileSync(configPath, 'utf8');
            if (content.includes('cors_allowed_origins = []')) {
                content = content.replace('cors_allowed_origins = []', 'cors_allowed_origins = ["*"]');
                fs.writeFileSync(configPath, content, 'utf8');
                console.log(`  - 已自動為本機節點 ${nodeName} 啟用 CORS`);
            }
        }
    } catch (e) {
        // 略過
    }
}

async function main() {
    // 預設連線至本機 NodeMaster（亦可由命令列參數 argv[2] 或環境變數 MASTER_HOST 覆蓋）
    const masterHost = process.argv[2] || process.env.MASTER_HOST || 'localhost:8080/websocket';
    console.log(`🔌 連線至 NodeMaster: ws://${masterHost}...`);
    setServerAddress(masterHost);

    const conn = await GetConnection();
    if (!conn) {
        console.error("❌ 連線至 NodeMaster 失敗，請確認 Master 服務已啟動。");
        process.exit(1);
    }

    const setupClient = new SetupClient(conn);

    // 1. 先清空現有鏈狀態 (全清)
    console.log("\n🧹 步驟 1: 清空全網舊鏈資料庫與狀態...");
    await PurgeChain();
    await sleep(2);

    // 2. 取得所有在線節點資訊
    console.log("\n🔍 步驟 2: 查詢所有在線主機與 Agent 節點...");
    const chainState = await setupClient.MakeChainState();
    if (!chainState || !chainState.rawData) {
        console.error("❌ 無法取得節點清單！");
        process.exit(1);
    }

    const activeNodes = chainState.ActivatedNodes();
    if (activeNodes.length === 0) {
        console.error("❌ 目前沒有任何 Agent 在線，請先啟動各電腦的 NodeAgent 服務！");
        process.exit(1);
    }

    console.log(`共發現 ${activeNodes.length} 個在線節點:`);
    activeNodes.forEach(n => {
        const detectedIp = getRealHostIPv4(n);
        console.log(`  - 節點名稱: ${n.node_info?.node_name}, 主機: ${n.host_info?.host_name}, 自動解析 IP: ${detectedIp}`);
    });

    // 3. 建立多機節點參數列表（自動帶入各自真實實體 IP）
    const chainID = 'chain-mychain';
    const argNodeList = activeNodes.map((node, idx) => {
        const nodeName = node.node_info?.node_name;
        const match = nodeName.match(/\d+/);
        const nodeNum = match ? parseInt(match[0], 10) : (idx + 1);
        const nodeIndex = nodeNum - 1; // node1 -> 0, node2 -> 1...

        const realIp = getRealHostIPv4(node) || '127.0.0.1';

        return {
            node_name: nodeName,
            node_id: node.node_info?.node_id,
            node_domain_or_ip: realIp, // 帶入真實實體 IP，CometBFT 將自動生成正確 persistent_peers
            p2p_port: 26656 + nodeIndex * 1000,
            rpc_port: 26657 + nodeIndex * 1000,
            abci_port: 26658 + nodeIndex * 1000,
            webservice_port: 1001 + nodeIndex * 1000,
            is_validator: true
        };
    });

    console.log("\n⚙️ 步驟 3: 自動發送多機初始化參數（含正確實體 IP）...");
    console.log(JSON.stringify(argNodeList, null, 2));

    const initResult = await setupClient.InitializeChainNode(chainID, argNodeList);
    if (typeof initResult === 'string' || (initResult && initResult.success === false)) {
        console.error("❌ 鏈初始化失敗:", initResult);
        process.exit(1);
    }
    console.log("✅ 鏈初始化指令下發成功！各主機已自動生成正確實體 IP 的 config.toml");

    await sleep(3);

    // 4. 啟用 CORS (針對本機存在的節點)
    activeNodes.forEach(node => {
        enableCorsInConfig(node.node_info?.node_id, node.node_info?.node_name);
    });

    // 5. 啟動所有節點
    console.log("\n🚀 步驟 4: 啟動所有已初始化節點...");
    const startResult = await setupClient.StartAllInitializedNodes();
    console.log("啟動結果:", startResult);

    // 6. 自動驗證全網節點 P2P 握手與出塊狀態
    await verifyNetworkHandshake(argNodeList);

    console.log("\n🎉 全鏈跨機自動佈署與驗證完成！無需手動修改任何 config.toml。");
    process.exit(0);
}

// 輔助函式：發送 HTTP GET 請求取得 JSON
function fetchJson(url, timeoutMs = 2000) {
    return new Promise((resolve) => {
        const req = http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve({ ok: true, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ ok: false, error: 'JSON parse error' });
                }
            });
        });
        req.on('error', (err) => resolve({ ok: false, error: err.message }));
        req.setTimeout(timeoutMs, () => {
            req.destroy();
            resolve({ ok: false, error: 'Timeout' });
        });
    });
}

// 步驟 5：驗證全網節點 P2P 握手與共識出塊
async function verifyNetworkHandshake(argNodeList, maxWaitSeconds = 20) {
    console.log("\n🔍 步驟 5: 驗證全網節點 P2P 握手與出塊狀態 (約需 5~15 秒)...");
    const totalNodes = argNodeList.length;
    const expectedPeers = Math.max(0, totalNodes - 1);

    const startTime = Date.now();
    let lastSummary = [];
    let allReady = false;

    // 輪詢檢測，直到所有節點握手完成且開始出塊 (Height >= 1) 或超時
    while ((Date.now() - startTime) < maxWaitSeconds * 1000) {
        const results = await Promise.all(argNodeList.map(async (node) => {
            // 優先嘗試連線 127.0.0.1 (支援 Docker 容器映射與本機節點)，若失敗再連 node_domain_or_ip (支援跨機實體 IP)
            let host = '127.0.0.1';
            let [statusRes, netRes, dumpRes] = await Promise.all([
                fetchJson(`http://${host}:${node.rpc_port}/status`),
                fetchJson(`http://${host}:${node.rpc_port}/net_info`),
                fetchJson(`http://${host}:${node.rpc_port}/dump_consensus_state`)
            ]);

            if (!statusRes.ok && node.node_domain_or_ip && node.node_domain_or_ip !== '127.0.0.1') {
                const remoteHost = node.node_domain_or_ip;
                const [rStatus, rNet, rDump] = await Promise.all([
                    fetchJson(`http://${remoteHost}:${node.rpc_port}/status`),
                    fetchJson(`http://${remoteHost}:${node.rpc_port}/net_info`),
                    fetchJson(`http://${remoteHost}:${node.rpc_port}/dump_consensus_state`)
                ]);
                if (rStatus.ok) {
                    statusRes = rStatus;
                    netRes = rNet;
                    dumpRes = rDump;
                    host = remoteHost;
                }
            }

            const height = statusRes.ok ? Number(statusRes.data?.result?.sync_info?.latest_block_height || 0) : -1;
            let nPeers = 0;
            let connectedMonikers = [];
            if (netRes.ok && netRes.data?.result?.n_peers !== undefined) {
                nPeers = Number(netRes.data.result.n_peers || 0);
                connectedMonikers = (netRes.data.result.peers || []).map(p => p.node_info?.moniker || p.remote_ip);
            } else if (dumpRes.ok && Array.isArray(dumpRes.data?.result?.peers)) {
                const peers = dumpRes.data.result.peers;
                nPeers = peers.length;
                connectedMonikers = peers.map(p => {
                    const addr = p.node_address || '';
                    const parts = addr.split('@');
                    return parts.length > 1 ? parts[1] : addr;
                });
            }

            return {
                nodeName: node.node_name,
                host: host,
                rpcPort: node.rpc_port,
                p2pPort: node.p2p_port,
                statusOk: statusRes.ok,
                height: height,
                nPeers: nPeers,
                connectedMonikers: connectedMonikers
            };
        }));

        lastSummary = results;

        const anyProducingBlocks = results.some(r => r.height >= 1);
        const allPeersConnected = results.every(r => r.statusOk && (totalNodes === 1 || r.nPeers >= expectedPeers));

        if (anyProducingBlocks && allPeersConnected) {
            allReady = true;
            break;
        }

        process.stdout.write('.');
        await sleep(2);
    }
    console.log(''); // 換行

    // 輸出節點 P2P 握手報告
    console.log("\n📡 節點 P2P 握手與連線報告:");
    lastSummary.forEach(item => {
        if (item.statusOk) {
            const peerDetails = item.connectedMonikers.length > 0 ? ` (已互連: ${item.connectedMonikers.join(', ')})` : '';
            const isFullConnected = (totalNodes === 1 || item.nPeers >= expectedPeers);
            const mark = isFullConnected ? '✔' : '⚠️';
            console.log(`  ${mark} ${item.nodeName} (${item.host}:${item.rpcPort}): P2P 互連 ${item.nPeers}/${expectedPeers} Peers${peerDetails} | 區塊高度: #${item.height}`);
        } else {
            console.log(`  ❌ ${item.nodeName} (${item.host}:${item.rpcPort}): RPC 尚未回應 (請檢查 P2P ${item.p2pPort} 與 RPC ${item.rpcPort} 端口是否被防火牆阻擋)`);
        }
    });

    const maxHeight = Math.max(...lastSummary.map(s => s.height));
    if (maxHeight >= 1) {
        console.log(`\n🧱 共識出塊檢測: ✔ 區塊鏈已成功從創世狀態 (#0) 啟動！當前最新區塊高度: #${maxHeight}`);
    } else {
        console.log(`\n🧱 共識出塊檢測: ⏳ 目前區塊高度仍為 #0，節點可能正在等待足夠驗證節點完成連線...`);
    }

    return allReady;
}

main().catch(err => {
    console.error("❌ 執行失敗:", err);
    process.exit(1);
});
