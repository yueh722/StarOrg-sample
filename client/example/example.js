//example.js

import {StartStream} from "./stream.js";
import {RestartAllNodes, StartAllNodes, StopAllNodes} from "./control-node.js";
import {
    AddChainNodeOnMultiMachine,
    AddChainNodeOnSingleMachine, GetServerAddrOfABCIApp,
    GetSetupCommandHistory, InitializeChainOnMultiMachine,
    InitializeChainOnSingleMachine,
    PurgeChain,
    StartInitializedNodes
} from "./setup.js";
import {makeSuccess, SetupClient} from "../src/SetupClient.js";
import {GetConnection, setServerAddress} from "./conn.js";

async function DeployHalfToMultiMachineFromScratch(){

    const results = [
        await PurgeChain(),
        await InitializeChainOnMultiMachine('mychain', 'node1', 'node2'),
        await StartInitializedNodes(),
        await oksleep(), //give some time let validators of node1 and node2 running
        await AddChainNodeOnMultiMachine('node3', 'node4'),

        //start node3, node4
        await StartNodeByName('node3', 'node4'),
        // or you can use StartInitializedNodes() to start all initialized nodes again.
        await StartInitializedNodes(),
    ]

    return results;
}


async function DeployHalfFromScratch(){

    const results = [
        await PurgeChain(),
        await InitializeChainOnSingleMachine('mychain', 'node1', 'node2', 'node3', 'node4'),
        await StartInitializedNodes(),
        await oksleep(), //give some time let validators of node1 and node2 running
        await AddChainNodeOnSingleMachine('node10', 'node40', 'node20', 'node30'),

        //start node3, node4
        //await StartNodeByName('node3', 'node4'),
        // or you can use StartInitializedNodes() to start all initialized nodes again.
        await StartInitializedNodes(),
        await RestartAllNodes,
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

async function oksleep() {
    await sleep(4)
    return makeSuccess('good')
}

function sleep(seconds) {
    return new Promise(resolve => {
        setTimeout(resolve, seconds * 1000);
    });
}

async function DelayRestartAllNodes() {
    //await sleep(2)
    await RestartAllNodes()
    //await sleep(2)
    return makeSuccess('succeed')
}

//must set address to nodemaster first.
setServerAddress('localhost:8080/websocket')

//await StopAllNodes()

//await DeployFromScratch()

//await StartAllNodes();

await StartStream()


for (let i = 0; i < 100; i++) {

   //break

    const results = [
        ...await DeployHalfFromScratch(),
        await DelayRestartAllNodes(),
        await GetServerAddrOfABCIApp(),
        await GetSetupCommandHistory()
    ]

    CheckResult(...results)

    await sleep(5)
    break
}





