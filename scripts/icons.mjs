#!/usr/bin/env node
// 图标工具：从 lucide-static 拷贝图标 + 扫 assets 生成 Icon 的 typed registry
// 用法：
//   node scripts/icons.mjs add <lucide-name...>   拷贝指定 lucide 图标并重生成
//   node scripts/icons.mjs                        仅按当前 assets/icons 重生成
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readdirSync,
    writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');
const assetsDir = join(repoRoot, 'src', 'assets', 'icons');
const lucideDir = join(repoRoot, 'node_modules', 'lucide-static', 'icons');
const outFile = join(repoRoot, 'src', 'components', 'ui', 'icons.generated.ts');

function ensureDir(dir) {
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
}

// kebab-case → PascalCase（生成 import 标识符）
function pascalCase(name) {
    return name
        .split('-')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
}

function add(names, force) {
    ensureDir(assetsDir);
    for (const name of names) {
        const src = join(lucideDir, `${name}.svg`);
        if (!existsSync(src)) {
            console.error(`✗ lucide 图标不存在: ${name}`);
            process.exitCode = 1;
            continue;
        }
        const dest = join(assetsDir, `${name}.svg`);
        // 覆盖保护：已存在的图标可能被自绘/改过（如实心 play），不被 lucide 原版悄悄冲掉
        if (existsSync(dest) && !force) {
            console.log(`• 跳过已存在 ${name}.svg（要覆盖加 --force）`);
            continue;
        }
        copyFileSync(src, dest);
        console.log(`✓ 拷贝 ${name}.svg`);
    }
}

function generate() {
    ensureDir(assetsDir);
    const names = readdirSync(assetsDir)
        .filter(file => file.endsWith('.svg'))
        .map(file => basename(file, '.svg'))
        .sort();

    const imports = names
        .map(
            name =>
                `import ${pascalCase(name)}Icon from '@/assets/icons/${name}.svg';`,
        )
        .join('\n');
    const union = names.length
        ? names.map(name => `    | '${name}'`).join('\n')
        : '    never';
    const entries = names
        .map(name => `    '${name}': ${pascalCase(name)}Icon,`)
        .join('\n');

    const content = `// 由 scripts/icons.mjs 生成，请勿手改（增删图标改这里跑一次脚本）
import type { FC } from 'react';
import type { SvgProps } from 'react-native-svg';

${imports}

export type IconName =
${union};

export const iconMap: Record<IconName, FC<SvgProps>> = {
${entries}
};
`;
    writeFileSync(outFile, content);
    console.log(`✓ 生成 ${names.length} 个图标 → icons.generated.ts`);
}

const [, , cmd, ...rest] = process.argv;
if (cmd === 'add') {
    const force = rest.includes('--force');
    add(
        rest.filter(arg => arg !== '--force'),
        force,
    );
}
generate();
