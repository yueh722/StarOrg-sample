import  {GetServerAddrOfABCIApp} from "../setup.js";
import {setServerAddress} from "../conn.js";

export async function fetchServers(){
    const servers = await GetServerAddrOfABCIApp()
    if (servers.success){
        servers.data = servers.data.map(item => {
            return {
                "server": 'http://'+item.server,
                "token": item.token,
            }
        })
    }
    return servers
}

export let cachedServerList = [];

/**
 * Get server url
 * @param {string} targetServerUrl - remote server full http url
 * @returns {{server: string, token: string}|null}
 */
export async function getRemoteServerConfig(){
    if (cachedServerList.length > 0){
        return cachedServerList[0];
    }
    const res = await fetchServers();
    if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        cachedServerList = res.data;
        console.log("Server cache refreshed, total remote servers:", cachedServerList.length);
        return cachedServerList[0];
    } else {
        console.error("Failed to fetch server list from ABCIApp, keep old cache");
        return nil;
    }
}

export async function InitConfig(){
    setServerAddress('localhost:8080/websocket')
    try {
        await getRemoteServerConfig();
    }catch(err){
        console.error(err);
    }
}