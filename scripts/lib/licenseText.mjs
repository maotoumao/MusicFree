// 许可文本的解析：把一份 LICENSE 原文拆成「版权署名」与「条款本体」，并把
// 五花八门的许可名规范化成 SPDX 标识
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** 许可证正文文件的常见命名 */
const LICENSE_FILE_RE = /^(LICEN[CS]E|COPYING)([-.].*)?$/i;

/**
 * 版权署名的异常阈值：一个包可能有多个持有人，但不至于几十行、单行几百字
 *
 * 超限只当作「解析结果可疑」让生成失败，绝不截断——法律文本被静默截掉一半比生成失败糟得多
 */
export const MAX_COPYRIGHT_LINES = 8;
export const MAX_COPYRIGHT_LENGTH = 200;

/** 判断一行是不是版权署名，而不是协议正文里谈论 copyright 的句子 */
function isCopyrightLine(line) {
    return (
        /^copyright\b/i.test(line) &&
        // 署名必带 (c)／©／年份。少了这一条，ISC 正文里的
        // 「copyright notice and this permission notice appear in all copies.」会被当成署名剥掉
        /\((c|C)\)|©|&copy;|\b\d{4}\b/.test(line) &&
        // CC0 的「Copyright and related rights ... are waived」
        !/^copyright\s+and\b/i.test(line) &&
        // CC-BY 的「... not regulated by the license」
        !/\bwaived\b|\bregulated\b/i.test(line)
    );
}

/** 列表项行：以项目符号或编号起头，合并进上一行会毁掉条款的层次 */
const LIST_LINE_RE = /^\s*([-*•]|\(?[0-9a-z]{1,3}[.)])\s/;

/**
 * 把按 70 列硬折行的许可原文重排成流式段落
 *
 * 原文的换行是给等宽终端排的，直接搬进手机屏幕会被二次折行，
 * 每行都成了「满行 + 短尾」的锯齿。空行仍分段，列表项独立成行
 *
 * 版权署名是**双向硬边界**：它既不并入上一行，下一行也不并入它。
 * 少了后一半，htmlparser2 这类「署名行紧接授权正文、中间没有空行」的原文
 * 会把整段授权条款并进署名行，随后连同署名一起被剥掉
 */
function unwrapParagraphs(lines) {
    const out = [];
    let afterCopyright = false;
    for (const raw of lines) {
        const line = raw.trim();
        const previous = out[out.length - 1];
        const copyright = isCopyrightLine(line);
        if (
            !line ||
            !previous ||
            copyright ||
            afterCopyright ||
            LIST_LINE_RE.test(raw)
        ) {
            out.push(line);
        } else {
            out[out.length - 1] = `${previous} ${line}`;
        }
        afterCopyright = copyright;
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * 前导块的行长上限：标题、版本行、版权署名都很短，条款正文重排后动辄数百字
 *
 * 署名只在前导块里找。越过这个界限再剥，就会把 LGPL 附录里那句填空示例
 * 「Copyright (C) <year> <name of author>」、复合许可中各子许可的署名一并挖走，条款正文就破了
 */
const PREAMBLE_LINE_MAX = 160;

/**
 * 把许可原文拆成「版权署名」与「条款本体」
 *
 * 分开是为了去重：MIT 正文除版权行外逐字相同，剥掉署名后几百个组件只剩几十份本体。
 * 展示时把该组件自己的署名接回本体前面即可
 *
 * 顺序要紧：先重排段落再剥署名。反过来的话，正文里以 copyright 起头的续行会被误当成署名剥掉
 *
 * `keepIntact` 用于 GPL 系这类「许可全文自带 FSF 版权声明」的模板：那行是许可文本
 * 自身的版权，不是使用者的署名，剥出来展示等于张冠李戴
 */
export function splitLicenseText(text, { keepIntact = false } = {}) {
    // 去掉 BOM，否则首行的署名/标题识别全部落空
    const lines = unwrapParagraphs(
        text.replace(/^\uFEFF/, '').split(/\r?\n/),
    ).split('\n');
    const bodyStart = lines.findIndex(
        line => line.length > PREAMBLE_LINE_MAX,
    );
    const limit = keepIntact ? 0 : bodyStart < 0 ? lines.length : bodyStart;
    const copyrights = lines.slice(0, limit).filter(isCopyrightLine);
    const body = lines
        .filter((line, index) => !(index < limit && isCopyrightLine(line)))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    return { copyrights, body };
}

/** 包目录里带的许可文本；上游没放则返回 null，由补录表兜底 */
export function readLicenseParts(packageDir) {
    let entries;
    try {
        entries = readdirSync(packageDir);
    } catch {
        return null;
    }
    const licenseFile = entries.find(entry => LICENSE_FILE_RE.test(entry));
    if (!licenseFile) {
        return null;
    }
    let text;
    try {
        text = readFileSync(join(packageDir, licenseFile), 'utf8');
    } catch {
        return null;
    }
    return splitLicenseText(text);
}

/** 署名解析结果是否可疑，可疑就让生成失败 */
export function isSuspicious(parts) {
    return (
        parts.copyrights.length > MAX_COPYRIGHT_LINES ||
        parts.copyrights.some(line => line.length > MAX_COPYRIGHT_LENGTH)
    );
}

/**
 * Maven POM 里的许可名没有统一写法，同一个 Apache-2.0 能写出六七种花样，
 * 逐一映射到 SPDX 标识。表里没有的一律让生成失败，逼人核对后再加进来
 */
const SPDX_ALIASES = new Map(
    Object.entries({
        'the apache software license, version 2.0': 'Apache-2.0',
        'the apache license, version 2.0': 'Apache-2.0',
        'apache license, version 2.0': 'Apache-2.0',
        'apache license version 2.0': 'Apache-2.0',
        'apache 2.0': 'Apache-2.0',
        'apache-2.0': 'Apache-2.0',
        'apache-2': 'Apache-2.0',
        'the mit license': 'MIT',
        'the mit license (mit)': 'MIT',
        'mit license': 'MIT',
        mit: 'MIT',
        'bsd-3-clause': 'BSD-3-Clause',
        'bsd 3-clause license': 'BSD-3-Clause',
        // 「BSD License」看不出是 2、3 还是 4 条款，不设通用别名：
        // 这么写的包（如 Bolts）走 maven 补录表按坐标定，免得日后新依赖蒙混过关
        'bsd-2-clause': 'BSD-2-Clause',
        'bsd 2-clause license': 'BSD-2-Clause',
        'simplified bsd license': 'BSD-2-Clause',
    }),
);

/** 规范化单个许可名；认不出返回 null */
export function toSpdx(name) {
    return (
        SPDX_ALIASES.get(name.trim().toLowerCase().replace(/\s+/g, ' ')) ?? null
    );
}
