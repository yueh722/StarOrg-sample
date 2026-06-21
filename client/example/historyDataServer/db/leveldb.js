import { Level } from 'level';
import { BaseStore } from './store.js';

class LevelDBStore extends BaseStore {
    constructor(dbPath = './history_hash_leveldb') {
        super();
        // Initialize leveldb, store value as utf8 string
        this.db = new Level(dbPath, { valueEncoding: 'utf8' });
    }

    /**
     * Pad timestamp to fixed 13-digit string to ensure dictionary order equals time order
     * @private
     * @param {number} ts - millisecond timestamp
     * @returns {string} padded 13-digit timestamp string
     */
    #padTs(ts) {
        return String(ts).padStart(13, '0');
    }

    /**
     * Write record, key format: range:{bizId}:{paddedTs}:{hash}
     * Append hash to key tail to avoid key conflict when same bizId + same timestamp has multiple hashes
     * @param {string} bizId
     * @param {number} tsMs
     * @param {string} hash
     * @returns {Promise<void>}
     */
    async putRecord(bizId, tsMs, hash) {
        const paddedTs = this.#padTs(tsMs);
        // Append hash to key suffix to guarantee unique key
        const storeKey = `range:${bizId}:${paddedTs}:${hash}`;
        // Value only stores original hash
        await this.db.put(storeKey, hash);
    }

    /**
     * Scan time range records by bizId
     * @param {string} bizId
     * @param {number} startTsMs
     * @param {number} endTsMs
     * @returns {Promise<Array<{timestamp: number, hash: string}>>}
     */
    async queryRange(bizId, startTsMs, endTsMs) {
        const prefix = `range:${bizId}:`;
        const startKey = prefix + this.#padTs(startTsMs);
        const endKey = prefix + this.#padTs(endTsMs) + '\xff';

        const resultList = [];
        // Iterate ordered keys within time range
        for await (const [fullKey, hashVal] of this.db.iterator({
            gte: startKey,
            lte: endKey
        })) {
            // Split key: ["range", bizId, paddedTs, hash]
            const keyParts = fullKey.split(':');
            const timeStr = keyParts[2];
            const timestamp = parseInt(timeStr, 10);
            resultList.push({ timestamp, hash: hashVal });
        }
        return resultList;
    }

    /**
     * Traverse all records under specified bizId to match target hash
     * @param {string} bizId
     * @param {string} targetHash
     * @returns {Promise<{timestamp: number, hash: string} | null>}
     */
    async findByHash(bizId, targetHash) {
        const prefix = `range:${bizId}:`;
        const endBoundary = prefix + '\xff';

        for await (const [fullKey, hashVal] of this.db.iterator({
            gte: prefix,
            lte: endBoundary
        })) {
            if (hashVal === targetHash) {
                const keyParts = fullKey.split(':');
                const timeStr = keyParts[2];
                return {
                    timestamp: parseInt(timeStr, 10),
                    hash: targetHash
                };
            }
        }
        return null;
    }
}

export default LevelDBStore;
