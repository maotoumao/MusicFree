module.exports = {
    preset: '@react-native/jest-preset',
    // 预设只放行 `react-native/`、`@react-native*`；下列包发 ESM 源码，需一并转译
    // react-native-url-polyfill：utils/url 的 WHATWG 解析器；uuid：备份临时文件名
    transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-url-polyfill|uuid)/)',
    ],
};
