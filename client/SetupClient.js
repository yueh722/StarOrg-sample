//SetupClient.js

export class SetupClient {
    /**
     * @param {WebSocketConnection} conn - 已初始化的连接实例
     */
    constructor(conn) {
        this.conn = conn;
        this.methods = this.initSetupMethods();
        // 订阅网络状态事件
        this.conn.onConnected = () => this.onConnected();
        this.conn.onDisconnected = () => this.onDisconnected();
        this.conn.onError = (error) => this.onError(error);
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


    async GetChainState() {
        const result = await this.callMethod('GetChainState');
        if (result.success) {
            console.log("chain-state", result.data);
            return result.data;
        }
        //return null;
    }

    /**
     * 调用Echo业务方法
     * @param {Object} params - Echo参数
     * @param {number} params.id - 自定义ID
     * @param {string} params.name - 名称
     * @param {string} params.payload - 负载数据
     * @returns {Promise<Object>} 响应结果，返回{success: boolean, data?: any, error?: string}
     */
    async InitializeChainNode(params) {
        const result = await this.callMethod('BroadcastInitializeChainNode', 'hellochain', 'argnodes');
        if (result.success) {
            console.log("init-chain", result.data);
            return true
        }
        return result.error;
    }

    async AddChainNode(params) {
        const result = await this.callMethod('BroadcastAddChainNode', 'argnode');
        if (result.success) {
            console.log("add-chain", result.data);
            return true
        }
        return result.error;
    }

    async StartNode(params) {
        const result = await this.callMethod('ControlNode', 'ctrl-node');
        if (result.success) {
            console.log("start-chain", result.data);
            return true
        }
        return result.error;
    }

    // --- 可以被重写的网络事件回调 ---
    onConnected() {
        console.log('[SetupClient] 连接已建立');
    }

    onDisconnected() {
        console.log('[SetupClient] 连接已断开');
    }

    onError(error) {
        console.error('[SetupClient] 连接错误:', error);
    }
}