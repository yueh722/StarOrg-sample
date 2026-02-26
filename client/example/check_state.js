import { GetConnection, setServerAddress } from "./conn.js";
import { SetupClient } from "../src/SetupClient.js";

async function check() {
    setServerAddress('localhost:8080/websocket');
    const conn = await GetConnection();
    const setupClient = new SetupClient(conn);

    console.log("Getting ChainState...");
    const chainState = await setupClient.MakeChainState();
    console.log("IsInitialized:", chainState.IsInitialized());
    console.log("InitializedNodes:", chainState.InitializedNodes().length);
    console.log("ActivatedNodes:", chainState.ActivatedNodes().length);

    const nodeIDs = chainState.InitializedNodes().map(n => n.node_info.node_id);
    console.log("Starting nodes:", nodeIDs);
    const res = await setupClient.StartNode(...nodeIDs);
    console.log("Start Result:", JSON.stringify(res, null, 2));

    process.exit(0);
}

check();
