/* eslint-disable no-bitwise -- EXIF 是字节序敏感的二进制格式 */
/**
 * JPEG EXIF 方向读取
 *
 * 解码器分两派：Glide / SDWebImage（`expo-image` 两端）会应用 EXIF 方向，
 * Skia 的 `MakeImageFromEncoded` 不会。手机竖拍照片常带 orientation 6/8，
 * 交给 Skia 直接烘焙就会躺倒，故绘制前要自己把方向读出来补上。
 *
 * **只覆盖 JPEG。** iPhone 默认的 HEIC 把方向记在 ISO-BMFF 的 `irot`/`imir` 属性里、
 * 不走 JPEG 的 APP1，这里一律返回 1；那类图仍会出现「预览正立、壁纸躺倒」，
 * 且画幅未交换会连带算错取景。
 */

/** EXIF orientation，1–8；读不到或不是 JPEG 一律按 1（正立、无变换） */
const DEFAULT_ORIENTATION = 1;

const MARKER_PREFIX = 0xff;
const MARKER_SOI = 0xd8;
const MARKER_APP1 = 0xe1;
const MARKER_SOS = 0xda;
const MARKER_EOI = 0xd9;
/** 无长度字段的独立标记：TEM 与 RST0–RST7 */
const MARKER_TEM = 0x01;
const MARKER_RST_FIRST = 0xd0;
const MARKER_RST_LAST = 0xd7;

const EXIF_SIGNATURE = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00] as const;
const TIFF_LITTLE_ENDIAN = 0x4949;
const TIFF_BIG_ENDIAN = 0x4d4d;
const TIFF_MAGIC = 0x2a;
const TAG_ORIENTATION = 0x0112;
const TYPE_SHORT = 3;
const IFD_ENTRY_SIZE = 12;
const MIN_ORIENTATION = 1;
const MAX_ORIENTATION = 8;

/** 从 JPEG 编码字节里读 EXIF orientation；非 JPEG、无 EXIF、格式异常都返回 1 */
function readExifOrientation(bytes: Uint8Array): number {
    if (
        bytes.length < 4 ||
        bytes[0] !== MARKER_PREFIX ||
        bytes[1] !== MARKER_SOI
    ) {
        return DEFAULT_ORIENTATION;
    }
    let offset = 2;
    while (offset + 4 <= bytes.length) {
        if (bytes[offset] !== MARKER_PREFIX) {
            return DEFAULT_ORIENTATION;
        }
        // 规范允许标记前有任意多个 0xFF 填充字节，逐个跳过再取标记码
        let code = offset + 1;
        while (bytes[code] === MARKER_PREFIX) {
            code += 1;
        }
        if (code + 3 > bytes.length) {
            return DEFAULT_ORIENTATION;
        }
        offset = code - 1;
        const marker = bytes[offset + 1]!;
        if (
            marker === MARKER_SOI ||
            marker === MARKER_TEM ||
            (marker >= MARKER_RST_FIRST && marker <= MARKER_RST_LAST)
        ) {
            offset += 2;
            continue;
        }
        // 扫描数据之后不再有 APP 段，没找到就是没有
        if (marker === MARKER_SOS || marker === MARKER_EOI) {
            return DEFAULT_ORIENTATION;
        }
        const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
        if (length < 2) {
            return DEFAULT_ORIENTATION;
        }
        if (marker === MARKER_APP1 && hasExifSignature(bytes, offset + 4)) {
            // 段外字节不属于这段 EXIF，越界读到的是别的段甚至扫描数据
            return readOrientationFromTiff(
                bytes,
                offset + 10,
                Math.min(bytes.length, offset + 2 + length),
            );
        }
        offset += 2 + length;
    }
    return DEFAULT_ORIENTATION;
}

function hasExifSignature(bytes: Uint8Array, offset: number): boolean {
    return EXIF_SIGNATURE.every(
        (byte, index) => bytes[offset + index] === byte,
    );
}

