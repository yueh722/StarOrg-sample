
const id_prefix = "user:new:"

let host = 'http://localhost:1001';
let token = ''

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format current timestamp string with pattern yyyyMMdd_hhmmssSSSS
 * @returns {string} formatted time string for id field
 */
function getTimeSuffix() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    const secs = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(4, '0');
    return `${year}${month}${day}_${hours}${mins}${secs}${ms}`;
}

/**
 * Single request function to create DID record
 * @param {string} host - api service host address
 * @param {string} token - auth token for standard Authorization header
 * @returns {Promise<Object>} raw response data from create interface
 */
async function usageCreate(host, token) {
    // Generate time suffix for id template
    const timeStr = getTimeSuffix();
    const requestUrl = `${host}/did/create/`;

    // Construct full post request body per interface spec
    const requestBody = {
        id: `${id_prefix}${timeStr}`,
        hashcode: "112233445566",
        revoked: false,
        document: {
            userId: "admin",
            category: "Device",
            type: "InformationSecurity",
            description: "更新",
            createTime: Date.now(),
            sideData: {
                validator: ["val1", "val2"],
                serial: "V9038-CVQ98M363"
            }
        }
    };

    console.log("create request data:\n", JSON.stringify(requestBody, null, 2));

    // Send POST request with standard Authorization header
    const response = await fetch(requestUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: token
        },
        body: JSON.stringify(requestBody)
    });

    const result = await response.json();

    // Throw error if http response status is not ok
    if (!response.ok) {
        throw new Error(`Create request failed, HTTP status code: ${result.code}, message: ${result.message}`);
    }

    // Parse response json data
    // Print creation result to console
    console.log("create request result:\n", JSON.stringify(result, null, 2));
    return requestBody;
}


/**
 * Format current day to time string with pattern yyyyMMdd_HHmmss
 * @param {number} hours - target hour
 * @param {number} minutes - target minute
 * @param {number} seconds - target second
 * @returns {string} formatted time string
 */
function formatTodayTime(hours, minutes, seconds) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const h = String(hours).padStart(2, '0');
    const m = String(minutes).padStart(2, '0');
    const s = String(seconds).padStart(2, '0');
    return `${year}${month}${day}_${h}${m}${s}`;
}

/**
 * Single page DID search request function
 * @param {string} host - api service host
 * @param {string} token - auth token for Authorization header
 * @returns {Promise<Object>} raw response object from interface
 */
async function usageSearch(host, token, pageCount, limit) {
    // Generate today 00:00:00 and 23:59:59 time string
    let startTime = formatTodayTime(0, 0, 0);
    let endTime = formatTodayTime(23, 59, 59);
    const desc = true
    const url = `${host}/did/search/`;
    let pageIndex = 0
    let results = [];

    console.log(`start searching, page count: ${pageCount}, limit: ${limit}:`);

    while (pageIndex++ < pageCount) {

        const requestBody = {
            prefix: id_prefix,
            startTime,
            endTime,
            order: desc ? "desc" : "asc",
            limit: limit
        };

        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: token
            },
            body: JSON.stringify(requestBody)
        });

        const result = await res.json();

        if (!res.ok) {
            throw new Error(`searching failed, HTTP status: ${result.code}, message: ${result.message}`);
        }

        // Output query result to console
        console.log(`=====================page ${pageIndex}===========================`);
        console.log(`searching filter: `, JSON.stringify(requestBody, null, 2));
        console.log(`value: `, JSON.stringify(result.value, null, 2));
        console.log(`bookmark: ${result.bookmark}`);

        results.push(...result.value??[]);

        const bookmark = result.bookmark;
        if (bookmark == null || bookmark === '') {
            break;
        }

        const nextFilterTime = bookmark?.split(":").pop()
        if (desc) {
            endTime = nextFilterTime
        } else {
            startTime = nextFilterTime
        }
    }

    console.log(`found: ${results.length}`);

    return results;
}

let localData = [];
// call create
async function testCreate(createCount) {
    let createIndex = 0

    while (createIndex++ < createCount) {
        await usageCreate(host, `Bearer ${token}`)
            .then((res) => {
                console.log(`${createIndex} creation finished`)
                localData.push(res)
            })
            .catch((err) => {
                console.error("creation error:", err)
                throw err;
            });

        await sleep(50);
    }
}

let searchedData = [];
// call search
async function testSearch() {
    await usageSearch(host, `Bearer ${token}`, 20, 50)
        .then((data) => {
            console.log("search complete")
            searchedData = data;
        })
        .catch((err) => {
            console.error("search error:", err)
            throw err;
        });
}

function valid() {

    console.log(`compare localData with remoteData:`);
    console.log(`localData count: ${localData.length}`);
    console.log(`searched count: ${searchedData.length}`);

    function getSearchedIDByKey(arr, targetId) {
        return arr.find(item => item.id === targetId)
    }

    let notFoundIds = []
    let equalCount = 0;
    localData.forEach((item) => {
        const remoteID = getSearchedIDByKey(searchedData, item.id);
        if (!remoteID) {
            console.error(`ID ${item.id} not found`);
            notFoundIds.push(item.id)
        }

        equalCount += arrayFullyEqual(item, remoteID) ? 1 : 0
    })

    console.log("compare local data with remote data: ", equalCount == localData.length);

    if (equalCount != localData.length) {
        console.error(`not found count: ${notFoundIds.length}, ids: ${notFoundIds}`)
    }
}

/**
 * Deep compare two values, support array containing nested json-like objects
 * @param {any} valA
 * @param {any} valB
 * @returns {boolean} true if fully identical
 */
function deepMatch(valA, valB) {
    // Primitive type strict equal
    if (valA === valB) return true;

    // One side is null/undefined or not object type
    if (valA == null || typeof valA !== 'object' || valB == null || typeof valB !== 'object') {
        return false;
    }

    // Distinguish Array vs plain Object
    const aIsArr = Array.isArray(valA);
    const bIsArr = Array.isArray(valB);
    if (aIsArr !== bIsArr) return false;

    // Compare array elements one by one (order sensitive)
    if (aIsArr && bIsArr) {
        if (valA.length !== valB.length) return false;
        for (let i = 0; i < valA.length; i++) {
            if (!deepMatch(valA[i], valB[i])) return false;
        }
        return true;
    }

    // Compare plain json-like objects
    const keysA = Object.keys(valA).sort();
    const keysB = Object.keys(valB).sort();
    // Different key count
    if (!deepMatch(keysA, keysB)) return false;
    // Recursively check each property value
    for (const key of keysA) {
        if (!deepMatch(valA[key], valB[key])) return false;
    }
    return true;
}

/**
 * Check two arrays with object/json items are completely equal
 * @param {Array} arr1
 * @param {Array} arr2
 * @returns {boolean}
 */
function arrayFullyEqual(arr1, arr2) {
    return deepMatch(arr1, arr2);
}

// Start
if (token === '' || host === '') {
    throw new Error('host and token are required');
}

await testCreate(100)
await sleep(5000); // wait tx to be flushed into KV storage.
await testSearch()
valid()
