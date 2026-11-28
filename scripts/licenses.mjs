#!/usr/bin/env node
// 第三方开源许可清单：生成 src/utils/thirdPartyLicenses.generated.ts
//
// 用法：
//   npm run licenses      采集 JS 与 Android，重写生成物
//   npm run licenses:js   只校验 JS 侧，不改动生成物
//
// 覆盖范围：打进产物的 JS 包（Metro sourcemap）与 Android release 运行时闭包（Gradle）。
// iOS 的 CocoaPods 闭包尚未覆盖，需要 macOS 环境。
//
// 上游没随包分发许可文本时，由 scripts/licenseOverrides.json 人工补录；
// 两处都找不到就让生成失败，宁可挡住构建也不发布只有标识、没有条款的清单。
import { mkdirSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectAndroidArtifacts } from './lib/androidPackages.mjs';
import { collectJsPackages } from './lib/jsPackages.mjs';
import {
    isSuspicious,
    readLicenseParts,
    splitLicenseText,
    toSpdx,
} from './lib/licenseText.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');
const outFile = join(
    repoRoot,
    'src',
    'utils',
    'thirdPartyLicenses.generated.ts',
);
const workDir = join(repoRoot, 'tmp', 'licenses-scan');
const skipAndroid = process.argv.includes('--skip-android');

const overrides = JSON.parse(
    readFileSync(join(scriptDir, 'licenseOverrides.json'), 'utf8'),
);

/** package.json 的 license 字段有对象与数组两种历史写法 */
function readNpmLicenseId(manifest) {
    if (typeof manifest.license === 'string') {
        return manifest.license;
    }
    if (manifest.license && typeof manifest.license.type === 'string') {
        return manifest.license.type;
    }
    if (Array.isArray(manifest.licenses)) {
        return manifest.licenses
            .map(item => item?.type)
            .filter(Boolean)
            .join(' OR ');
    }
    return '';
}

/** 补录表里的条目；maven 的键先精确匹配 group:name，再按 group 兜底 */
function overrideEntryFor(ecosystem, key, group) {
    const table = overrides[ecosystem];
    const textKey = table?.[key] ?? (group ? table?.[group] : undefined);
    return textKey ? overrides.texts[textKey] : undefined;
}

// ── 采集 ────────────────────────────────────────────────────────────────
mkdirSync(workDir, { recursive: true });
let jsPackages;
let androidArtifacts = [];
try {
    jsPackages = collectJsPackages({ repoRoot, workDir });
    if (!skipAndroid) {
        androidArtifacts = collectAndroidArtifacts({ repoRoot, workDir });
    }
} finally {
    rmSync(workDir, { recursive: true, force: true });
}

// ── 归一 ────────────────────────────────────────────────────────────────
const entries = [];
/** 定位不到的包 */
const missing = [];
/** 找不到许可标识的包 */
const unknownLicense = [];
/** 包里与补录表里都找不到许可文本的包 */
const missingText = [];
/** 署名解析结果可疑（行数或长度异常）的包 */
const suspicious = [];
/** 读 artifact 里的 NOTICE 时出错的包——静默丢 NOTICE 就违反了 Apache-2.0 §4(d) */
const unreadable = [];
/** 条款本体去重表：本体文本 → 下标 */
const bodyIndexes = new Map();
const bodies = [];

function indexBody(body) {
    let index = bodyIndexes.get(body);
    if (index === undefined) {
        index = bodies.length;
        bodyIndexes.set(body, index);
        bodies.push(body);
    }
    return index;
}

function addEntry({ platform, name, version, license, parts, notice }) {
    if (!license) {
        unknownLicense.push(name);
    }
    if (!parts || !parts.body) {
        missingText.push(name);
        return;
    }
    if (isSuspicious(parts)) {
        suspicious.push(name);
    }
    entries.push({
        platform,
        name,
        version,
        license: license || 'UNKNOWN',
        copyrights: parts.copyrights,
        textIndex: indexBody(parts.body),
        notice,
    });
}

