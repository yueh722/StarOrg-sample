//Connection.js

import https from 'https';

export class WebSocketConnection {
    /**
     * @param {string} address - 连接地址（不带协议前缀，例如 "example.com/ws"）
     * @param {Object} [options] - 连接配置
     * @param {function(): string} options.getToken - 获取 token 的自定义函数
     * @param {function(): string} options.getClientId - 获取 clientId 的自定义函数
     * @param {number} [options.connectTimeout=5000] - 连接超时时间(ms)
     * @param {number} [options.reconnectInterval=3000] - 断线自动重连间隔(ms)，默认3000
     */
    constructor(address, options = {}) {
        this.address = address;
        this.options = {
            connectTimeout: 5000,
            econnectInterval: 3000,
            getToken: () => {},
            getClientId: () => {},
            ...options
        };
        this.ws = null; // 实际WebSocket实例
        this.isConnected = false;
        this.connectPromise = null; // 当前连接Promise，避免重复连接
        this.messageQueue = new Map(); // 等待响应的消息队列 <requestId, resolve/reject>
        this.nextRequestId = 1; // 自增请求ID，用于匹配响应
        this.reconnectTimer = null;

        this.onConnected = () => {};
        this.onDisconnected = () => {};
        this.onError = (error) => {};
        this.onRawMessage = (message) => {};
    }

    /**
     * 发起连接，自动尝试 ws/wss 协议
     * @returns {Promise<void>} 连接成功/失败的Promise
     */
    async connect() {
        if (this.connectPromise) return this.connectPromise;

        this.connectPromise = new Promise(async (resolve, reject) => {
            const protocols = ['wss', 'ws'];
            let lastError = null;

            // 依次尝试不同协议
            for (const protocol of protocols) {
                try {
                    await this.tryConnectWithProtocol(protocol);
                    console.log(`成功通过 ${protocol} 协议连接到 ${this.address}`);
                    this.isConnected = true;
                    this.onConnected();
                    this.clearReconnectTimer();
                    resolve();
                    return;
                } catch (error) {
                    lastError = error;
                    console.warn(`${protocol} 连接失败，尝试下一个协议:`, error.message);
                }
            }

            // 所有协议都失败
            reject(new Error(`所有协议连接失败: ${lastError?.message || '未知错误'}`));
            this.connectPromise = null;
        });

        return this.connectPromise;
    }

    /**
     * 尝试单个协议连接
     * @private
     * @param {string} protocol - ws 或 wss
     * @returns {Promise<void>}
     */
    async tryConnectWithProtocol(protocol) {
        const url = `${protocol}://${this.address}`;

        const httpsAgent = new https.Agent({
            // 核心：拒绝未授权证书时不报错，跳过所有证书验证（包括过期、自签名、域名不匹配）
            rejectUnauthorized: false,
            // 可选：忽略证书过期的额外配置（低版本Node.js可能需要）
            minVersion: 'TLSv1.2'
        });

        // 构建带自定义头的请求（WebSocket原生不支持设置头，需通过Options参数在浏览器环境兼容）
        const wsOptions = {
            agent: httpsAgent,
        };

        // 浏览器环境通过 headers 设置（部分浏览器支持），Node.js环境需用 ws 库的 headers 选项
        if (typeof window === 'undefined') {
            // Node.js 环境（依赖 ws 库，需提前 npm install ws）
            const WebSocket = (await import('ws')).default;
            wsOptions.headers = {
                'Authorization': `Bearer ${this.options.getToken()}`,
                'X-Client-ID': this.options.getClientId()
            };
            this.ws = new WebSocket(url, wsOptions);
        } else {
            // 浏览器环境
            this.ws = new WebSocket(url);
            // 浏览器原生WebSocket不支持自定义请求头，若必须设置可通过query参数传递（需服务端配合）
            // 注意：以下方式仅部分浏览器支持，标准WebSocket协议不支持请求头
            // this.ws = new WebSocket(url, [], {
            //   headers: {
            //     'Authorization': `Bearer ${this.options.getToken()}`,
            //     'X-Client-Id': this.options.getClientId()
            //   }
            // });
            console.warn('浏览器环境WebSocket不支持自定义请求头，若需认证请使用query参数或协议内携带');
        }

        return new Promise((resolve, reject) => {
            const timeoutTimer = setTimeout(() => {
                reject(new Error(`连接超时（${this.options.connectTimeout}ms）`));
                this.ws.close();
            }, this.options.connectTimeout);

            // 连接成功回调
            this.ws.onopen = () => {
                clearTimeout(timeoutTimer);
                this.setupMessageListener();
                this.clearReconnectTimer();
                resolve();
            };

            // 连接错误回调
            this.ws.onerror = (error) => {
                clearTimeout(timeoutTimer);
                reject(error);
            };

            // 连接关闭回调
            this.ws.onclose = () => {
                this.isConnected = false;
                this.onDisconnected();
                this.connectPromise = null;
                this.startReconnectTimer();
            };
        });
    }

