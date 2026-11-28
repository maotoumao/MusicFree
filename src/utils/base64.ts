/* eslint-disable no-bitwise -- base64 解码本质是位拼接 */
/** base64 解码：RN 没有 atob / Buffer，二进制过桥又只能走 base64，故自带一份 */

const ALPHABET =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** 字符 → 6 位值；非字母表字符（含换行与填充）映射为 -1 */
const VALUES = buildValueTable();

function buildValueTable(): Int8Array {
    const table = new Int8Array(128).fill(-1);
    for (let index = 0; index < ALPHABET.length; index += 1) {
        table[ALPHABET.charCodeAt(index)] = index;
    }
    return table;
}

/** 允许出现在 base64 文本里的空白：换行由分块编码器插入 */
const WHITESPACE = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20]);
const PADDING = 0x3d;

/**
 * 解码 base64 文本为字节
 *
 * 只放行空白；遇填充符即结束；其余非法字符抛错——静默跳过会破坏 quantum 边界，
 * 把损坏的输入解成一串看似合理的字节，比直接失败更难查。
 * 末尾不足一组的残片按已凑齐的位数丢弃，故截断的输入仍能解出前缀。
 */
function decodeBase64(text: string): Uint8Array {
    const bytes = new Uint8Array((text.length >> 2) * 3 + 2);
    let length = 0;
    let buffer = 0;
    let bits = 0;
    for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index);
        if (code === PADDING) {
            break;
        }
        if (WHITESPACE.has(code)) {
            continue;
        }
        const value = code < 128 ? VALUES[code]! : -1;
        if (value < 0) {
            throw new RangeError(`base64 含非法字符：${text[index]}`);
        }
        buffer = (buffer << 6) | value;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            bytes[length] = (buffer >> bits) & 0xff;
            length += 1;
        }
    }
    return bytes.subarray(0, length);
}

export { decodeBase64 };
