/**
 * 颜色选择面板（组合内容，非壳）：底部 sheet 里托 ColorPicker，实时应用——onChange 边选边写、关闭不回滚
 * 关闭方式沿用通用壳（下滑 / 遮罩 / 返回键）；可选「恢复默认」把颜色置回 defaultValue
 * 标题由唤起方按自身 namespace 传入已翻译文案（业务壳不持标题串）
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { definePanel } from '@/components/overlay';
import { Button } from '@/components/ui/Button';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { Text } from '@/components/ui/Text';
import { space } from '@/design';
import { useT } from '@/i18n';
import { colord } from '@/utils/color';

import type { OverlayProps } from '@/components/overlay';

interface ColorPickerOptions {
    /** 标题（唤起方传入已翻译文案） */
    title: string;
    /** 当前颜色（hex） */
    value: string;
    /** 「恢复默认」目标色；不传则不显示该按钮 */
    defaultValue?: string;
    /** 是否显示透明度控制；默认 true */
    showOpacity?: boolean;
    /** 实时回调：边选边应用，关闭不回滚 */
    onChange: (hex: string) => void;
}

function ColorPickerPanelView({
    payload,
}: OverlayProps<ColorPickerOptions, void>) {
    const t = useT();
    const { defaultValue, showOpacity = true } = payload;
    const [current, setCurrent] = useState(payload.value);
    const apply = (hex: string) => {
        const normalized = showOpacity ? hex : colord(hex).alpha(1).toHex();
        setCurrent(normalized);
        payload.onChange(normalized);
    };
    return (
        <View style={styles.root}>
            <Text size="xl" weight="bold" lineHeight="tight">
                {payload.title}
            </Text>
            <ColorPicker
                value={current}
                onChange={apply}
                showOpacity={showOpacity}
            />
            {defaultValue != null ? (
                <Button
                    variant="filled"
                    tone="neutral"
                    onPress={() => apply(defaultValue)}
                >
                    {t('colorPickerPanel.restoreDefault')}
                </Button>
            ) : null}
        </View>
    );
}

/** 颜色选择面板：实时应用，关闭即结束（不回滚）；`showColorPickerPanel({ title, value, onChange })` */
const showColorPickerPanel = definePanel(ColorPickerPanelView);

const styles = StyleSheet.create({
    root: {
        paddingHorizontal: space.lg,
        gap: space.lg,
    },
});

export { showColorPickerPanel };
export type { ColorPickerOptions };
