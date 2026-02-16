import {generateToken, sharedSecret} from "../src/Crypto.js";
import {WebSocketConnection} from "../src/Connection.js";

let conn = null;
let serverAddr = null;

export function setServerAddress(addr) {
    serverAddr = addr;
}

export async function GetConnection() {

    if (conn != null) {
        return conn;
    }

    // you can change clientID.
    const clientID = 'redgate_c58f'

    if (!serverAddr) {
        console.error('serverAddr is missing')
    }

    async function getToken() {
        return generateToken(clientID, sharedSecret)
    }

    function getClientId() {
        return clientID;
    }

    conn = new WebSocketConnection(serverAddr, {
        getToken: getToken,
        getClientId: getClientId,
        connectTimeout: 30000
    });

    const p = await conn.connect();
    if (p === null) {
        console.log('connecting failed, addr: ', serverAddr)
    }

    return conn;
}