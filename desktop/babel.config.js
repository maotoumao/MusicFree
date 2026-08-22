const path = require('path');

module.exports = {
    presets: [
        ['@babel/preset-env', { targets: { chrome: '120' } }],
        ['@babel/preset-react', { runtime: 'automatic' }],
        ['@babel/preset-typescript', { allowDeclareFields: true }],
    ],
    plugins: [
        // 注意:不使用 module-resolver 重写 @/ 路径。
        // babel 阶段的重写会让 webpack alias('@/native/*$' 等 shim)失效,
        // 模块解析统一交给 webpack(见 webpack.config.js 的 alias['@/'])。
        'react-native-reanimated/plugin',
    ],
};
