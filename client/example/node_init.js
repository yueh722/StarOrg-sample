// node_init.js
import os from 'os';
import { GetConnection, setServerAddress } from "./conn.js";
import { AddChainNodeOnMultiMachine, ResetNodeByName, InitializeChainOnMultiMachine } from "./setup.js";
import { SetupClient } from "../src/SetupClient.js";

function sleep(seconds) {
    return new Promise(resolve => {
        setTimeout(resolve, seconds * 1000);
    });
}

async function StartNodeByName(setupClient, ...names) {
    const nodeIDs = (await setupClient.MakeChainState()).GetNodeIDsByName(...names);
    return await setupClient.StartNode(...nodeIDs);
}

// 自動修改 config.toml 以啟用 CORS 的 helper
import fs from 'fs';
import path from 'path';
function enableCorsInConfig(nodeId, nodeName) {
    try {
        const programDataPath = process.env.ProgramData || "C:\\ProgramData";
        const configPath = path.join(programDataPath, "chainnode", "data", nodeName, nodeId, "config", "config.toml");
        if (fs.existsSync(configPath)) {
            let content = fs.readFileSync(configPath, 'utf8');
            let modified = false;

            // 1. 啟用 CORS
            if (content.includes('cors_allowed_origins = []')) {
                content = content.replace('cors_allowed_origins = []', 'cors_allowed_origins = ["*"]');
                modified = true;
                console.log(`  - 已自動為本機節點 ${nodeName} 啟用 CORS (config.toml)`);
            }

            // 2. 將 persistent_peers 中屬於 VM 節點的 127.0.0.1 替換為 VM 的實體 IP
            if (content.includes('@127.0.0.1:26656') || content.includes('@127.0.0.1:27656') || content.includes('@127.0.0.1:28656')) {
                content = content.replace(/@127\.0\.0\.1:26656/g, '@192.168.171.194:26656')
                    .replace(/@127\.0\.0\.1:27656/g, '@192.168.171.194:27656')
                    .replace(/@127\.0\.0\.1:28656/g, '@192.168.171.194:28656');
                modified = true;
                console.log(`  - 已自動將 ${nodeName} 的 VM 節點 P2P 連線位址更正為 192.168.171.194`);
            }

            if (modified) {
                fs.writeFileSync(configPath, content, 'utf8');
            }
        }
    } catch (e) {
        console.warn(`  - 啟用/更正本機節點 ${nodeName} 設定失敗 (可能尚未建立 config):`, e.message);
    }
}

