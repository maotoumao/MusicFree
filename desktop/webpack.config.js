/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const projectRoot = path.resolve(__dirname, '..');
const rendererSrc = path.resolve(__dirname, 'src/renderer');
const shims = path.resolve(rendererSrc, 'shims');

// 所有 react-native 原生模块在桌面端替换为等价 shim,保持 src/ 共享代码零修改
const alias = {
    'react-native$': path.resolve(shims, 'react-native.ts'),
    'react-native/Libraries/Image/resolveAssetSource': path.resolve(shims, 'resolve-asset-source.ts'),

    // 播放器
    'react-native-track-player$': path.resolve(shims, 'track-player.ts'),
    // 文件系统
    'react-native-fs$': path.resolve(shims, 'fs.ts'),
    // 存储
    'react-native-mmkv$': path.resolve(shims, 'mmkv.ts'),
    '@react-native-async-storage/async-storage$': path.resolve(shims, 'async-storage.ts'),
    // 系统能力
    'react-native-device-info$': path.resolve(shims, 'device-info.ts'),
    '@react-native-community/netinfo$': path.resolve(shims, 'netinfo.ts'),
    '@react-native-clipboard/clipboard$': path.resolve(shims, 'clipboard.ts'),
    'react-native-permissions$': path.resolve(shims, 'permissions.ts'),
    'react-native-share$': path.resolve(shims, 'share.ts'),
    'react-native-background-timer$': path.resolve(shims, 'background-timer.ts'),
    'react-native-get-random-values$': path.resolve(shims, 'get-random-values.ts'),
    'react-native-url-polyfill$': path.resolve(shims, 'url-polyfill.ts'),
    // UI 组件类
    '@shopify/flash-list$': path.resolve(shims, 'flash-list.tsx'),
    'react-native-fast-image$': path.resolve(shims, 'fast-image.tsx'),
    '@react-native-community/slider$': path.resolve(shims, 'slider.tsx'),
    'react-native-webview$': path.resolve(shims, 'webview.tsx'),
    'react-native-image-colors$': path.resolve(shims, 'image-colors.ts'),
    'react-native-image-picker$': path.resolve(shims, 'image-picker.ts'),
    'react-native-linear-gradient$': path.resolve(shims, 'linear-gradient.tsx'),
    '@react-native-masked-view/masked-view$': path.resolve(shims, 'masked-view.tsx'),
    'react-native-circular-progress-indicator$': path.resolve(shims, 'circular-progress.tsx'),
    // webdav(ESM) 引用 process/browser 未带扩展名,指向具体文件
    'process/browser': require.resolve('process/browser.js'),
    // react-native-svg(web)引用的 RN 打包器资产注册表(Flow 语法)→ stub
    '@react-native/assets-registry/registry$': path.resolve(shims, 'assets-registry.ts'),
    // expo 模块
    'expo-document-picker$': path.resolve(shims, 'expo-document-picker.ts'),
    'expo-file-system$': path.resolve(shims, 'expo-file-system.ts'),
    'expo-keep-awake$': path.resolve(shims, 'expo-keep-awake.ts'),
    'expo-splash-screen$': path.resolve(shims, 'expo-splash-screen.ts'),
    // '@' 前缀指向移动端共享代码(webpack 前缀匹配规则:key + '/');
    // 精确 alias($ 结尾)必须排在前缀之前,否则会被前缀吞掉
    '@/native/utils$': path.resolve(shims, 'native-utils.ts'),
    '@/native/mp3Util$': path.resolve(shims, 'native-mp3util.ts'),
    '@/native/lyricUtil$': path.resolve(shims, 'native-lyricutil.ts'),
    // 移动端调试浮层 → 桌面 stub(DevTools 替代;源码混用 ESM/CJS,webpack 无法解析)
    '@/lib/react-native-vdebug$': path.resolve(shims, 'vdebug.tsx'),
    '@/lib/react-native-vdebug/src/log$': path.resolve(shims, 'vdebug-log.ts'),
    '@': path.resolve(projectRoot, 'src'),
};

