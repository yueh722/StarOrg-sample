import LevelDBStore from "./leveldb.js";

/**
 * Abstract storage interface, all storage implementations must implement 3 core methods
 */
export class BaseStore {
    /**
     * Write single record
     * @param {string} bizId - business unique id
     * @param {number} tsMs - timestamp in milliseconds
     * @param {string} hash - unique hash string from webservice1
     * @returns {Promise<void>}
     */
    async putRecord(bizId, tsMs, hash) {
        throw new Error("Subclass must implement putRecord method");
    }

    /**
     * Query records by bizId and time range
     * @param {string} bizId - business unique id
     * @param {number} startTsMs - start timestamp ms
     * @param {number} endTsMs - end timestamp ms
     * @returns {Promise<Array<{timestamp: number, hash: string}>>}
     */
    async queryRange(bizId, startTsMs, endTsMs) {
        throw new Error("Subclass must implement queryRange method");
    }

    /**
     * Find single record by bizId + hash
     * @param {string} bizId - business unique id
     * @param {string} targetHash - target hash to match
     * @returns {Promise<{timestamp: number, hash: string} | null>}
     */
    async findByHash(bizId, targetHash) {
        throw new Error("Subclass must implement findByHash method");
    }
}
