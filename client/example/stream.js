import {GetConnection} from "./conn.js";
import {StreamClient} from "../src/StreamClient.js";

export async function StartStream() {
    const streamClient = new StreamClient(await GetConnection(), {
        onNodeStatus: (statusNode) => {
            //console.log('node status:');
        },
        onStorage: (statusStorage) => {
            //console.log('storage status:');
        },
        onSetup: (setupCommand) => {
            console.log('setup command:', setupCommand);
        },
        onLog: (log) => {
            console.log('log:', log);
        },
        onTx: (tx) => {
            console.log('tx:', tx);
        },
        onProcess: (processInfo) => {
            console.log('process:', processInfo);
        },
        onAgent: (agentInfo) => {
            console.log('agent:', agentInfo);
        }
    });

}