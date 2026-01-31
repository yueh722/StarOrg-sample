//src/api/chain.js
const WebSocket = require('ws');
const axios = require('axios');

class EthereumApi {
    constructor(address) {
        this.address = address.includes('wss') ? address : address.replace('ws', 'wss');
        this.ws = new WebSocket(this.address);
        this.ws.on('open', () => console.log('WebSocket connection established.'));
    }

    sendRequest(method, params = []) {
        return new Promise((resolve, reject) => {
            const id = Math.floor(Math.random() * 10000);
            const request = {
                jsonrpc: "2.0",
                method: method,
                params: params,
                id: id
            };

            this.ws.send(JSON.stringify(request), (error) => {
                if (error) return reject(error);
            });

            this.ws.on('message', (data) => {
                const response = JSON.parse(data);
                if (response.id === id) {
                    resolve(response.result);
                }
            });
        });
    }

    async getChainState() {
        return await this.sendRequest("GetChainState");
    }

    async broadcastInitializeChainNode(chainID, nodeArray) {
        return await this.sendRequest("BroadcastInitializeChainNode", [chainID, nodeArray]);
    }

    async broadcastAddChainNode(node) {
        return await this.sendRequest("BroadcastAddChainNode", [node]);
    }

    async controlNode(controlConfig) {
        return await this.sendRequest("ControlNode", [controlConfig]);
    }

    async broadcastResetChainNode() {
        return await this.sendRequest("BroadcastResetChainNode");
    }

    subscribeStream(callback) {
        const subscribeMessage = {
            jsonrpc: "2.0",
            method: "stream_subscribeStream",
            params: [],
            id: Math.floor(Math.random() * 10000)
        };
        this.ws.send(JSON.stringify(subscribeMessage));
        this.ws.on('message', (data) => {
            const message = JSON.parse(data);
            if (message.method === "stream") {
                callback(message.params);
            }
        });
    }
}

module.exports = EthereumApi;