async function main() {
    // 1. 設定要連接的 NodeMaster 地址（VM 的 IP）
    setServerAddress('192.168.171.194:8080/websocket');
    console.log("Connecting to VM Master at 192.168.171.194:8080/websocket...");

    const setupClient = await new SetupClient(await GetConnection());
    let chainState = await setupClient.MakeChainState();
    if (!chainState || !chainState.rawData) {
        console.error("❌ Failed to get chain state. Make sure NodeMaster and connections are correct.");
        process.exit(1);
    }

    const allNodes = chainState.AllNodes();
    if (allNodes.length === 0) {
        console.log("⚠️ No nodes found in the chain state.");
        process.exit(0);
    }

    // 取得本機的 hostname 和 IP
    const localHostName = os.hostname().toLowerCase();
    const localIPs = Object.values(os.networkInterfaces())
        .flat()
        .filter(ip => ip && ip.address)
        .map(ip => ip.address);

    // 判斷是否為本機節點的 helper
    function isLocalNode(node) {
        const nodeHostName = node.host_info?.host_name?.toLowerCase();
        if (nodeHostName && nodeHostName === localHostName) {
            return true;
        }
        const nodeIPs = node.host_info?.ip_addresses || [];
        for (const entry of nodeIPs) {
            const parts = entry.split(" | ", 2);
            if (parts.length === 2) {
                const ip = parts[1];
                if (localIPs.includes(ip)) {
                    return true;
                }
            }
        }
        return false;
    }

    // 判斷整條鏈是否已經初始化
    const isChainInitialized = chainState.IsInitialized();

    if (!isChainInitialized) {
        console.error("❌ 區塊鏈尚未初始化！請先在 VM 端或 GUI 初始化區塊鏈後，再執行本腳本。");
        process.exit(1);
    }

    // 過濾出本機的節點
    const localNodes = allNodes.filter(isLocalNode);
    if (localNodes.length === 0) {
        console.log("⚠️ No local nodes found associated with this host.");
        process.exit(0);
    }

    console.log(`\n🔍 Found ${localNodes.length} local node(s):`);
    localNodes.forEach(node => {
        // 由於剛剛可能更新過 chainState，重新取得該節點的最新狀態
        const latestNode = chainState.AllNodes().find(n => n.node_info.node_name === node.node_info.node_name) || node;
        console.log(`  - Name: ${latestNode.node_info.node_name}, Initialized: ${latestNode.initialized}, Online: ${latestNode.online}`);
    });

    // 重新取得最新狀態下的已初始化與未初始化本機節點
    const latestLocalNodes = chainState.AllNodes().filter(isLocalNode);
    const initializedLocalNodes = latestLocalNodes.filter(node => node.initialized === true);
    const uninitializedLocalNodes = latestLocalNodes.filter(node => node.initialized !== true);

    // 處理未初始化的節點
    if (uninitializedLocalNodes.length > 0) {
        const uninitializedNames = uninitializedLocalNodes.map(n => n.node_info.node_name);
        console.log(`\n⚙️ Initializing and adding uninitialized local node(s): ${uninitializedNames.join(', ')}...`);

        // 自行計算 Port，避免多個本機節點分配到相同 Port 造成衝突
        function makePort(portIndex, nodeIndex) {
            const startPort = [
                26656, // p2p_port
                26657, // rpc_port
                26658, // abci_port
                1001   // webservice_port
            ];
            return startPort[portIndex] + nodeIndex * 1000;
        }

        let succeedCount = 0;
        for (const node of uninitializedLocalNodes) {
            const nodeName = node.node_info.node_name;
            const match = nodeName.match(/\d+/);
            const nodeNum = match ? parseInt(match[0], 10) : 1;
            const nodeIndex = nodeNum - 1; // node1 -> 0, node4 -> 3, node5 -> 4

            const nodeDomainOrIp = chainState.FindHostIpByNodeID(node.node_info.node_id, '192.168.') || node.node_info.node_name;

            const argNode = {
                node_name: nodeName,
                node_id: node.node_info.node_id,
                node_domain_or_ip: nodeDomainOrIp,
                p2p_port: makePort(0, nodeIndex),
                rpc_port: makePort(1, nodeIndex),
                abci_port: makePort(2, nodeIndex),
                webservice_port: makePort(3, nodeIndex),
                is_validator: true,
            };

            console.log(`  - Adding ${nodeName} with ports: P2P=${argNode.p2p_port}, RPC=${argNode.rpc_port}, ABCI=${argNode.abci_port}, WS=${argNode.webservice_port}`);
            const res = await setupClient.AddChainNode(argNode);
            // 處理如果回傳是字串的錯誤情況
            if (typeof res === 'string' || (res && res.success === false)) {
                console.error(`❌ Add Node ${nodeName} failed:`, typeof res === 'string' ? res : res.error);
                process.exit(1);
            }

            // 新增節點後，在啟動前為其 config.toml 啟用 CORS
            enableCorsInConfig(node.node_info.node_id, nodeName);
            succeedCount++;
        }
        console.log(`✅ Added ${succeedCount} node(s) successfully!`);

        // 等待 2 秒讓配置同步
        await sleep(2);

        // 啟動這些新增的節點
        console.log(`🚀 Starting node(s): ${uninitializedNames.join(', ')}...`);
        const startResult = await StartNodeByName(setupClient, ...uninitializedNames);
        if (typeof startResult === 'string' || (startResult && startResult.success === false)) {
            console.error("❌ Start Node failed:", typeof startResult === 'string' ? startResult : startResult.error);
            process.exit(1);
        }
        console.log("✅ Started nodes successfully!");
    }

    // 處理已初始化的節點（重置，以清空本機上的全部 node 資料並重啟與其他節點同步）
    if (initializedLocalNodes.length > 0) {
        const initializedNames = initializedLocalNodes.map(n => n.node_info.node_name);
        const initializedIDs = initializedLocalNodes.map(n => n.node_info.node_id);

        console.log(`\n🛑 Stopping initialized local node(s) to release config locks: ${initializedNames.join(', ')}...`);
        await setupClient.StopNode(...initializedIDs);
        await sleep(2); // 等待釋放檔案鎖

        // 停止後，修改 config.toml 啟用 CORS
        initializedLocalNodes.forEach(node => {
            enableCorsInConfig(node.node_info.node_id, node.node_info.node_name);
        });

        console.log(`\n🧹 Resetting (clearing data) and restarting initialized local node(s): ${initializedNames.join(', ')}...`);
        const resetResult = await ResetNodeByName(...initializedNames);
        if (typeof resetResult === 'string' || (resetResult && resetResult.success === false)) {
            console.error("❌ Reset Node failed:", typeof resetResult === 'string' ? resetResult : resetResult.error);
            process.exit(1);
        }
        console.log("✅ Reset and restarted nodes successfully!");
    }

    console.log("\n🎉 Node initialization and cleanup complete!");
    process.exit(0);
}

main().catch(err => {
    console.error("❌ Error in node_init main:", err);
    process.exit(1);
});
