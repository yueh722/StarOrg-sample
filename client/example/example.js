//example.js

import {StartStream} from "./stream.js";
import {RestartAllNodes, StartAllNodes, StopAllNodes} from "./control-node.js";
import {
    AddChainNodeOnSingleMachine, GetServerAddrOfMasters, GetSetupCommandHistory,
    InitializeChainOnSingleMachine,
    PurgeChain,
    StartInitializedNodes
} from "./setup.js";
import {makeSuccess, SetupClient} from "../src/SetupClient.js";
import {GetConnection} from "./conn.js";

async function DeployFromScratch(){

    const results = [
        await PurgeChain(),
        await InitializeChainOnSingleMachine('mychain'),
        await StartInitializedNodes(),
        await AddChainNodeOnSingleMachine('node3', 'node4'),

        //start node3, node4
        await StartNodeByName('node3', 'node4'),
        // or you can use StartInitializedNodes() to start all initialized nodes again.
        await StartInitializedNodes(),
    ]

    return results;
}

async function StartNodeByName(...names){
    const setupClient = await new SetupClient(await GetConnection())
    const nodeIDs = (await setupClient.MakeChainState()).GetNodeIDsByName(...names)
    return await setupClient.StartNode(...nodeIDs)
}

function CheckResult(...results){
    try {
        results.forEach((result) => {
            if (result.error){
                console.error(result.error);
            }
        })
    }catch (error) {
        console.error(error, ...results);
    }
}

function sleep(seconds) {
    return new Promise(resolve => {
        setTimeout(resolve, seconds * 1000);
    });
}

async function DelayRestartAllNodes() {
    await sleep(5)
    await RestartAllNodes()
    return makeSuccess('succeed')
}

//await StopAllNodes()

//await DeployFromScratch()

//await StartAllNodes();

for (let i = 0; i < 100; i++) {

   //break
    await StartStream()

    const results = [
        ...await DeployFromScratch(),
        await DelayRestartAllNodes(),
        await GetServerAddrOfMasters(),
        await GetSetupCommandHistory()
    ]

    CheckResult(...results)

    await sleep(5)
}

//await StopAllNodes()

//deploy chain
//await DeployFromScratch()

//control nodes
//await RestartAllNodes()

//await GetSetupCommandHistory()




