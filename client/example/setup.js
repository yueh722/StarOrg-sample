import {ChainState} from "../src/ChainState.js";
import {SetupClient} from "../src/SetupClient.js";
import {GetConnection} from "./conn.js";


function makePort(portIndex, nodeIndex){
    const startPort = [
        26656, //p2p_port
        26657, //rpc_port
        26658, //abci_port
        1001   //webservice_port
    ]

    return  startPort[portIndex] + nodeIndex * 1000;
}

export async function InitializeChainOnSingleMachine(chainID) {
    const setupClient = await new SetupClient(await GetConnection())

    const chainState = await setupClient.MakeChainState()
    if (chainState == null) {
        return 'cannot get chain state'
    }

    if (chainState.IsInitialized()) {
        return 'chain has already been initialized!'
    }

    let nodeIndex = 0

    //build argNodeList
    const argNodeList = chainState.ActivatedNodes().map(nodeInfo => {

        const argNode = {
            node_name: nodeInfo.node_name,
            node_id: nodeInfo.node_id,
            node_domain_or_ip: '127.0.0.1',

            // 'node1.com' need to be a resolvable domain.
            //node_domain_or_ip: 'node1.com',

            p2p_port: makePort(0, nodeIndex),
            rpc_port: makePort(1, nodeIndex),
            abci_port: makePort(2, nodeIndex),
            webservice_port: makePort(3, nodeIndex),
            is_validator: true,
        };
        nodeIndex++;
        return argNode;
    })

    return await setupClient.InitializeChainNode(chainID, argNodeList)
}


export async function InitializeChainOnMultiMachine(chainID) {
    const setupClient = await new SetupClient(await GetConnection())

    const chainState = await setupClient.MakeChainState()
    if (chainState == null) {
        return 'cannot get chain state'
    }

    if (chainState.IsInitialized()) {
        return 'chain has already been initialized!'
    }

    //build argNodeList
    const argNodeList = chainState.ActivatedNodes().map(nodeInfo => {
        return {
            node_name: nodeInfo.node_name,
            node_id: nodeInfo.node_id,

            // set nodeIp
            // get private ip address of computer that represents current node
            // node_domain_or_ip: chainState.FindHostIpByNodeID(nodeInfo.node_id, '192.168.1'),

            // make sure nodeInfo.node_name is a resolvable domain
            node_domain_or_ip: nodeInfo.node_name,

            // 'node1.com' need to be a resolvable domain.
            //node_domain_or_ip: 'node1.com',

            // no need to set different port number for each node, because master will set it with default number.

            is_validator: true,
        };
    })

    return await setupClient.InitializeChainNode(chainID, argNodeList)
}

//e.g. AddChainNodeOnSingleMachine('node3','node4')
export async function AddChainNodeOnSingleMachine(...nodeNames) {
    const setupClient = await new SetupClient(await GetConnection())

    const chainState = await setupClient.MakeChainState()
    if (chainState == null) {
        return 'cannot get chain state'
    }

    if (!chainState.IsInitialized()) {
        return 'you need to initialize chain first.'
    }

    let nodeIndex = chainState.InitializedNodes().length

    //build argNodeList
    const argNodeList = chainState.UninitializedNodes()
        //make a new nodeList that contains nodeNames
        .filter(nodeInfo => {
            return nodeNames.some(item => item.includes(nodeInfo.node_name))
        })
        //build a argNodeList from a list of nodeInfo
        .map(nodeInfo => {
            const argNode = {
            node_name: nodeInfo.node_name,
            node_id: nodeInfo.node_id,
            node_domain_or_ip: '127.0.0.1',

            // 'node2.com' need to be a resolvable domain.
            //node_domain_or_ip: 'node2.com',

            p2p_port: makePort(0, nodeIndex),
            rpc_port: makePort(1, nodeIndex),
            abci_port: makePort(2, nodeIndex),
            webservice_port: makePort(3, nodeIndex),
            is_validator: true,
        };
        nodeIndex++;
        return argNode;
    })

    if (argNodeList.length === 0) {
        return 'nodes you are trying to add are not found in the uninitialized list, perhaps node name are incorrect or nodes had already initialized before.'
    }

    let succeedCount = 0;

    for (const argNode of argNodeList) {
        const res = await setupClient.AddChainNode(argNode)
        if (res === false) {
            return res
        }
        console.info('added node', argNode.node_name)
        succeedCount++
    }

    return succeedCount === nodeNames.length
}


//e.g. AddChainNodeOnMultiMachine('node3','node4')
export async function AddChainNodeOnMultiMachine(...nodeNames) {
    const setupClient = await new SetupClient(await GetConnection())

    const chainState = await setupClient.MakeChainState()
    if (chainState == null) {
        return 'cannot get chain state'
    }

    if (!chainState.IsInitialized()) {
        return 'you need to initialize chain first.'
    }

    //build argNodeList
    const argNodeList = chainState.UninitializedNodes()
        //make a new nodeList that contains nodeNames
        .filter(nodeInfo => {
            return nodeNames.some(item => item.includes(nodeInfo.node_name))
        })
        //build a argNodeList from a list of nodeInfo
        .map(nodeInfo => {
            const argNode = {
            node_name: nodeInfo.node_name,
            node_id: nodeInfo.node_id,

            // set nodeIp
            // get private ip address of computer that represents current node
            // node_domain_or_ip: chainState.FindHostIpByNodeID(nodeInfo.node_id, '192.168.1'),

            // make sure nodeInfo.node_name is a resolvable domain
            node_domain_or_ip: nodeInfo.node_name,

            // 'node2.com' need to be a resolvable domain.
            //node_domain_or_ip: 'node2.com',

            is_validator: true,
            };

            return argNode;
        })

    if (argNodeList.length === 0) {
        return 'nodes you are trying to add are not found in the uninitialized list, perhaps node name are incorrect or nodes had already initialized before.'
    }

    let succeedCount = 0;

    for (const argNode of argNodeList) {
        const res = await setupClient.AddChainNode(argNode)
        if (res === false) {
            return res
        }
        console.info('added node', argNode.node_name)
        succeedCount++
    }

    return succeedCount === nodeNames.length
}


export async function PurgeChain() {
    const setupClient = await new SetupClient(await GetConnection())
    const result = await setupClient.PurgeChain()
    console.log(result)
}