// jsPackages 的键是包目录的绝对路径（含嵌套 node_modules），值是包名——同名多版本各算一条
const seenJsPackages = new Set();
for (const [packageDir, name] of jsPackages) {
    const manifestPath = join(packageDir, 'package.json');
    if (!existsSync(manifestPath)) {
        missing.push(name);
        continue;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const version = manifest.version ?? '';
    // 同一版本可能被多个父包各装一份，只登记一次
    const identity = `${name}@${version}`;
    if (seenJsPackages.has(identity)) {
        continue;
    }
    seenJsPackages.add(identity);
    const override = overrideEntryFor('npm', name);
    addEntry({
        platform: 'js',
        name,
        version,
        license: readNpmLicenseId(manifest) || override?.spdx || '',
        parts:
            readLicenseParts(packageDir) ??
            (override ? splitLicenseText(override.text) : null),
    });
}

for (const artifact of androidArtifacts) {
    const coordinate = `${artifact.group}:${artifact.name}`;
    if (artifact.embeddedErrors?.length > 0) {
        unreadable.push(`${coordinate}（${artifact.embeddedErrors.join('；')}）`);
    }
    const spdx = artifact.licenses.map(item => toSpdx(item.name));
    const override = overrideEntryFor('maven', coordinate, artifact.group);
    // POM 的许可名认不出就留空，交给 fail-closed 逼人核对后补进别名表；
    // POM 压根没写 licenses 的（gson、guava、commons-* 等）以补录表的核对结论为准
    const license =
        spdx.length > 0 && spdx.every(Boolean)
            ? spdx.join(' / ')
            : (override?.spdx ?? '');
    // POM 从不带版权署名，只有补录来的原文才拆得出署名。
    // Apache-2.0 不要求逐包保留署名，只要求给一份许可副本，故整族共用标准全文
    const text =
        override?.text ??
        (license === 'Apache-2.0' ? overrides.texts['apache-2.0'].text : null);
    addEntry({
        platform: 'android',
        name: coordinate,
        version: artifact.version,
        license,
        parts: text ? splitLicenseText(text, { keepIntact: override?.keepIntact }) : null,
        // Apache-2.0 §4(d)：上游带了 NOTICE 就必须随分发一起转发。
        // 文件名写法不一（NOTICE / NOTICE.txt / notice.md…），凡是 NOTICE 一律收下
        notice: Object.entries(artifact.embedded ?? {})
            .filter(([key]) => /\/NOTICE(\.\w+)?$/i.test(key))
            .map(([, value]) => value.trim())
            .filter(Boolean)
            .join('\n\n'),
    });
}

// 仓库内 vendored 的 C/C++ 由 CMake 编译进 .so，Gradle 的依赖图里看不到，只能手工登记
for (const item of overrides.native ?? []) {
    const text = overrides.texts[item.text];
    addEntry({
        platform: 'native',
        name: item.name,
        version: item.version,
        license: text?.spdx ?? '',
        parts: text
            ? splitLicenseText(text.text, { keepIntact: text.keepIntact })
            : null,
    });
}

entries.sort(
    (a, b) =>
        a.platform.localeCompare(b.platform) || a.name.localeCompare(b.name),
);

// ── fail-closed ─────────────────────────────────────────────────────────
const problems = [
    [missing, '定位不到'],
    [unknownLicense, '没有可识别的许可标识，请核对后补进 SPDX 别名表'],
    [
        missingText,
        '没有许可条款文本，请核对上游后补进 scripts/licenseOverrides.json',
    ],
    [suspicious, '版权署名解析结果异常，需人工确认'],
    [unreadable, '的 artifact 读不开，无法确认里面有没有 NOTICE'],
];
if (problems.some(([list]) => list.length > 0)) {
    for (const [list, reason] of problems) {
        if (list.length > 0) {
            console.error(`✗ ${list.length} 个包${reason}：`, list.join(', '));
        }
    }
    process.exit(1);
}

const count = platform =>
    entries.filter(item => item.platform === platform).length;

// --skip-android 只是本地快速校验 JS 侧的开关，绝不能拿半份清单覆盖正式生成物
if (skipAndroid) {
    console.log(
        `· --skip-android：已校验 JS 侧 ${count('js')} 个包，未改动生成物`,
    );
    process.exit(0);
}

// 采集链路坏掉时往往表现为「某一类一条不剩」，而不是报错，故显式兜一道
if (count('android') === 0 || count('native') === 0) {
    console.error(
        `✗ Android ${count('android')} 条、原生 ${count('native')} 条，采集链路可能已失效`,
    );
    process.exit(1);
}

// ── 输出 ────────────────────────────────────────────────────────────────
const entriesSource = entries
    .map(
        item =>
            `    ${JSON.stringify({
                platform: item.platform,
                name: item.name,
                version: item.version,
                license: item.license,
                ...(item.copyrights.length > 0
                    ? { copyrights: item.copyrights }
                    : {}),
                textIndex: item.textIndex,
                ...(item.notice ? { notice: item.notice } : {}),
            })},`,
    )
    .join('\n');

const bodiesSource = bodies
    .map(text => `    ${JSON.stringify(text)},`)
    .join('\n');

const content = `// 由 scripts/licenses.mjs 生成，请勿手改（依赖变动后重跑一次脚本）
// 来源：Android 与 iOS 两个 release bundle 的 sourcemap 并集（即真正打进产物的 JS 包）、
// :app 的 Android release 运行时依赖闭包，以及仓库内 vendored 的 C/C++
// 尚未覆盖 iOS 的 CocoaPods 闭包
/** 组件来自哪条分发链路 */
export type LicensePlatform = 'js' | 'android' | 'native';

/** 一个第三方组件的许可信息 */
export interface ThirdPartyLicense {
    platform: LicensePlatform;
    /** JS 包名，或 Android 的 Maven 坐标 group:name */
    name: string;
    version: string;
    /** SPDX 标识；多重许可用 / 分隔 */
    license: string;
    /** 版权署名行，可能有多个持有人；协议本身不含署名（如 Unlicense）时缺省 */
    copyrights?: readonly string[];
    /** 条款本体在 licenseTexts 中的下标 */
    textIndex: number;
    /** 上游随包分发的 NOTICE，Apache-2.0 要求转发 */
    notice?: string;
}

/**
 * 许可条款本体，剥掉了各组件自己的版权署名行
 * MIT、Apache-2.0 这类模板协议的正文逐字相同，故多个组件共用一份（${entries.length} 个组件 → ${bodies.length} 份本体）
 * 展示时把该组件的 copyrights 接回本体前面，即为完整的许可声明
 */
export const licenseTexts: readonly string[] = [
${bodiesSource}
];

/** 随本应用分发的第三方组件许可清单，按来源与名称排序 */
export const thirdPartyLicenses: readonly ThirdPartyLicense[] = [
${entriesSource}
];
`;

writeFileSync(outFile, content, 'utf8');
console.log(
    `✓ JS ${count('js')} 个 / Android ${count('android')} 个 / 原生 ${count('native')} 个 / ${bodies.length} 份条款本体 → src/utils/thirdPartyLicenses.generated.ts`,
);