module.exports = (env, argv) => {
    const isProd = argv.mode === 'production';
    return {
        name: 'renderer',
        target: 'web',
        devtool: isProd ? 'source-map' : 'eval-source-map',
        entry: {
            main: path.resolve(rendererSrc, 'index.tsx'),
            lyric: path.resolve(rendererSrc, 'lyric/index.tsx'),
        },
        output: {
            path: path.resolve(__dirname, 'dist/renderer'),
            filename: '[name].js',
            publicPath: './',
        },
        resolve: {
            alias,
            // 共享代码位于 <root>/src,向上找不到 node_modules:
            // 先按默认规则向上解析(parse5 等包的嵌套依赖优先),再兜底到 desktop 的依赖目录
            modules: ['node_modules', path.resolve(__dirname, 'node_modules')],
            extensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.js', '.jsx', '.json'],
            fallback: {
                path: require.resolve('path-browserify'),
                crypto: false,
                stream: false,
                fs: false,
            },
        },
        module: {
            rules: [
                // 移动端 service/index.ts:import(ESM) + module.exports(CJS) 混合,
                // Metro 容忍而 webpack 报错;强制 babel 转为 CJS 规避
                {
                    test: /src([\\/])service\1index\.ts$/,
                    include: [path.resolve(projectRoot, 'src/service')],
                    use: {
                        loader: 'babel-loader',
                        options: {
                            babelrc: false,
                            configFile: false,
                            presets: [
                                ['@babel/preset-env', { targets: { chrome: '120' }, modules: 'commonjs' }],
                                ['@babel/preset-typescript', { allowDeclareFields: true }],
                            ],
                        },
                    },
                },
                // 共享代码 + 需要 worklet/JSX 处理的 RN 库(reanimated 发布产物含 JSX,
                // @react-navigation/drawer 含未转换的 worklet)
                {
                    test: /\.[jt]sx?$/,
                    include: [
                        path.resolve(projectRoot, 'src'),
                        rendererSrc,
                        path.resolve(__dirname, 'node_modules/react-native-reanimated'),
                        path.resolve(__dirname, 'node_modules/@react-navigation/drawer'),
                        path.resolve(__dirname, 'node_modules/react-native-gesture-handler'),
                    ],
                    exclude: [/src([\\/])service\1index\.ts$/],
                    use: {
                        loader: 'babel-loader',
                        options: {
                            configFile: path.resolve(__dirname, 'babel.config.js'),
                        },
                    },
                },
                // svg 文件 → React 组件(等价移动端 react-native-svg-transformer)
                // native: true 生成 <Svg>/<Path>(react-native-svg)而非 DOM <svg>,
                // 否则 RN 数组样式直接传给 DOM style → CSSStyleDeclaration 报错
                {
                    test: /\.svg$/i,
                    issuer: /\.[jt]sx?$/,
                    use: [
                        {
                            loader: '@svgr/webpack',
                            options: {
                                native: true,
                                svgo: false,
                                titleProp: true,
                            },
                        },
                    ],
                },
                // 图片资源 → { uri } 形状,与 RN 的 asset resolver 语义一致
                {
                    test: /\.(png|jpe?g|gif|webp)$/i,
                    use: [
                        {
                            loader: path.resolve(__dirname, 'build/rn-asset-loader.cjs'),
                        },
                    ],
                    type: 'javascript/auto',
                },
                {
                    test: /\.css$/i,
                    use: ['style-loader', 'css-loader'],
                },
            ],
        },
        plugins: [
            new webpack.ProvidePlugin({
                process: 'process/browser',
                Buffer: ['buffer', 'Buffer'],
            }),
            new webpack.DefinePlugin({
                __DESKTOP_APP_VERSION__: JSON.stringify(require('./package.json').version),
                __DESKTOP_APP_NAME__: JSON.stringify('MusicFree'),
                // RN 全局变量,生产构建中替换为 false
                __DEV__: JSON.stringify(!isProd),
                'process.env.NODE_ENV': JSON.stringify(isProd ? 'production' : 'development'),
            }),
            new HtmlWebpackPlugin({
                template: path.resolve(rendererSrc, 'index.html'),
                filename: 'index.html',
                chunks: ['main'],
            }),
            new HtmlWebpackPlugin({
                template: path.resolve(rendererSrc, 'lyric/index.html'),
                filename: 'lyric.html',
                chunks: ['lyric'],
            }),
        ],
        performance: {
            hints: false,
        },
    };
};
