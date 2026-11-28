module.exports = {
    // 每个暂存的源文件：eslint 修复 + prettier 格式化（仅作用于暂存文件）
    '*.{ts,tsx,js,jsx}': ['eslint --fix', 'prettier --write'],
    // 触及 TS 时做一次全项目类型检查 + 架构依赖校验（项目级，函数形式不追加文件参数）
    '*.{ts,tsx}': () => ['tsc --noEmit', 'depcruise src'],
};
