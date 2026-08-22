/**
 * react-native/Libraries/Image/resolveAssetSource 桌面端实现
 * webpack 资源加载器已经把静态资源转换为 { uri } 形状,透传即可。
 */

export default function resolveAssetSource(source: any): any {
    if (typeof source === "number" || typeof source === "string") {
        return { uri: String(source) };
    }
    if (source && typeof source === "object") {
        if (!source.uri && source.default) {
            return { uri: source.default };
        }
        return source;
    }
    return source;
}
