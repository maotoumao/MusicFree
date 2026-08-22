/**
 * @react-native/assets-registry 桌面 stub
 *
 * react-native-svg(web 实现)引用它把数字 asset id 解析为 uri;
 * 桌面端图片资源由 webpack 的 rn-asset-loader 直接产出 { uri } 对象,
 * 数字 id 路径不会走到,兜底返回 null 即可。
 */

export function getAssetByID(_id: number): null {
    return null;
}

export function registerAsset(_asset: unknown): number {
    return -1;
}