/**
 * @param tiff TIFF header 起始下标；其内所有偏移都相对于它
 * @param end 本 APP1 段的结束下标（不含），所有读取都不得越过
 */
function readOrientationFromTiff(
    bytes: Uint8Array,
    tiff: number,
    end: number,
): number {
    if (tiff + 8 > end) {
        return DEFAULT_ORIENTATION;
    }
    const byteOrder = (bytes[tiff]! << 8) | bytes[tiff + 1]!;
    if (byteOrder !== TIFF_LITTLE_ENDIAN && byteOrder !== TIFF_BIG_ENDIAN) {
        return DEFAULT_ORIENTATION;
    }
    const littleEndian = byteOrder === TIFF_LITTLE_ENDIAN;
    if (readUint16(bytes, tiff + 2, littleEndian) !== TIFF_MAGIC) {
        return DEFAULT_ORIENTATION;
    }
    const ifd = tiff + readUint32(bytes, tiff + 4, littleEndian);
    if (ifd < tiff || ifd + 2 > end) {
        return DEFAULT_ORIENTATION;
    }
    const count = readUint16(bytes, ifd, littleEndian);
    for (let index = 0; index < count; index += 1) {
        const entry = ifd + 2 + index * IFD_ENTRY_SIZE;
        if (entry + IFD_ENTRY_SIZE > end) {
            return DEFAULT_ORIENTATION;
        }
        if (
            readUint16(bytes, entry, littleEndian) === TAG_ORIENTATION &&
            readUint16(bytes, entry + 2, littleEndian) === TYPE_SHORT &&
            readUint32(bytes, entry + 4, littleEndian) === 1
        ) {
            // SHORT 只占 4 字节值域的前两字节，大端时也是靠前
            const value = readUint16(bytes, entry + 8, littleEndian);
            return value >= MIN_ORIENTATION && value <= MAX_ORIENTATION
                ? value
                : DEFAULT_ORIENTATION;
        }
    }
    return DEFAULT_ORIENTATION;
}

function readUint16(
    bytes: Uint8Array,
    offset: number,
    littleEndian: boolean,
): number {
    const first = bytes[offset] ?? 0;
    const second = bytes[offset + 1] ?? 0;
    return littleEndian ? (second << 8) | first : (first << 8) | second;
}

function readUint32(
    bytes: Uint8Array,
    offset: number,
    littleEndian: boolean,
): number {
    const a = bytes[offset] ?? 0;
    const b = bytes[offset + 1] ?? 0;
    const c = bytes[offset + 2] ?? 0;
    const d = bytes[offset + 3] ?? 0;
    return littleEndian
        ? ((d << 24) | (c << 16) | (b << 8) | a) >>> 0
        : ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

/** 把 orientation 分解成「先水平镜像、再顺时针旋转」两步 */
interface OrientationTransform {
    readonly rotation: 0 | 90 | 180 | 270;
    readonly mirrored: boolean;
}

/**
 * EXIF orientation → 变换分解（规范定义即 `rotate(θ) ∘ mirrorH`）
 * 2=镜像；3=180；4=180+镜像（等价于垂直镜像）；5=270+镜像；6=90；7=90+镜像；8=270
 */
function orientationTransform(orientation: number): OrientationTransform {
    switch (orientation) {
        case 2:
            return { rotation: 0, mirrored: true };
        case 3:
            return { rotation: 180, mirrored: false };
        case 4:
            return { rotation: 180, mirrored: true };
        case 5:
            return { rotation: 270, mirrored: true };
        case 6:
            return { rotation: 90, mirrored: false };
        case 7:
            return { rotation: 90, mirrored: true };
        case 8:
            return { rotation: 270, mirrored: false };
        default:
            return { rotation: 0, mirrored: false };
    }
}

export { orientationTransform, readExifOrientation };
export type { OrientationTransform };
