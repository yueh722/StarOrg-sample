//SetupClient.js

import {ChainState, NodesToNodeIDs} from "./ChainState.js";
import log from "loglevel";
import {getLogLevel, LogType} from "./log.js";

const NodeStart    = "@start"
const NodeStop     = "@stop"
const NodeRestart  = "@restart"
const NodeReset    = "@reset"


export class SetupClient {
    /**
     * @param {WebSocketConnection} conn - 已初始化的连接实例
     */
    constructor(conn) {
        this.logger = log.getLogger('SetupClient');
        this.logger.setLevel(getLogLevel(LogType.setupLog));

        this.conn = conn;
        this.methods = this.initSetupMethods();
        // 订阅网络状态事件
        this.conn.SetConnectedCallback(this.onConnected);
        this.conn.SetDisconnectedCallback(this.onDisconnected);
        this.conn.SetErrorCallback(this.onError);

        this.onConnected();
    }

    initSetupMethods() {
        const functions = [
            "GetChainState",
            "BroadcastInitializeChainNode",
            "BroadcastAddChainNode",
            "ControlNode",
            "BroadcastPurgeChainNode",
        ]

        let methods = new Map()

        for (const functionName of functions) {
            const realMethodName = 'chain_' + functionName[0].toLowerCase() + functionName.slice(1)
            methods.set(functionName, realMethodName);
        }

        return methods;
    }

    callMethod(method, ...params) {
        return this.conn.callMethod(this.methods.get(method), ...params);
    }


    async MakeChainState() {
        const result = await this.callMethod('GetChainState');
        if (result.success) {
            return new ChainState(JSON.stringify(result.data, null, 2));
        }
        this.logger.error('cannot get chain state from remote!')
        return new ChainState();
    }

    async IsChainInitialized(){
        const chainState = await this.MakeChainState();
        return chainState.IsInitialized();
    }

    /**
     * 调用Echo业务方法
     * @param {nodes} params - 将要初始化的node array
     * @param {chainID} params - 将要初始化的chainID
     * @returns {Promise<Object>} 响应结果，返回{success: boolean, data?: any, error?: string}
     */
    async InitializeChainNode(chainID, argNodes) {

        if (chainID === '' || argNodes === undefined) {
            return 'chainID and argNodes can not be empty';
        }

        if (await this.IsChainInitialized()) {
            return 'the chain has already been initialized!'
        }

        const result = await this.callMethod('BroadcastInitializeChainNode', chainID, argNodes);
        this.logger.log("result of initialize-chain:", result);
        return result
    }

    async AddChainNode(argNode) {
        //check params
        if (argNode === undefined) {
            return 'chainID and argNodes can not be empty';
        }


        if (!await this.IsChainInitialized()) {
            return 'the chain has not been initialized!'
        }

        const result = await this.callMethod('BroadcastAddChainNode', argNode);
        this.logger.log("result of add-node:", result);
        return result

    }

    async ControlNode(action, ...nodeIDs) {

        const ctlNodes = nodeIDs.map(nodeID => {
            return {
                node_id: nodeID,
                action: action
            }
        })

        const result = await this.callMethod('ControlNode', ctlNodes);
        this.logger.log("result of control-node:", result);
        return result;
    }

    //single operation
    async StartNode(...nodeIDs) {
        return await this.ControlNode(NodeStart, ...nodeIDs);
    }

    async StopNode(...nodeIDs) {
        return await this.ControlNode(NodeStop, ...nodeIDs);
    }

    async ReStartNode(...nodeIDs) {
        return await this.ControlNode(NodeRestart, ...nodeIDs);
    }

    async ResetNode(...nodeIDs) {
        return await this.ControlNode(NodeReset, ...nodeIDs);
    }


    //batch operation
    async ControlAllNodes(action) {
        const chainState = await this.MakeChainState();
        const nodeIDs = NodesToNodeIDs(chainState.ActivatedNodes())
        return await this.ControlNode(action, ...nodeIDs);
    }

    // start all nodes that had already been initialized.
    async StartAllInitializedNodes() {
        const chainState = await this.MakeChainState();
        const nodeIDs = NodesToNodeIDs(chainState.InitializedNodes())
        return await this.ControlNode(NodeStart, ...nodeIDs);
    }

    // stop all running nodes.
    async StopAllNodes() {
        return await this.ControlAllNodes(NodeStop);
    }

    // stop all running nodes and start all initialized nodes.
    async ReStartAllNodes() {
        let result = await this.StopAllNodes()
        if (result.success !== true) {
            return result
        }

        return await this.StartAllInitializedNodes()
    }

    async PurgeChain() {
        const chainState = await this.MakeChainState();
        if (!chainState.IsInitialized()){
            return '{"error": "chain has not initialized, no need to reset"}'
        }

        const result = await this.callMethod('BroadcastPurgeChainNode', {});
        this.logger.log("result of purge-chain:", result);
        return result;
    }


    // --- 可以被重写的网络事件回调 ---
    async onConnected() {
        this.logger.log('[SetupClient] 连接已建立');
    }

    async onDisconnected() {
        this.logger.log('[SetupClient] 连接已断开');
    }

    async onError(error) {
        this.logger.error('[SetupClient] 连接错误:', error);
    }
}