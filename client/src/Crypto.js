import { createHmac } from 'crypto';

const sharedSecret = Buffer.from(
    [182, 19, 122, 212, 127, 206, 37, 103,
    54, 152, 168, 175, 98, 176, 158, 20,
    149, 101, 192, 23, 227, 145, 167, 182,
    112, 39, 121, 44, 42, 200, 135, 170], "hex")

/**
 * 生成签名（HMAC-SHA256）
 * @param {number} ts - Unix 时间戳（秒）
 * @param {string} clientID - 客户端 ID
 * @param {Buffer} secret - 密钥（必须为 Buffer，代表原始二进制数据）
 * @returns {string} 签名的十六进制小写字符串
 */
function signature(ts, clientID, secret) {
    const hmac = createHmac('sha256', secret);
    hmac.update(clientID);
    hmac.update(ts.toString());
    return hmac.digest('hex');
}

/**
 * 生成 token：格式为 "时间戳:签名十六进制"
 * @param {string} clientID - 客户端 ID
 * @param {Buffer} secret - 密钥（必须为 Buffer）
 * @returns {string} 生成的 token 字符串
 */
function generateToken(clientID, secret) {
    const ts = Math.floor(Date.now() / 1000); // 转换为秒级 Unix 时间戳
    const sig = signature(ts, clientID, secret);
    return `${ts}:${sig}`;
}

function generateRandomString(length = 8) {
    if (length <= 0 || !Number.isInteger(length)) {
        throw new Error('长度必须是正整数');
    }

    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    let result = '';
    const charsLength = chars.length;

    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * charsLength);
        result += chars.charAt(randomIndex);
    }
    return result;
}

export {
    generateToken,
    sharedSecret,
    signature,
    generateRandomString
};