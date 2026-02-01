export class ChainState {
    constructor(state) {
        // 如果传入的是字符串，先解析；否则直接使用
        this.rawData = typeof state === 'string' ? JSON.parse(state) : state;
    }

    ActivatedNodes() {
        return (this.rawData.nodes || []).filter(node => node.healthy === true);
    }

    OfflineNodes() {
        return (this.rawData.nodes || []).filter(node => node.healthy !== true);
    }

    AllNodes() {
        return this.rawData.nodes || [];
    }

    InitializedNodes() {
        return (this.rawData.nodes || []).filter(node => node.initialized === true);
    }

    UninitializedNodes() {
        return (this.rawData.nodes || []).filter(node => node.initialized !== true);
    }



    /**
     * 返回所有 activated（healthy）且 WebServiceListenAddr 非空的节点
     * @param {Array} nodes - 可选，若不传则使用 activatedNodes
     */
    ActivatedWebServiceServers(nodes = this.activatedNodes) {
        return nodes.filter(node => {
            const addr = node.node_info?.web_service_listen_addr;
            return addr && typeof addr === 'string' && addr.trim() !== '';
        });
    }

    IsInitialized() {
        return this.rawData.initialized_time > 0;
    }
}