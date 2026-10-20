// purge.js
import { PurgeChain } from "./setup.js";
import { setServerAddress } from "./conn.js";

async function main() {
    // 設定連線到 NodeMaster 的位址（支援 CLI 傳參或環境變數，預設 localhost）
    const masterHost = process.argv[2] || process.env.MASTER_HOST || 'localhost:8080/websocket';
    setServerAddress(masterHost);
    console.log(`🧹 Connecting to Master at ${masterHost} and purging chain...`);

    const res = await PurgeChain();
    if (res.success) {
        console.log("✅ Chain purged successfully! All nodes are reset to uninitialized state.");
    } else {
        console.error("❌ Purge failed:", res.error || res);
    }
    process.exit(0);
}

main().catch(err => {
    console.error("❌ Error in purge main:", err);
    process.exit(1);
});
