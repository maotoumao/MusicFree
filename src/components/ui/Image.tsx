/**
 * 图片图元：包 expo-image（磁盘+内存缓存、占位、淡入过渡）
 * 展示原语、主题无关；尺寸由调用方经 style 决定（如 markdown 图片撑满正文宽）
 */
import {
    Image as ExpoImage,
    type ImageContentFit,
    type ImageProps as ExpoImageProps,
    type ImageSource,
} from 'expo-image';
import { type ImageStyle, type StyleProp } from 'react-native';

import { duration } from '@/design';

interface ImageProps {
    /** 远端 uri 字符串 / require(...) 本地资源 / ImageSource */
    source: ImageSource | string | number;
    style?: StyleProp<ImageStyle>;
    /** 缩放方式，默认 cover */
    contentFit?: ImageContentFit;
    /** 加载中/失败占位（blurhash 或本地图） */
    placeholder?: ExpoImageProps['placeholder'];
    /** 高斯模糊半径（如沉浸页封面氛围底） */
    blurRadius?: number;
    /** 淡入过渡时长 ms，默认 duration.fast；传 0 = 即时（缓存图不闪占位） */
    transition?: number;
    /** 无障碍描述（如 markdown alt）；缺省则视为装饰图、不入无障碍树 */
    accessibilityLabel?: string;
    /** 加载失败回调 */
    onError?: ExpoImageProps['onError'];
    /** 加载成功回调（携 intrinsic 尺寸，供调用方算纵横比） */
    onLoad?: ExpoImageProps['onLoad'];
    /** 触摸命中行为（如 absolute 封面盖列表时传 none，让滚动手势透传到下方列表） */
    pointerEvents?: ExpoImageProps['pointerEvents'];
}

/** 图片图元 */
export function Image({
    source,
    style,
    contentFit = 'cover',
    placeholder,
    blurRadius,
    transition = duration.fast,
    accessibilityLabel,
    onError,
    onLoad,
    pointerEvents,
}: ImageProps) {
    // 空/纯空白 alt（如 markdown ![](url)）归为装饰图，不进无障碍树
    const label = accessibilityLabel?.trim() || undefined;
    return (
        <ExpoImage
            source={source}
            style={style}
            contentFit={contentFit}
            placeholder={placeholder}
            blurRadius={blurRadius}
            transition={transition}
            cachePolicy="memory-disk"
            accessible={label != null}
            accessibilityLabel={label}
            onError={onError}
            onLoad={onLoad}
            pointerEvents={pointerEvents}
        />
    );
}
