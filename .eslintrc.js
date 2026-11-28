module.exports = {
    root: true,
    extends: '@react-native',
    plugins: ['import'],
    // 生成文件（如 icons.generated.ts）只受 tsc/depcruise 约束，不进 eslint
    ignorePatterns: ['*.generated.ts'],
    rules: {
        // import 分组排序：内置 → 第三方 → @/ 内部 → 相对，组间空行 + 组内字母序
        'import/order': [
            'error',
            {
                groups: [
                    'builtin',
                    'external',
                    'internal',
                    'parent',
                    'sibling',
                    'index',
                    'type',
                ],
                pathGroups: [{ pattern: '@/**', group: 'internal' }],
                pathGroupsExcludedImportTypes: ['type'],
                'newlines-between': 'always',
                alphabetize: { order: 'asc', caseInsensitive: true },
            },
        ],
        // 同源重复 import 合并（value import 与 import type 拆两条不算重复）
        'import/no-duplicates': 'error',
        // 禁冗余路径段（./../ 归一化、多余 /index），补 no-restricted-imports 的归一化盲区
        'import/no-useless-path-segments': ['error', { noUselessIndex: true }],
        // 禁止 ../../ 及更深的相对路径，跨模块一律走 @/ 别名
        'no-restricted-imports': [
            'error',
            {
                patterns: [
                    {
                        group: ['../../**'],
                        message:
                            '禁止深层相对路径（../../ 及更深），跨模块请用 @/ 别名',
                    },
                ],
            },
        ],
    },
    overrides: [
        {
            // Node 构建脚本（ESM）：允许 import.meta / 顶层 import
            files: ['scripts/**/*.mjs'],
            env: { node: true },
            parserOptions: { sourceType: 'module', ecmaVersion: 2022 },
        },
    ],
};
