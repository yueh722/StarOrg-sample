import {generateToken, sharedSecret} from "../src/Crypto.js";
import {WebSocketConnection} from "../src/Connection.js";

let conn = null;

export async function GetConnection() {

    if (conn != null) {
        return conn;
    }

    const clientID = 'redgate_c58f'
    const serverAddr = 'localhost:8080/websocket'

    function getToken() {
        return generateToken(clientID, sharedSecret)
    }

    function getClientId() {
        return clientID;
    }

    conn = new WebSocketConnection(serverAddr, {
        getToken: getToken,
        getClientId: getClientId,
        connectTimeout: 10000
    });

    const p = await conn.connect();
    if (p === null) {
        console.log('connecting failed, addr: ', serverAddr)
    }

    return conn;
}