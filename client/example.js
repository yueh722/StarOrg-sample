//sample.js

// Connect to server
// 1. 替换成你的token和clientId计算函数
import {generateToken, sharedSecret} from "./crypto.js";
import {WebSocketConnection} from "./connection.js";
import {SetupClient} from "./SetupClient.js";
import {StreamClient} from "./StreamClient.js";

const clientID = 'redgate_c58f'
const serverAddr = 'localhost:8080/websocket'

function getToken() {
    return generateToken(clientID, sharedSecret)
}

function getClientId() {
    return clientID;
}

// 2. 创建连接实例
const conn = new WebSocketConnection(serverAddr, {
    getToken: getToken,
    getClientId: getClientId,
    connectTimeout: 10000
});

// Setup
const setupClient = new SetupClient(conn);

// Stream
const streamClient = new StreamClient(conn, {
    onStatus: (statusNode) => {
        console.log('状态推送:', statusNode);
    },
    onLog: (log) => {
        console.log('日志推送:', log);
    },
    onTx: (tx) => {
        console.log('交易推送:', tx);
    }
});

const p = await conn.connect();

const result = await setupClient.GetChainState();



