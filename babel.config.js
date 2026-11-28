module.exports = {
    // babel-preset-expo 内含 @react-native/babel-preset（expo 模块 + 虚拟入口需要）
    presets: ['babel-preset-expo'],
    plugins: [
        // 路径别名 @/* → src/*（与 tsconfig paths 对齐）
        [
            'module-resolver',
            {
                alias: {
                    '^@/(.+)': './src/\\1',
                },
            },
        ],
        // worklets 插件必须放最后
        'react-native-worklets/plugin',
    ],
};
