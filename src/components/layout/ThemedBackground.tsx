import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useColors } from '@/design';

interface ThemedBackgroundProps {
    children: ReactNode;
}

/**
 * 导航树的根底色：页面挂载前 / 转场露白时兜住背景，杜绝白闪
 * 壁纸不在这里铺——那会要求各屏容器透明，`slide_from_right` 期间两屏内容会叠着显示；
 * 壁纸由每个 `Screen` 自己铺（见 `SubstrateLayer`）
 */
function ThemedBackground({ children }: ThemedBackgroundProps) {
    const colors = useColors();
    return (
        <View style={[styles.root, { backgroundColor: colors.background }]}>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({ root: { flex: 1 } });

export { ThemedBackground };
