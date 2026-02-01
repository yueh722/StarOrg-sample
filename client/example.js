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
    onNodeStatus: (statusNode) => {
        console.log('node status:', statusNode);
    },
    onStorage: (statusStorage) => {
        console.log('storage status:', statusStorage);
    },
    onSetup: (setupCommand) => {
        console.log('setup command:', setupCommand);
    },
    onLog: (log) => {
        console.log('log:', log);
    },
    onTx: (tx) => {
        console.log('tx:', tx);
    }
});

const p = await conn.connect();

const chainState = await setupClient.GetChainState();
console.log("chain-state", chainState);

const result = setupClient.InitializeChainNode('first', {})
console.log("init-chain", result);




