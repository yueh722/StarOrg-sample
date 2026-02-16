import {makeError, makeSuccess, SetupClient} from "./SetupClient.js";
import {GetConnection} from "../example/conn.js";
import log from "loglevel";
import {getLogLevel, LogType} from "./log.js";

export class ChainState {
    constructor(state) {
        this.logger = log.getLogger('ChainState');
        this.logger.setLevel(getLogLevel(LogType.chainStateLog));

        try {
            this.rawData = typeof state === 'string' ? JSON.parse(state) : state;
            this.logger.info(state)
        }catch (error) {
            console.error('Invalid JSON:', error);
        }
    }

    // return an array of all online nodes
    ActivatedNodes() {
        return (this.rawData.nodes || []).filter(node => {
            return node?.node_info?.node_id !== '' && node?.node_info?.node_name !== '' && node.online === true
        });
    }

    ActivatedNodesByName(...names) {
        if (names.length === 0) {
            return this.ActivatedNodes()
        }

        return (this.rawData.nodes || []).filter(node => {
            return node?.node_info?.node_id !== '' && node?.node_info?.node_name !== '' && node.online === true &&
                names.includes(node?.node_info?.node_name)
        });
    }

    // return an array of all offline nodes
    OfflineNodes() {
        return (this.rawData.nodes || []).filter(node => node.online !== true);
    }

    // return an array of all nodes
    AllNodes() {
        return this.rawData.nodes || [];
    }

    // return an array of node which are initialized and online
    InitializedNodes() {
        return (this.rawData.nodes || []).filter(node => node.initialized === true && node.online === true);
    }

    // return an array of node which are uninitialized and online
    UninitializedNodes() {
        return (this.rawData.nodes || []).filter(node => node.initialized !== true && node.online === true);
    }

    GetNodeIDsByName(...nodeNames) {
        return this.AllNodes().filter(node => {
                return nodeNames.some(item => item.includes(node.node_info.node_name))
            }).map(node => {
                return node.node_info.node_id
            })
    }

    FindHostIpByNodeID(nodeID, prefix) {
        try {
            const node = (this.rawData.nodes || []).find(node => node?.node_info?.node_id === nodeID);
            const addresses =  node ? node.host_info?.ip_addresses || [] : null;
            return findIPByPrefix(addresses, prefix);

        } catch (error) {
            return '';
        }
    }

    /**
     * 返回所有 initialized（healthy）且 WebServiceListenAddr 非空的节点
     */
    async ActivatedWebServiceServers() {
        if (!this.IsInitialized()){
            return makeError('chain is not initialized');
        }

        const data = this.AllNodes()
            .filter(node => {
                return node.initialized === true &&
                node.node_info?.web_service_listen_addr !== undefined &&
                node.node_info?.node_address !== undefined;
            })
            .map(node => {
                const listen_addr = node.node_info?.web_service_listen_addr;
                return {
                    "server": updateListenAddressHost(listen_addr, node.node_info?.node_address),
                    "token": node.node_info?.token,
                }
            }
        );

        return makeSuccess(data)
    }

    IsInitialized() {
        return this.rawData.initialized_time > 0;
    }
}

export function NodesToNodeIDs(nodes) {
    return nodes.map(node => {
        return node.node_info.node_id
    })
}

function findIPByPrefix(addresses, prefix) {
    for (const entry of addresses) {
        // Split by " | " to separate adapter name and IP
        // Note: some adapter names may contain colons (e.g., on Windows),
        // but gopsutil typically uses simple names like "eth0", "en0", etc.
        // We split at the first " | " delimiter
        const parts = entry.split(" | ", 2);
        if (parts.length !== 2) {
            continue; // skip malformed entries
        }
        const ipStr = parts[1];

        // Check if IP starts with the given prefix
        if (ipStr.startsWith(prefix)) {
            return ipStr;
        }
    }
    return '';
}

/**
 * 更新监听地址的 host 部分为服务器地址
 * @param {string} listenAddress - 原始监听地址（支持 URL 格式或 IP:端口 格式）
 * @param {string} serverAddress - 目标服务器地址（如 "192.168.1.100" 或 "example.com"）
 * @returns {string} 更新后的完整地址
 */
function updateListenAddressHost(listenAddress, serverAddress) {
    if (listenAddress === undefined) {
        return ''
    }

    if (serverAddress === undefined) {
        return listenAddress;
    }

    // 场景1：处理 URL 格式（如 http://0.0.0.0:3000/api、ws://localhost:8080）
    if (listenAddress.includes('://')) {
        try {
            const url = new URL(listenAddress);
            url.hostname = serverAddress;
            return url.href;
        } catch (e) {
            console.warn('URL 格式解析失败，尝试按 IP:端口 处理:', e);
        }
    }

    // 场景2：处理 IP:端口 格式（如 0.0.0.0:3000、127.0.0.1:8080）
    const [originalHost, port] = listenAddress.split(':');
    if (port) {
        return `${serverAddress}:${port}`;
    }

    return serverAddress;
}

/*
{
  "nodes": [
    {
      "node_info": {
        "node_name": "node4",
        "node_id": "19517645e106e57b9012b438bf87df2f282a6e20",
        "node_address": "node4",
        "proxy_app": "tcp://127.0.0.1:56658",
        "rpc_addr": "http://127.0.0.1:56657",
        "web_service_listen_addr": "0.0.0.0:4000",
        "validator": true,
        "token": "webservice-api-token",
      },
      "host_info": {
        "host_name": "John-PC",
        "ip_addresses": [
          "本地连接* 1 | ff80::cb49:3acd:b5d:d019",
          "本地连接* 1 | 169.254.155.32",
          "WLAN | ee81::480b:b201:dd20:c785",
          "WLAN | 192.168.1.11",
        ]
      },
      "healthy": true,          // rpc health of Cometbft node
      "online": true,          // indicate if this node is online or offline.
      "last_check": "2026-02-22 15:53:19",
      "started_time": "2026-02-22 15:49:08 2026-02-22 15:49:10",
      "initialized": true
    }
  ],
  "chain_id": "chain-mychain",
  "initialized_time": 1769765678824718300,
  "last_add_node_time": 1769765727651789800
}
*/