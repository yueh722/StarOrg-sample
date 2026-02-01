//StreamClient.js

export class StreamClient {
    /**
     * @param {WebSocketConnection} conn - 已初始化的连接实例
     * @param {Object} callbacks - 推送消息回调
     * @param {function(Object)} callbacks.onStatus - 状态推送回调
     * @param {function(Object)} callbacks.onLog - 日志推送回调
     * @param {function(Object)} callbacks.onTx - 交易推送回调
     */
    constructor(conn, callbacks = {}) {
        this.conn = conn;
        this.callbacks = {
            onNodeStatus: () => {},
            onStorage: () => {},
            onSetup: () => {},
            onLog: () => {},
            onTx: () => {},
            ...callbacks
        };

        this.namespace = 'stream';
        this.subscriptionType = 'subscribeStream';
        this.subscriptionId = null; // 当前唯一订阅ID
        // 订阅原始消息，处理服务器主动推送
        this.conn.onRawMessage = (message) => this.handleIncomingMessage(message);
        // 订阅网络状态事件
        this.conn.onConnected = () => this.onConnected();
        this.conn.onDisconnected = () => this.onDisconnected();
    }


    /**
     * 处理服务器主动推送的消息
     * @private
     * @param {Object} message - 推送消息
     */
    handleIncomingMessage(message) {
        // 标准JSON-RPC订阅推送格式
        if (message.method === 'stream_subscription' && message.params?.subscription === this.subscriptionId) {
            const result = message.params.result;
            //console.log('[StreamClient]:', result)
            switch (result.type) {
                case 'node':
                    this.callbacks.onNodeStatus(result.data);
                    break;
                case 'storage':
                    this.callbacks.onStorage(result.data);
                    break;
                case 'seetup':
                    this.callbacks.onSetup(result.data);
                    break;
                case 'tx':
                    this.callbacks.onTx(result.data);
                    break;
                case 'log':
                    this.callbacks.onLog(result.data);
                    break;
                default:
                    console.warn('[StreamClient] 未知的推送消息类型:', result.type);
            }
        }
    }

    /**
     * 连接建立后发起订阅, 接收状态通知和实时数据. app名称可随意
     */
    async onConnected() {
        console.log('[StreamClient] 连接已建立，开始订阅推送');
        try {
            this.subscriptionId = await this.conn.subscribe(this.namespace, this.subscriptionType, {app: 'myapp'});
            console.log('[StreamClient] 订阅成功，订阅ID:', this.subscriptionId);
        } catch (error) {
            console.error('[StreamClient] 订阅失败:', error.message);
        }
    }

    onDisconnected() {
        console.log('[StreamClient] 连接已断开，停止接收推送');
        this.subscriptionId = null;
    }
}
