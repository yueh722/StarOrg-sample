import {GetConnection} from "./conn.js";
import {StreamClient} from "../src/StreamClient.js";

export async function StartStream() {
    const streamClient = new StreamClient(await GetConnection(), {
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

}