    startReconnectTimer() {
        if (this.reconnectTimer) return;
        this.reconnectTimer = setInterval(() => {
            if (!this.isConnected) {
                console.log('[WebSocketConnection] 断线，尝试自动重连...');
                this.connect().catch(() => {
                    // 重连失败，等待下次尝试
                });
            }
        }, this.options.reconnectInterval);
    }

    clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearInterval(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    /**
     * 设置消息监听，处理响应匹配和原始消息转发
     * @private
     */
    setupMessageListener() {
        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);

                // 标准 JSON-RPC 响应格式判断
                // JSON-RPC 响应包含 id 和 result/error
                if (message.id !== undefined) {
                    const requestId = parseInt(message.id, 10);
                    if (this.messageQueue.has(requestId)) {
                        const { resolve, reject } = this.messageQueue.get(requestId);
                        this.messageQueue.delete(requestId);

                        if ('result' in message) {
                            resolve(message.result);
                        } else if ('error' in message) {
                            // error object may have message property
                            const errMsg =
                                (typeof message.error === 'string')
                                    ? message.error
                                    : (message.error && message.error.message) || '请求失败';
                            reject(new Error(errMsg));
                        } else {
                            reject(new Error('无效的JSON-RPC响应'));
                        }
                        return;
                    }
                }

                // 转发未经请求的主动推送消息给业务层
                this.onRawMessage(message);
            } catch (error) {
                console.error('消息解析失败:', error, event.data);
                this.onError(error);
            }
        };
    }

    async callMethod(method, ...params) {
        try {
            const result = await this.sendRequest(method, params);
            return {
                success: true,
                data: result
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 发送请求并等待响应
     * @param {string} method - 业务方法名(例如 namespace_MethodName) (注意MethodName首字母要小写)
     * @param {Object} params - 业务参数
     * @returns {Promise<any>} 响应结果
     */
    async sendRequest(method, params) {
        if (!this.isConnected) {
            throw new Error('连接未建立，请先调用connect()');
        }

        const requestId = this.nextRequestId++;
        const message = JSON.stringify({
            jsonrpc: "2.0", // 标准JSON-RPC版本字段
            id: requestId,
            method,
            params,
            timestamp: Date.now()
        });

        return new Promise((resolve, reject) => {
            this.messageQueue.set(requestId, { resolve, reject });
            this.ws.send(message);

            // 响应超时处理
            setTimeout(() => {
                if (this.messageQueue.has(requestId)) {
                    this.messageQueue.delete(requestId);
                    reject(new Error('请求响应超时'));
                }
            }, this.options.connectTimeout);
        });
    }

    /**
     * 订阅 go-ethereum 风格的 RPC 流（如 eth_subscribe, echo_subscribe）
     * @param {string} namespace - 命名空间，如 'eth', 'echo'
     * @param {string} subscriptionType - 订阅类型（对应 Go 方法去掉 "Subscribe" 后的小写名），如 'stream'
     * @param {Object|Array} [args={}] - 订阅参数（对应 Go 中的 Arg 结构体）
     * @returns {Promise<string>} 返回 subscription ID
     */
    async subscribe(namespace, subscriptionType, args = {}) {
        const method = `${namespace}_subscribe`;
        const params = [subscriptionType, args];
        return await this.sendRequest(method, params);
    }
    /**
     * 直接发送无响应的消息（例如主动推送）
     * @param {Object} message - 消息内容
     */
    send(message) {
        if (this.isConnected) {
            this.ws.send(JSON.stringify(message));
        } else {
            throw new Error('连接未建立');
        }
    }

    /**
     * 关闭连接
     */
    close() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        this.messageQueue.clear();
        this.connectPromise = null;
    }

    SetConnectedCallback(callback) {
        this.onConnected = callback;
    }

    SetDisconnectedCallback(callback) {
        this.onDisconnected = callback;
    }

    SetErrorCallback(callback) {
        this.onError = callback;
    }

    SetRawMessageCallback(callback) {
        this.onRawMessage = callback;
    }

    setTokenGenerator(generator) {
        this.options.getToken = generator;
    }

    setClientIdGenerator(generator) {
        this.options.getClientId = generator;
    }
}

