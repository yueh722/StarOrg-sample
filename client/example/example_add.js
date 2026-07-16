// example_add.js
import { GetConnection, setServerAddress } from "./conn.js";
import { AddChainNodeOnMultiMachine } from "./setup.js";
import { SetupClient } from "../src/SetupClient.js";

function sleep(seconds) {
    return new Promise(resolve => {
        setTimeout(resolve, seconds * 1000);
    });
}

async function StartNodeByName(...names) {
    const setupClient = await new SetupClient(await GetConnection());
    const nodeIDs = (await setupClient.MakeChainState()).GetNodeIDsByName(...names);
    return await setupClient.StartNode(...nodeIDs);
}

async function main() {
    // 1. 設定要連接的 NodeMaster 地址（VM 的 IP）
    setServerAddress('192.168.171.194:8080/websocket');
    console.log("Connecting to VM Master at 192.168.171.194:8080/websocket...");

    // 2. 將本機的 node4 加入到 VM 的多主機區塊鏈中
    console.log("Adding node4 to VM chain...");
    const addResult = await AddChainNodeOnMultiMachine('node4');
    if (!addResult.success) {
        console.error("❌ Add Node failed:", addResult.error);
        process.exit(1);
    }
    console.log("✅ Added node4 successfully!");

    // 等待 2 秒讓配置同步
    await sleep(2);

    // 3. 啟動 node4 節點
    console.log("Starting node4 consensus and app...");
    const startResult = await StartNodeByName('node4');
    if (!startResult.success) {
        console.error("❌ Start Node failed:", startResult.error);
        process.exit(1);
    }
    console.log("✅ Started node4 successfully!");
    
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
