import {GetConnection} from "./conn.js";
import {StreamClient} from "../src/StreamClient.js";
import {generateRandomString} from "../src/Crypto.js";

export async function StartStream() {
    const streamID = generateRandomString()
    const streamClient = new StreamClient(await GetConnection(), {
        onNodeStatus: (statusNode) => {
            //console.log('id:', streamID, 'node status:', statusNode);
        },
        onStorage: (statusStorage) => {
            //console.log('id:', streamID, 'storage status:', statusStorage);
        },
        onSetup: (setupCommand) => {
            //console.log('id:', streamID, 'setup command:', setupCommand);
        },
        onLog: (log) => {
            console.log('id:', streamID, 'log:', log);
        },
        onTx: (tx) => {
            console.log('id:', streamID, 'tx:', tx);
        },
        onProcess: (processInfo) => {
            console.log('id:', streamID, 'process:', processInfo);
        },
        onAgent: (agentInfo) => {
            console.log('id:', streamID, 'agent:', agentInfo);
        }
    });

}