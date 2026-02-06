//example.js

import {StartStream} from "./stream.js";
import {StartAllNodes, StopAllNodes} from "./control-node.js";
import {
    AddChainNodeOnSingleMachine,
    InitializeChainOnSingleMachine,
    PurgeChain,
    StartInitializedNodes
} from "./setup.js";
import {SetupClient} from "../src/SetupClient.js";
import {GetConnection} from "./conn.js";

async function DeployFromScratch(){
    await PurgeChain()
    await InitializeChainOnSingleMachine('mychain')

    await StartInitializedNodes()

    await AddChainNodeOnSingleMachine('node3', 'node4')

    //start node3, node4
    const setupClient = await new SetupClient(await GetConnection())
    const nodeIDs = (await setupClient.MakeChainState()).GetNodeIDsByName('node3', 'node4')
    await setupClient.StartNode(...nodeIDs)

    // or you can use StartInitializedNodes() to start all initialized nodes again.
    await StartInitializedNodes()

}

async function RestartAllNodes(){
    await StopAllNodes()
    await StartAllNodes()
}



//DeployFromScratch()

//start
await StartStream()

await RestartAllNodes()

//await StopAllNodes()

//deploy chain
//await DeployFromScratch()

//control nodes
//await RestartAllNodes()




