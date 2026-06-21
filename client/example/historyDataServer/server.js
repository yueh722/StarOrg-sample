import express from 'express';
import cors from 'cors';
import axios from 'axios';
import LevelDBStore from './db/leveldb.js';
import { InitConfig, getRemoteServerConfig, cachedServerList } from "./config.js";

const app = express();
const PORT = 3002;

// Global middleware
app.use(cors());
app.use(express.json());

// Initialize storage instance, replace with other store implementation for switching database
const recordStore = new LevelDBStore();

/**
 * Parse input time value to millisecond timestamp
 * Support two input formats:
 * 1. Numeric millisecond timestamp: 1782000000000
 * 2. Formatted time string: "2026-01-01 12:01:02.647574"
 * @param {string|number} inputTime - raw time input from request
 * @returns {number} millisecond timestamp
 * @throws {Error} throw error when format invalid
 */
function parseTimeToMs(inputTime) {
    if (typeof inputTime === 'number') {
        return inputTime;
    }
    const numericVal = Number(inputTime);
    if (!isNaN(numericVal)) {
        return numericVal;
    }
    // Parse formatted datetime string
    const dateObj = new Date(inputTime);
    if (isNaN(dateObj.getTime())) {
        throw new Error(`Invalid timestamp format: ${inputTime}, accept ms number or "yyyy-MM-dd HH:mm:ss.SSS"`);
    }
    return dateObj.getTime();
}

/**
 * Batch fetch raw origin data from remote api
 * Compatible with single hash string or hash array input
 * @param {string | string[]} hashInput - single hash or hash list
 * @returns {Promise<Object>} map: key=hash, value=rawData|null
 */
async function fetchRawDataByHash(hashInput) {
    const hashList = Array.isArray(hashInput) ? hashInput : [hashInput];
    if (hashList.length === 0) {
        return {};
    }
    try {

        const serverCfg = getRemoteServerConfig();

        const response = await axios.post(`${serverCfg.server}/did/history`, {
            params: { hashes: hashList },
            headers: {
                'Authorization': `Bearer ${serverCfg.token}`,
                'Content-Type': 'application/json',
            },
            timeout: 30000
        });
        return response.data?.data || {};
    } catch (err) {
        console.error(`Failed to fetch raw data, hashes: ${hashList.join(',')}, error:`, err.message);
        // Fill null for all failed hashes
        const failMap = {};
        hashList.forEach(h => failMap[h] = null);
        return failMap;
    }
}

/**
 * API 1: Submit bizId, timestamp, hash to storage
 * POST /api/submit
 */
app.post('/api/submit', async (req, res) => {
    try {
        const { bizId, timestamp, hash } = req.body;
        // Required parameter validation
        if (!bizId || !timestamp || !hash) {
            return res.status(400).json({
                code: 400,
                msg: 'Missing required params: bizId, timestamp, hash',
                data: null
            });
        }
        // Convert arbitrary time format to ms timestamp
        const tsMs = parseTimeToMs(timestamp);
        await recordStore.putRecord(bizId, tsMs, hash);

        res.json({
            code: 200,
            msg: 'Submit record success',
            data: { bizId, timestamp: tsMs, hash }
        });
    } catch (err) {
        res.status(500).json({
            code: 500,
            msg: 'Failed to write storage',
            error: err.message
        });
    }
});

/**
 * API 2: Query single record by hash + bizId
 * GET /api/query/hash?bizId=xxx&hash=xxx
 */
app.get('/api/query/hash', async (req, res) => {
    try {
        const { hash, bizId } = req.query;
        if (!hash || !bizId) {
            return res.status(400).json({
                code: 400,
                msg: 'Missing required params: bizId, hash',
                data: null
            });
        }
        const record = await recordStore.findByHash(bizId, hash);
        if (!record) {
            return res.json({
                code: 200,
                msg: 'No matching hash record found',
                data: null
            });
        }
        // Fetch raw data from remote service
        const rawDataMap = await fetchRawDataByHash(hash);
        res.json({
            code: 200,
            msg: 'Single hash query success',
            data: {
                bizId,
                timestamp: record.timestamp,
                hash,
                rawData: rawDataMap[hash] || null
            }
        });
    } catch (err) {
        res.status(500).json({
            code: 500,
            msg: 'Hash query exception',
            error: err.message
        });
    }
});

/**
 * API 3: Batch query records by bizId + time range
 * GET /api/query/range?bizId=xxx&startTs=xxx&endTs=xxx
 */
app.get('/api/query/range', async (req, res) => {
    try {
        const { bizId, startTs, endTs } = req.query;
        if (!bizId || !startTs || !endTs) {
            return res.status(400).json({
                code: 400,
                msg: 'Missing required params: bizId, startTs, endTs',
                data: null
            });
        }
        // Parse start & end time to ms
        const startMs = parseTimeToMs(startTs);
        const endMs = parseTimeToMs(endTs);
        // Get all matched records in time range
        const recordList = await recordStore.queryRange(bizId, startMs, endMs);
        if (recordList.length === 0) {
            return res.json({
                code: 200,
                msg: 'No records in target time range',
                data: { bizId, originList: [] }
            });
        }
        // Collect unique hashes for batch remote request
        const hashSet = new Set(recordList.map(item => item.hash));
        const rawDataMap = await fetchRawDataByHash(Array.from(hashSet));
        // Assemble final response list
        const originList = recordList.map(item => ({
            timestamp: item.timestamp,
            hash: item.hash,
            rawData: rawDataMap[item.hash] || null
        }));
        // Sort records by timestamp ascending
        originList.sort((a, b) => a.timestamp - b.timestamp);

        res.json({
            code: 200,
            msg: 'Time range query success',
            data: { bizId, originList }
        });
    } catch (err) {
        res.status(500).json({
            code: 500,
            msg: 'Range query exception',
            error: err.message
        });
    }
});

await InitConfig();

// Start http server
app.listen(PORT, () => {
    console.log(`HistoryDataService running on port ${PORT}`);
    console.log(`Storage engine: LevelDB`);
    console.log(`Remote raw data api: ${cachedServerList}`);
});