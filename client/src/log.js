
export const LogType = {
    chainStateLog: 1,
    connectionLog: 2,
    setupLog: 3,
    streamLog: 4,
}

let LogSwitch = new Map([
    [LogType.chainStateLog, false],
    [LogType.connectionLog, true],
    [LogType.setupLog, false],
    [LogType.streamLog, true],
]);

export function getLogLevel(loggerType) {
    return LogSwitch.get(loggerType)?'debug':'silent';
}
