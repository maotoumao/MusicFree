/**
 * 目录包含关系：段边界与根目录两处边角是「排除目录静默失效」的历史来源
 */
import {
    filePathKey,
    isAtOrUnderDir,
    isSameFilePath,
    isUnderDir,
    normalizeAbsoluteDir,
    stripFileScheme,
    stripTrailingSlash,
} from './path';

describe('isUnderDir', () => {
    it('落在目录之内', () => {
        expect(isUnderDir('/a/b/c.mp3', '/a/b')).toBe(true);
    });

    it('按段边界比对：/Music 不误命中 /MusicBackup', () => {
        expect(isUnderDir('/a/MusicBackup/c.mp3', '/a/Music')).toBe(false);
    });

    it('目录自身不算「之内」', () => {
        expect(isUnderDir('/a/b', '/a/b')).toBe(false);
    });

    it('根目录：任何绝对路径都在其内（拼前缀不能拼出 //）', () => {
        expect(isUnderDir('/a/b.mp3', '/')).toBe(true);
    });
});

describe('isAtOrUnderDir', () => {
    it('等于目录也算', () => {
        expect(isAtOrUnderDir('/a/b', '/a/b')).toBe(true);
    });

    it('段边界同样守住', () => {
        expect(isAtOrUnderDir('/a/MusicBackup', '/a/Music')).toBe(false);
    });

    it('根目录盖住一切', () => {
        expect(isAtOrUnderDir('/storage/emulated/0', '/')).toBe(true);
    });
});

describe('stripTrailingSlash', () => {
    it('去掉尾斜杠', () => {
        expect(stripTrailingSlash('/a/b/')).toBe('/a/b');
    });

    it('多个尾斜杠一并去掉', () => {
        expect(stripTrailingSlash('/a/b///')).toBe('/a/b');
    });

    it('根目录原样保留（去掉就成空串了，那是「谁都在它之下」的万能前缀）', () => {
        expect(stripTrailingSlash('/')).toBe('/');
    });

    it('全是斜杠也回根，不退化成空串（空前缀会匹配一切）', () => {
        expect(stripTrailingSlash('//')).toBe('/');
        expect(stripTrailingSlash('///')).toBe('/');
    });

    it('没有尾斜杠不动', () => {
        expect(stripTrailingSlash('/a/b')).toBe('/a/b');
    });
});

describe('normalizeAbsoluteDir', () => {
    it('绝对路径去掉尾斜杠与前后空白', () => {
        expect(normalizeAbsoluteDir('/storage/emulated/0/Music')).toBe(
            '/storage/emulated/0/Music',
        );
        expect(normalizeAbsoluteDir('  /storage/x/  ')).toBe('/storage/x');
        expect(normalizeAbsoluteDir('/a/b///')).toBe('/a/b');
    });

    it('不是绝对路径、或没有实际路径段的一律判非法', () => {
        expect(normalizeAbsoluteDir('Music')).toBeNull();
        expect(normalizeAbsoluteDir('')).toBeNull();
        // '/' 与 '//' 当目录前缀是「谁都在它之下」的万能匹配，不能算合法目录
        expect(normalizeAbsoluteDir('/')).toBeNull();
        expect(normalizeAbsoluteDir('//')).toBeNull();
    });
});

describe('stripFileScheme & isSameFilePath (#674)', () => {
    it('仅剥离 file:// 前缀而不盲目百分号解码，保留 100%25.mp3 等真实文件名', () => {
        expect(
            stripFileScheme('file:///storage/emulated/0/Music/100%25.mp3'),
        ).toBe('/storage/emulated/0/Music/100%25.mp3');
        expect(
            stripFileScheme('file:///storage/emulated/0/Music/100%.mp3'),
        ).toBe('/storage/emulated/0/Music/100%.mp3');
        expect(stripFileScheme('/storage/emulated/0/Music/a.mp3')).toBe(
            '/storage/emulated/0/Music/a.mp3',
        );
    });

    it('对齐 /sdcard 等 Android 主存储别名且严格守住段边界', () => {
        expect(
            isSameFilePath(
                '/sdcard/Music/中文 #100%.mp3',
                '/storage/emulated/0/Music/中文 #100%.mp3',
            ),
        ).toBe(true);
        expect(
            isSameFilePath(
                'file:///sdcard/Music/a.mp3',
                '/storage/emulated/0/Music/a.mp3',
            ),
        ).toBe(true);
        expect(
            isSameFilePath(
                '/sdcard2/Music/a.mp3',
                '/storage/emulated/0/Music/a.mp3',
            ),
        ).toBe(false);
        expect(filePathKey('/mnt/sdcard/Music/a.mp3')).toBe(
            '/storage/emulated/0/Music/a.mp3',
        );
    });
});
