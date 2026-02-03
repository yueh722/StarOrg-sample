//SetupClient.js

import {ChainState} from "./ChainState.js";

const NodeStart    = "@start"
const NodeStop     = "@stop"
const NodeRestart  = "@restart"
const NodeReset    = "@reset"


export class SetupClient {
    /**
     * @param {WebSocketConnection} conn - 已初始化的连接实例
     */
    constructor(conn) {
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
        console.error('cannot get chain state from remote!')
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
        console.log("result of initialize-chain:", result);
        if (result.success) {
            return true
        }
        return result.error;
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
        console.log("result of add-node:", result);
        if (result.success) {
            return true
        }
        return result.error;
    }

    async ControlNode(nodeIDs, action) {

        const ctlNodes = nodeIDs.map(nodeID => ({
            node_id: nodeID,
            action: action
        }))

        const result = await this.callMethod('ControlNode', ctlNodes);
        console.log("result of control-node:", result);
        if (result.success) {
            return true
        }
        return result.error;
    }

    //single operation
    async StartNode(...nodeIDs) {
        return await this.ControlNode(...nodeIDs, NodeStart);
    }

    async StopNode(...nodeIDs) {
        return await this.ControlNode(...nodeIDs, NodeStop);
    }

    async ReStartNode(...nodeIDs) {
        return await this.ControlNode(...nodeIDs, NodeRestart);
    }

    async ResetNode(...nodeIDs) {
        return await this.ControlNode(...nodeIDs, NodeReset);
    }


    //batch operation
    async ControlAllNodes(action) {
        const chainState = await this.MakeChainState();
        return await this.ControlNode(chainState.ActivatedNodes(), action);
    }

    async StartAllNodes() {
        return await this.ControlAllNodes(NodeStart);
    }

    async StopAllNodes() {
        return await this.ControlAllNodes(NodeStop);
    }

    async ReStartAllNodes() {
        return await this.ControlAllNodes(NodeRestart);
    }

    async PurgeChain() {
        const chainState = await this.MakeChainState();
        if (!chainState.IsInitialized()){
            return '{"error": "chain has not initialized, no need to reset"}'
        }

        const result = await this.callMethod('BroadcastPurgeChainNode', {});
        console.log("result of purge-chain:", result);
        if (result.success) {
            return true
        }

        return result.error;
    }


    // --- 可以被重写的网络事件回调 ---
    async onConnected() {
        console.log('[SetupClient] 连接已建立');
    }

    async onDisconnected() {
        console.log('[SetupClient] 连接已断开');
    }

    async onError(error) {
        console.error('[SetupClient] 连接错误:', error);
    }
}