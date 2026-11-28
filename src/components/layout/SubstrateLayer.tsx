import { StyleSheet, View } from 'react-native';

import { useBackgroundLayer, useColors } from '@/design';

import { Image } from '../ui/Image';

interface SubstrateLayerProps {
    /**
     * 图层尺寸；缺省铺满父容器
     * 抽屉这类比窗口窄的容器必须传窗口尺寸：图层左上角对齐容器左上角后，
     * 露出的正好是壁纸的同一块，与页面上的背景严丝合缝（否则会各自 cover 出两种裁剪）
     */
    width?: number;
    height?: number;
}

/**
 * 页面基底图层：已烘焙的壁纸位图 + 按可见度压的底色幕布
 * uri 为 null 时不渲染——那是编辑器的草稿态，图层由编辑器自绘
 */
function SubstrateLayer({ width, height }: SubstrateLayerProps) {
    const colors = useColors();
    const background = useBackgroundLayer();
    if (background?.uri == null) {
        return null;
    }
    return (
        <View
            pointerEvents="none"
            style={[
                styles.layer,
                width !== undefined && height !== undefined
                    ? { width, height }
                    : styles.fillParent,
            ]}
        >
            {/* 位图已在写入时完成裁剪 / 缩放 / 模糊，运行时只做纯展示 */}
            <Image
                source={background.uri}
                style={styles.fill}
                transition={0}
                pointerEvents="none"
            />
            <View
                style={[
                    styles.fill,
                    {
                        backgroundColor: colors.background,
                        opacity: 1 - background.visibility,
                    },
                ]}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    layer: {
        position: 'absolute',
        top: 0,
        left: 0,
        overflow: 'hidden',
    },
    /** 不给显式尺寸时铺满父容器 */
    fillParent: {
        right: 0,
        bottom: 0,
    },
    fill: {
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
    },
});

export { SubstrateLayer };
