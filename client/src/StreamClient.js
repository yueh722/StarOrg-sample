//StreamClient.js

import log from "loglevel";
import {getLogLevel, LogType} from "./log.js";

export class StreamClient {
    /**
     * @param {WebSocketConnection} conn - 已初始化的连接实例
     * @param {Object} callbacks - 推送消息回调
     * @param {function(Object)} callbacks.onStatus - 状态推送回调
     * @param {function(Object)} callbacks.onLog - 日志推送回调
     * @param {function(Object)} callbacks.onTx - 交易推送回调
     */
    constructor(conn, callbacks = {}) {
        this.logger = log.getLogger('StreamClient');
        this.logger.setLevel(getLogLevel(LogType.streamLog));

        this.conn = conn;
        this.callbacks = {
            onNodeStatus: () => {},
            onStorage: () => {},
            onSetup: () => {},
            onLog: () => {},
            onTx: () => {},
            onProcess: () => {},
            onAgent: () => {},
            ...callbacks
        };

        this.namespace = 'stream';
        this.subscriptionType = 'subscribeStream';
        this.subscriptionId = null;
        // set callback routine for receiving notification of live stream.
        this.conn.SetRawMessageCallback(this.handleIncomingMessage);
        this.conn.SetConnectedCallback(this.onConnected);
        this.conn.SetDisconnectedCallback(this.onDisconnected);

        this.onConnected()
    }


    /**
     * 处理服务器主动推送的消息
     * @private
     * @param {Object} message - 推送消息
     */
    handleIncomingMessage = (message) => {
        // 标准JSON-RPC订阅推送格式
        if (message.method === 'stream_subscription' && message.params?.subscription === this.subscriptionId) {
            const result = message.params.result;
            switch (result.type) {
                case 'node':
                    this.callbacks.onNodeStatus(result.data);
                    break;
                case 'storage':
                    this.callbacks.onStorage(result.data);
                    break;
                case 'setup':
                    this.callbacks.onSetup(result.data);
                    break;
                case 'tx':
                    this.callbacks.onTx(result.data);
                    break;
                case 'log':
                    this.callbacks.onLog(result.data);
                    break;
                case 'process':
                    this.callbacks.onProcess(result.data);
                    break;
                case 'agent':
                    this.callbacks.onAgent(result.data);
                    break;
                default:
                    this.logger.warn('[StreamClient] 未知的推送消息类型:', result.type);
            }
        }
    }

    /**
     * 连接建立后发起订阅, 接收状态通知和实时数据. app名称可随意
     */
    onConnected = async() => {
        if (!this.conn.isConnected){
            return
        }

        this.logger.info('[StreamClient] 连接已建立，开始订阅推送');
        try {
            this.subscriptionId = await this.conn.subscribe(this.namespace, this.subscriptionType, {app: 'myapp'});
            this.logger.info('[StreamClient] 订阅成功，订阅ID:', this.subscriptionId);
        } catch (error) {
            this.logger.error('[StreamClient] 订阅失败:', error.message);
        }
    }

    onDisconnected = async() => {
        this.logger.info('[StreamClient] 连接已断开，停止接收推送');
        this.subscriptionId = null;
    }
}
