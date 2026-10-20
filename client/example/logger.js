// logger.js
// 專為 server.js 設計的高效日誌模組：
// 1. 每日自動分檔 (server-YYYY-MM-DD.log)
// 2. 超過單檔大小上限 (預設 20MB) 自動切檔 (.1.log, .2.log)，防止檔案過大開不起來
// 3. 存放在 C:\ProgramData\chainnode\server\log\，便於與 nodeagent/nodemaster 一起管理
// 4. 自動清理超過保留天數 (預設 30 天) 的舊日誌
// 5. 同步輸出 Console 與 寫入檔案

import fs from 'fs';
import path from 'path';

class DailyLogger {
    constructor(options = {}) {
        const defaultBaseDir = process.env.ProgramData 
            ? path.join(process.env.ProgramData, "chainnode", "server", "log")
            : path.join(process.cwd(), "logs");

        this.logDir = options.logDir || defaultBaseDir;
        this.maxDays = options.maxDays || 30; // 預設保留 30 天
        this.maxFileSize = options.maxFileSize || 20 * 1024 * 1024; // 單檔上限 20MB
        this.currentDateStr = '';
        this.currentFilePath = '';
        this.currentPart = 0;

        this.ensureDir();
        this.cleanOldLogs();
    }

    ensureDir() {
        try {
            if (!fs.existsSync(this.logDir)) {
                fs.mkdirSync(this.logDir, { recursive: true });
            }
        } catch (e) {
            console.error(`[Logger] 無法建立日誌目錄 ${this.logDir}:`, e.message);
        }
    }

    // 格式化目前日期時間: 2026-10-20 14:30:15.123
    formatTimestamp(date = new Date()) {
        const pad = (n, len = 2) => String(n).padStart(len, '0');
        const y = date.getFullYear();
        const m = pad(date.getMonth() + 1);
        const d = pad(date.getDate());
        const h = pad(date.getHours());
        const min = pad(date.getMinutes());
        const s = pad(date.getSeconds());
        const ms = pad(date.getMilliseconds(), 3);
        return `${y}-${m}-${d} ${h}:${min}:${s}.${ms}`;
    }

    getDateString(date = new Date()) {
        const pad = (n) => String(n).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    // 取得或切換當前寫入的檔案路徑
    getCurrentLogFile() {
        const today = this.getDateString();
        if (today !== this.currentDateStr) {
            this.currentDateStr = today;
            this.currentPart = 0;
            this.cleanOldLogs(); // 換日即自動檢查清理過期 log
        }

        const baseFileName = `server-${this.currentDateStr}`;
        let targetFile = path.join(this.logDir, this.currentPart === 0 ? `${baseFileName}.log` : `${baseFileName}.${this.currentPart}.log`);

        // 檢查檔案大小是否超過上限，超過則切換至下一個 part (.1.log, .2.log ...)
        try {
            if (fs.existsSync(targetFile)) {
                const stat = fs.statSync(targetFile);
                if (stat.size >= this.maxFileSize) {
                    this.currentPart += 1;
                    targetFile = path.join(this.logDir, `${baseFileName}.${this.currentPart}.log`);
                }
            }
        } catch (e) { }

        return targetFile;
    }

    // 自動清理超過保留天數的舊 Log
    cleanOldLogs() {
        try {
            if (!fs.existsSync(this.logDir)) return;
            const now = Date.now();
            const maxAgeMs = this.maxDays * 24 * 60 * 60 * 1000;
            const files = fs.readdirSync(this.logDir);

            files.forEach(file => {
                if (file.startsWith('server-') && file.includes('.log')) {
                    const filePath = path.join(this.logDir, file);
                    try {
                        const stat = fs.statSync(filePath);
                        if (now - stat.mtimeMs > maxAgeMs) {
                            fs.unlinkSync(filePath);
                            console.log(`[Logger] 已自動清除過期日誌: ${file}`);
                        }
                    } catch (e) { }
                }
            });
        } catch (e) {
            // 忽略清理錯誤
        }
    }

    formatArgs(args) {
        return args.map(arg => {
            if (arg instanceof Error) {
                return arg.stack || arg.message;
            }
            if (typeof arg === 'object' && arg !== null) {
                try {
                    return JSON.stringify(arg);
                } catch (e) {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ');
    }

    writeLog(level, ...args) {
        const timestamp = this.formatTimestamp();
        const content = this.formatArgs(args);
        const logLine = `[${timestamp}] [${level}] ${content}\n`;

        // 輸出 Console
        if (level === 'ERROR') {
            console.error(logLine.trimEnd());
        } else if (level === 'WARN') {
            console.warn(logLine.trimEnd());
        } else {
            console.log(logLine.trimEnd());
        }

        // 非同步追加至日誌檔，避免阻塞 Event Loop
        try {
            const targetFile = this.getCurrentLogFile();
            fs.appendFile(targetFile, logLine, 'utf8', (err) => {
                if (err) {
                    console.error(`[Logger] 寫入日誌失敗:`, err.message);
                }
            });
        } catch (e) {
            console.error(`[Logger] 日誌寫檔例外:`, e.message);
        }
    }

    info(...args) {
        this.writeLog('INFO', ...args);
    }

    warn(...args) {
        this.writeLog('WARN', ...args);
    }

    error(...args) {
        this.writeLog('ERROR', ...args);
    }

    debug(...args) {
        this.writeLog('DEBUG', ...args);
    }
}

export const logger = new DailyLogger();
export default logger;
