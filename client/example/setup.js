import {ChainState} from "../src/ChainState.js";
import {makeError, makeSuccess, SetupClient} from "../src/SetupClient.js";
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

/**
 * 在一台机器上初始化当前网络中的所有节点或者nodeNames指定的节点。
 * @param {chainID} string - 要初始化的chainID字符串
 * @param {...nodeNames} params - 将要初始化的NodeName
 * @Remark
 *      1. 如果不传入nodeNames，表示初始化网络中的所有节点
 *      2. 如果传入nodeNames，那么只有这些nodeNames存在并且在线的才会被初始化，不存在的nodeNames将会被忽略执行初始化操作。
 *      3. 可以通过 SetupClient.MakeChainState 得到 ChainState 来遍历当前的节点信息。
 *      4. 在设置 node_domain_or_ip 的时候, 会使用 127.0.0.1
 *      5. 所有的node的端口都是不一样的。
 *      6. 只有所有的node都在一台机器上安装的情况才应该使用该方法。
 * @returns {Promise<Object>} 响应结果，返回{success: boolean, data?: any, error?: string}
 */
export async function InitializeChainOnSingleMachine(useLoopIp, chainID, ...nodeNames) {
    const setupClient = await new SetupClient(await GetConnection())

    const chainState = await setupClient.MakeChainState()
    if (chainState == null) {
        return makeError('cannot get chain state')
    }

    if (chainState.IsInitialized()) {
        return makeError('chain has already been initialized!')
    }

    let nodeIndex = 0

    //build argNodeList
    const argNodeList = chainState.ActivatedNodesByName(...nodeNames).map(node => {

        const argNode = {
            // you can change node_name while initializing chain
            node_name: node.node_info.node_name,
            node_id: node.node_info.node_id,

            node_domain_or_ip: useLoopIp ? '127.0.0.1': node.node_info.node_name,

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

    console.info("Initialized chainState: ", argNodeList)

    return await setupClient.InitializeChainNode(chainID, argNodeList)
}

/**
 * 在多台机器上初始化当前网络中的所有节点或者nodeNames指定的节点。
 * @param {chainID} string - 要初始化的chainID字符串
 * @param {...nodeNames} params - 将要初始化的NodeName
 * @Remark
 *      1. 如果不传入nodeNames，表示初始化网络中的所有节点
 *      2. 如果传入nodeNames，那么只有这些nodeNames存在并且在线的才会被初始化，不存在的nodeNames将会被忽略执行初始化操作。
 *      3. 可以通过 SetupClient.MakeChainState 得到 ChainState 来遍历当前的节点信息。
 *      4. 在设置 node_domain_or_ip 的时候，会使用 node.node_info.node_name , 所以要保证是可以解析的域名或者正确的ip。
 *      5. 所有的 node 的端口都会是一样的。
 *      6. 如果是混合安装，也就是有些机器上会创建多个node，那么也需要使用此方法进行。因为其他机器上的node会尝试链接每个node，必须使用域名或IP.
 * @returns {Promise<Object>} 响应结果，返回{success: boolean, data?: any, error?: string}
 */
export async function InitializeChainOnMultiMachine(chainID, ...nodeNames) {
    const setupClient = await new SetupClient(await GetConnection())

    const chainState = await setupClient.MakeChainState()
    if (chainState == null) {
        return makeError('cannot get chain state')
    }

    if (chainState.IsInitialized()) {
        return makeError('chain has already been initialized!')
    }

    //build argNodeList
    const argNodeList = chainState.ActivatedNodesByName(...nodeNames).map(node => {
        return {
            // you can change node_name while initializing chain
            node_name: node.node_info.node_name,

            node_id: node.node_info.node_id,

            // set nodeIp
            // get private ip address of computer that represents current node
            // node_domain_or_ip: chainState.FindHostIpByNodeID(node.node_info.node_id, '192.168.1'),

            // make sure node.node_info.node_name is a resolvable domain
            node_domain_or_ip: node.node_info.node_name,

            // 'node1.com' need to be a resolvable domain.
            //node_domain_or_ip: 'node1.com',

            // no need to set different port number for each node, because master will set it with default number.

            is_validator: true,
        };
    })

    return await setupClient.InitializeChainNode(chainID, argNodeList)
}

/**
 * 在一台机器上添加nodeNames指定的节点。
 * @param {...nodeNames} params - 将要初始化的NodeName
 * @Remark
 *      1. 如果传入nodeNames，那么只有这些nodeNames存在并且在线的才会被初始化，不存在的nodeNames将会被忽略执行初始化操作。
 *      2. 可以通过 SetupClient.MakeChainState 得到 ChainState 来遍历当前的节点信息。
 *      3. 在设置 node_domain_or_ip 的时候，会使用 127.0.0.1
 *      4. 所有的 node 的端口都是不一样的。
 *      5. 必须在初始化完成以后，才能执行添加新节点的操作。
 *      6. 一般用于后期想要新增节点的需求。
 * @returns {Promise<Object>} 响应结果，返回{success: boolean, data?: any, error?: string}
 */
export async function AddChainNodeOnSingleMachine(useLoopIp, ...nodeNames) {
    const setupClient = await new SetupClient(await GetConnection())

    const chainState = await setupClient.MakeChainState()
    if (chainState == null) {
        return makeError('cannot get chain state.')
    }

    if (!chainState.IsInitialized()) {
        return makeError('you need to initialize chain first.')
    }

    let nodeIndex = chainState.InitializedNodes().length

    //build argNodeList
    const argNodeList = chainState.UninitializedNodes()
        //make a new nodeList that contains nodeNames
        .filter(node => {
            return nodeNames.includes(node.node_info.node_name)
        })
        //build a argNodeList from a list of nodeInfo
        .map(node => {
            const argNode = {
            node_name: node.node_info.node_name,
            node_id: node.node_info.node_id,

            node_domain_or_ip: useLoopIp ? '127.0.0.1': node.node_info.node_name,

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
        return makeError('nodes you are trying to add are not found in the uninitialized list, perhaps node name are incorrect or nodes had already initialized before.')
    }

    let succeedCount = 0;

    for (const argNode of argNodeList) {
        const res = await setupClient.AddChainNode(argNode)
        if (res.success === false) {
            return res
        }
        console.info('added node', argNode.node_name)
        succeedCount++
    }

    return makeSuccess('succeed')
}


/**
 * 在多台机器上添加nodeNames指定的节点。
 * @param {...nodeNames} params - 将要初始化的NodeName
 * @Remark
 *      1. 如果传入nodeNames，那么只有这些nodeNames存在并且在线的才会被初始化，不存在的nodeNames将会被忽略执行初始化操作。
 *      2. 可以通过 SetupClient.MakeChainState 得到 ChainState 来遍历当前的节点信息。
 *      3. 在设置 node_domain_or_ip 的时候，会使用 node.node_info.node_name , 所以要保证是可以解析的域名或者正确的ip。
 *      4. 所有的 node 的端口都是一样的。
 *      5. 必须在初始化完成以后，才能执行添加新节点的操作。
 *      6. 一般用于后期想要新增节点的需求。
 * @returns {Promise<Object>} 响应结果，返回{success: boolean, data?: any, error?: string}
 */
export async function AddChainNodeOnMultiMachine(...nodeNames) {
    const setupClient = await new SetupClient(await GetConnection())

    const chainState = await setupClient.MakeChainState()
    if (chainState == null) {
        return makeError('cannot get chain state')
    }

    if (!chainState.IsInitialized()) {
        return makeError('you need to initialize chain first.')
    }

    //build argNodeList
    const argNodeList = chainState.UninitializedNodes()
        //make a new nodeList that contains nodeNames
        .filter(node => {
            return nodeNames.some(item => item.includes(node.node_info.node_name))
        })
        //build a argNodeList from a list of nodeInfo
        .map(node => {
            return {
                node_name: node.node_info.node_name,
                node_id: node.node_info.node_id,

                // set nodeIp
                // get private ip address of computer that represents current node
                // node_domain_or_ip: chainState.FindHostIpByNodeID(node.node_info.node_id, '192.168.1'),

                // make sure node.node_info.node_name is a resolvable domain
                node_domain_or_ip: node.node_info.node_name,

                // 'node2.com' need to be a resolvable domain.
                //node_domain_or_ip: 'node2.com',

                is_validator: true,
            };
        })

    if (argNodeList.length === 0) {
        return makeError('nodes you are trying to add are not found in the uninitialized list, perhaps node name are incorrect or nodes had already initialized before.')
    }

    let succeedCount = 0;

    for (const argNode of argNodeList) {
        const res = await setupClient.AddChainNode(argNode)
        if (res.success === false) {
            return res
        }
        console.info('added node', argNode.node_name)
        succeedCount++
    }

    return makeSuccess('succeed')
}

/**
 * 启动所有初始化的节点。
 * @returns {Promise<Object>} 响应结果，返回{success: boolean, data?: any, error?: string}
 */
export async function StartInitializedNodes() {
    const setupClient = await new SetupClient(await GetConnection())
    return await setupClient.StartAllInitializedNodes()
}

/**
 * 重置chain到未初始化的状态，
 * @Remark
 *  1. 会删除所有节点的数据。
 *  2. 所有nodeagent和nodemaster都会变成未初始化状态。
 *  3. 但是每个node的id和name并不会变
 *  4. 无需重新配置node，即可立即执行初始化操作。
 * @returns {Promise<Object>} 响应结果，返回{success: boolean, data?: any, error?: string}
 */
export async function PurgeChain() {
    const setupClient = await new SetupClient(await GetConnection())
    return await setupClient.PurgeChain()
}

/**
 * 获取之前执行的所有动作的历史记录，包含初始化，添加，启动，结束，重启，重置操作。
 * @returns {Promise<Object>} 响应结果，返回{success: boolean, data?: any, error?: string}
 */
export async function GetSetupCommandHistory() {
    const setupClient = await new SetupClient(await GetConnection())
    const result = await setupClient.GetHistoryOfCommand('')
    console.info('result of History of Command:', result)
    return result
}

/**
 * 获取当前可用的所有的Cometbft-App Server信息。
 * @Remark
 *  1. 因为使用了
 * @returns {Promise<Object>} 响应结果，返回{success: boolean, data?: any, error?: string}
 * example:
 * {
 *   "success": true,
 *   "data": [
 *     {
 *       "server": "127.0.0.1:1001",
 *       "token": "416017470de4fa1fb90c39bdaa1983070f2a61cae8ef6cd554a149ad6329c320"
 *     },
 *     {
 *       "server": "127.0.0.1:2001",
 *       "token": "bad3aab458d65de4ce4cd9112b8b89d8bbe524554f946a81a223dc4fe452a898"
 *     },
 *   ]
 * }
 */
export async function GetServerAddrOfABCIApp(){
    const setupClient = await new SetupClient(await GetConnection())
    const chainState = await setupClient.MakeChainState()
    const result = await chainState.ActivatedWebServiceServers()
    console.info('list of webserver address:', result)
    return result
}

/**
 * 重置某个节点到初始化的状态，
 * @Remark
 *  1. 会删除节点的链上数据。
 *  2. 并不会变成未初始化状态
 *  3. 该操作删除链上数据后会重启该节点，该节点会自动从其他节点同步数据过来。
 *  4. 一般用于某个节点数据损坏，无法正常工作的情况。
 *  5. [重要] 一次将所有节点都重置了，会导致数据丢失。
 * @returns {Promise<Object>} 响应结果，返回{success: boolean, data?: any, error?: string}
 */
export async function ResetNode(...nodeIDs) {
    const setupClient = await new SetupClient(await GetConnection())
    return await setupClient.ResetNode(...nodeIDs)
}

export async function ResetNodeByName(...nodeNames) {
    const setupClient = await new SetupClient(await GetConnection())
    const nodeIDs = (await setupClient.MakeChainState()).GetNodeIDsByName(...nodeNames)
    return await ResetNode(...nodeIDs)
}