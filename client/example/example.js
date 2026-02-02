//example.js

import {StartStream} from "./stream.js";
import {StartAllNodes, StopAllNodes} from "./control-node.js";
import {AddChainNode, AddChainNodeOnSingleMachine, InitializeChainOnSingleMachine, PurgeChain} from "./setup.js";

async function DeployFromScratch(){
    await PurgeChain()
    await InitializeChainOnSingleMachine('mychain')
    await AddChainNodeOnSingleMachine('node3', 'node4')
}

async function RestartAllNodes(){
    await StopAllNodes()
    await StartAllNodes()
}

//start
await StartStream()

//deploy chain
await DeployFromScratch()

//control nodes
await RestartAllNodes()

for (;;) {

}




