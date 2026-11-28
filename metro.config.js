// 用 expo/metro-config（解析 expo 虚拟入口 .expo/.virtual-metro-entry，用 expo 模块必需）
const { getDefaultConfig } = require('expo/metro-config');

/**
 * Metro configuration
 * https://docs.expo.dev/guides/customizing-metro/
 */
const config = getDefaultConfig(__dirname);

// SVG 作源码模块：react-native-svg-transformer 把 .svg 编译成 RN 组件（图标体系用）
// 用 /expo 预设与上面的 expo/metro-config 链路对齐
config.transformer.babelTransformerPath = require.resolve(
    'react-native-svg-transformer/expo',
);
config.resolver.assetExts = config.resolver.assetExts.filter(
    ext => ext !== 'svg',
);
config.resolver.sourceExts = [...config.resolver.sourceExts, 'svg'];

// 链式：先走 expo 解析器（含虚拟入口），再叠加 dev 剔除
// release 包（--dev false）把 src/dev/ 诊断代码换成空模块，物理剔除出 bundle
const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
    const resolve = upstreamResolveRequest ?? context.resolveRequest;
    const resolved = resolve(context, moduleName, platform);
    if (
        !context.dev &&
        resolved.type === 'sourceFile' &&
        resolved.filePath.replace(/\\/g, '/').includes('/src/dev/')
    ) {
        return { type: 'empty' };
    }
    return resolved;
};

module.exports = config;
