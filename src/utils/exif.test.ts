/* eslint-disable no-bitwise -- 构造字节序列需要位运算 */
import { orientationTransform, readExifOrientation } from './exif';

/** 拼一张只有 SOI + APP1(EXIF) 的最小 JPEG 头 */
function jpegWithOrientation(
    orientation: number,
    options?: {
        littleEndian?: boolean;
        extraTagBefore?: boolean;
        orientationCount?: number;
    },
): Uint8Array {
    const littleEndian = options?.littleEndian ?? true;
    const entries = options?.extraTagBefore ? 2 : 1;
    const tiff: number[] = [];
    const u16 = (value: number) =>
        littleEndian
            ? [value & 0xff, (value >> 8) & 0xff]
            : [(value >> 8) & 0xff, value & 0xff];
    const u32 = (value: number) =>
        littleEndian
            ? [
                  value & 0xff,
                  (value >> 8) & 0xff,
                  (value >> 16) & 0xff,
                  (value >> 24) & 0xff,
              ]
            : [
                  (value >> 24) & 0xff,
                  (value >> 16) & 0xff,
                  (value >> 8) & 0xff,
                  value & 0xff,
              ];
    tiff.push(...(littleEndian ? [0x49, 0x49] : [0x4d, 0x4d]));
    tiff.push(...u16(0x2a));
    tiff.push(...u32(8));
    tiff.push(...u16(entries));
    if (options?.extraTagBefore) {
        // 一个无关标签，确认解析会继续往后找而不是只看第一条
        tiff.push(...u16(0x010e), ...u16(2), ...u32(1), ...u32(0));
    }
    tiff.push(
        ...u16(0x0112),
        ...u16(3),
        ...u32(options?.orientationCount ?? 1),
        ...u16(orientation),
        0,
        0,
    );
    tiff.push(...u32(0));

    const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
    const length = payload.length + 2;
    return new Uint8Array([
        0xff,
        0xd8,
        0xff,
        0xe1,
        (length >> 8) & 0xff,
        length & 0xff,
        ...payload,
    ]);
}

describe('readExifOrientation', () => {
    it.each([1, 3, 6, 8])('读出小端 EXIF 的 orientation %s', orientation => {
        expect(readExifOrientation(jpegWithOrientation(orientation))).toBe(
            orientation,
        );
    });

    it('读出大端 EXIF 的 orientation', () => {
        expect(
            readExifOrientation(
                jpegWithOrientation(6, { littleEndian: false }),
            ),
        ).toBe(6);
    });

    it('跳过 orientation 之前的其他标签', () => {
        expect(
            readExifOrientation(
                jpegWithOrientation(8, { extraTagBefore: true }),
            ),
        ).toBe(8);
    });

    it.each([
        ['空输入', new Uint8Array()],
        ['非 JPEG', new Uint8Array([0x89, 0x50, 0x4e, 0x47])],
        ['无 EXIF 段的 JPEG', new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0, 4])],
        ['APP1 头被截断', jpegWithOrientation(6).subarray(0, 12)],
    ])('异常输入回落正立 %s', (_label, bytes) => {
        expect(readExifOrientation(bytes)).toBe(1);
    });

    it('越界的 orientation 值回落正立', () => {
        expect(readExifOrientation(jpegWithOrientation(9))).toBe(1);
    });
});

describe('orientationTransform', () => {
    it.each([
        [1, 0, false],
        [2, 0, true],
        [3, 180, false],
        [4, 180, true],
        [5, 270, true],
        [6, 90, false],
        [7, 90, true],
        [8, 270, false],
    ])(
        'orientation %s 分解为旋转 %s、镜像 %s',
        (orientation, rotation, mirrored) => {
            expect(orientationTransform(orientation)).toEqual({
                rotation,
                mirrored,
            });
        },
    );

    it('越界值按正立处理', () => {
        expect(orientationTransform(0)).toEqual({
            rotation: 0,
            mirrored: false,
        });
    });
});

describe('解析边界', () => {
    it('跳过标记前的 0xFF 填充字节', () => {
        const normal = jpegWithOrientation(6);
        // FF D8 之后插一个合法的填充字节：FF D8 FF FF E1 ...
        const padded = new Uint8Array(normal.length + 1);
        padded.set(normal.subarray(0, 2), 0);
        padded[2] = 0xff;
        padded.set(normal.subarray(2), 3);

        expect(readExifOrientation(padded)).toBe(6);
    });

    it('count 不为 1 的 orientation 字段不采信', () => {
        expect(
            readExifOrientation(
                jpegWithOrientation(6, { orientationCount: 2 }),
            ),
        ).toBe(1);
    });
});
