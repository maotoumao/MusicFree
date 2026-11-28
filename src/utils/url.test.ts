import { httpHostOf, looksLikeHttpUrl, normalizeHttpUrl } from './url';

describe('normalizeHttpUrl', () => {
    it('首尾空白与任意位置的换行 / 零宽字符 / BOM 去掉，返回可直接请求的 href', () => {
        expect(normalizeHttpUrl('  https://a.com/plugin.js\n')).toBe(
            'https://a.com/plugin.js',
        );
        // 聊天软件里折行的地址
        expect(normalizeHttpUrl('https://a.com/pl\nugin.js')).toBe(
            'https://a.com/plugin.js',
        );
        expect(normalizeHttpUrl('https://a.com/p\u200b.json')).toBe(
            'https://a.com/p.json',
        );
        expect(normalizeHttpUrl('\uFEFFhttps://a.com/x\u2060.js')).toBe(
            'https://a.com/x.js',
        );
    });

    it('串内空格不删：交给 WHATWG 编码成 %20，已编码的 %20 原样保留', () => {
        expect(normalizeHttpUrl('https://a.com/my plugin.js')).toBe(
            'https://a.com/my%20plugin.js',
        );
        expect(normalizeHttpUrl('https://a.com/a%20b.js?q=x%20y')).toBe(
            'https://a.com/a%20b.js?q=x%20y',
        );
    });

    it('非 http(s) / 无主机 / 不成地址 → undefined', () => {
        expect(normalizeHttpUrl('file:///sdcard/p.js')).toBeUndefined();
        expect(normalizeHttpUrl('https://')).toBeUndefined();
        expect(normalizeHttpUrl('plugin.js')).toBeUndefined();
        expect(normalizeHttpUrl('')).toBeUndefined();
        // 主机里的空格是 WHATWG 的禁用码点，不该被「修好」
        expect(normalizeHttpUrl('https://exa mple.com/x')).toBeUndefined();
    });

    it('query 保留、fragment 去掉（不发给服务器，且会让拼接的 query 落进 # 后面）', () => {
        expect(normalizeHttpUrl('https://a.com/p.js?v=1#x')).toBe(
            'https://a.com/p.js?v=1',
        );
    });
});

describe('looksLikeHttpUrl / httpHostOf 只 trim、不去噪（调用方拿原串去请求）', () => {
    it('首尾空白容忍；主机里夹空格是禁用码点、不被「修好」', () => {
        expect(looksLikeHttpUrl('  https://a.com/x.js  ')).toBe(true);
        expect(looksLikeHttpUrl('https://exa mple.com/x')).toBe(false);
        expect(looksLikeHttpUrl('not a url')).toBe(false);
    });

    it('串内换行是 WHATWG 自己剥掉的（这正是「校验过、请求挂」的来源），校验器不额外收紧', () => {
        expect(looksLikeHttpUrl('https://a.com/pl\nugin.js')).toBe(true);
    });

    it('主机不含内嵌凭据', () => {
        expect(httpHostOf('https://user:pw@a.com:8443/x')).toBe('a.com:8443');
    });
});
