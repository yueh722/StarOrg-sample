import {SetupClient} from "../src/SetupClient.js";
import {GetConnection} from "./conn.js";

export async function StartAllNodes(){
    const setupClient = await new SetupClient(await GetConnection())
    const result = await setupClient.StartAllInitializedNodes()
    if (result.success === true) {
        console.log('StartAllInitializedNodes succeeded')
    } else {
        console.log('failure:' + result)
    }
    return result
}

export async function StopAllNodes(){
    const setupClient = await new SetupClient(await GetConnection())
    const result = await setupClient.StopAllNodes()
    if (result.success === true) {
        console.log('StopAllNodes succeeded')
    } else {
        console.log('failure:' + result)
    }
    return result

}

export async function RestartAllNodes(){
    const setupClient = await new SetupClient(await GetConnection())
    const result = await setupClient.RestartAllNodes()
    if (result.success === true) {
        console.log('ReStartAllNodes succeeded')
    } else {
        console.log('failure:' + result)
    }
    return result

}

export async function ResetNode(nodeName){
    const setupClient = await new SetupClient(await GetConnection())
    const result = await setupClient.ResetNode(nodeName)
    if (result.success === true) {
        console.log('ResetNode succeeded')
    } else {
        console.log('failure:' + result)
    }
    return result

}