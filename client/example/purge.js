// purge.js
import { PurgeChain } from "./setup.js";
import { setServerAddress } from "./conn.js";

async function main() {
    // 設定連線到 VM Master 的位址
    setServerAddress('192.168.171.194:8080/websocket');
    console.log("🧹 Connecting and purging chain on Master...");

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
