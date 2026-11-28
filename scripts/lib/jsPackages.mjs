// JS 侧的依赖采集：以 Metro 打包产物为准
//
// **不能用 `npm ls` 的安装树**：react-native 与 expo 把 metro、@babel/*、typescript
// 这类构建工具列为自己的 dependencies，它们在「生产依赖闭包」里却根本进不了 App
// （实测安装树 787 个包，真正打进 bundle 的只有 140 个）
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** 两个平台各打一次：Platform.select 与 .android/.ios 后缀会让模块图不同 */
const PLATFORMS = ['android', 'ios'];

/**
 * 从一份 sourcemap 里取出所有来自 node_modules 的包
 *
 * 记的是**包目录**而不只是包名：npm 会把版本冲突的依赖装进嵌套的 node_modules
 * （如 parse5/node_modules/entities），只按包名去重会与根目录的同名包合并，读出错版本
 */
function packagesFromSourceMap(mapPath, repoRoot, found) {
    const map = JSON.parse(readFileSync(mapPath, 'utf8'));
    for (const source of map.sources ?? []) {
        const normalized = source.replace(/\\/g, '/');
        const index = normalized.lastIndexOf('node_modules/');
        if (index < 0) {
            continue;
        }
        const rest = normalized
            .slice(index + 'node_modules/'.length)
            .split('/');
        // scoped 包名占两段
        const segments = rest[0]?.startsWith('@')
            ? rest.slice(0, 2)
            : rest.slice(0, 1);
        const name = segments.filter(Boolean).join('/');
        if (!name) {
            continue;
        }
        // sourcemap 里的路径绝对、相对都可能，统一解析成绝对目录
        const dir = resolve(
            repoRoot,
            normalized.slice(0, index + 'node_modules/'.length) + name,
        );
        found.set(dir, name);
    }
    return found;
}

/** 打两次 release bundle，返回真正进了产物的包：包目录 → 包名 */
export function collectJsPackages({ repoRoot, workDir }) {
    const packages = new Map();
    for (const platform of PLATFORMS) {
        const mapPath = join(workDir, `${platform}.map`);
        console.log(`· 正在打包 ${platform}（这一步比较慢）…`);
        execFileSync(
            process.execPath,
            [
                join(repoRoot, 'node_modules', 'react-native', 'cli.js'),
                'bundle',
                '--platform',
                platform,
                '--dev',
                'false',
                '--entry-file',
                'index.js',
                '--bundle-output',
                join(workDir, `${platform}.bundle`),
                '--sourcemap-output',
                mapPath,
            ],
            { cwd: repoRoot, stdio: ['ignore', 'ignore', 'inherit'] },
        );
        packagesFromSourceMap(mapPath, repoRoot, packages);
    }
    return packages;
}
