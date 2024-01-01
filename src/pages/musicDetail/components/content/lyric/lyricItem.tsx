import React, {memo} from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import ThemeText from '@/components/base/themeText';
import useColors from '@/hooks/useColors';

interface ILyricItemComponentProps {
    // 行号
    index?: number;
    // 显示
    light?: boolean;
    // 高亮
    highlight?: boolean;
    // 文本
    text?: string;

    onLayout?: (index: number, height: number) => void;
}

function _LyricItemComponent(props: ILyricItemComponentProps) {
    const {light, highlight, text, onLayout, index} = props;

    const colors = useColors();

    return (
        <ThemeText
            onLayout={({nativeEvent}) => {
                if (index !== undefined) {
                    onLayout?.(index, nativeEvent.layout.height);
                }
            }}
            style={[
                lyricStyles.item,
                highlight
                    ? [
                          lyricStyles.highlightItem,
                          {
                              color: colors.primary,
                          },
                      ]
                    : null,
                light ? lyricStyles.draggingItem : null,
            ]}>
            {text}
        </ThemeText>
    );
}
// 歌词
const LyricItemComponent = memo(
    _LyricItemComponent,
    (prev, curr) =>
        prev.light === curr.light &&
        prev.highlight === curr.highlight &&
        prev.text === curr.text &&
        prev.index === curr.index,
);

export default LyricItemComponent;

const lyricStyles = StyleSheet.create({
    highlightItem: {
        opacity: 1,
    },
    item: {
        fontSize: rpx(32),
        color: 'white',
        opacity: 0.6,
        paddingHorizontal: rpx(64),
        paddingVertical: rpx(24),
        width: '100%',
        textAlign: 'center',
        textAlignVertical: 'center',
    },
    draggingItem: {
        opacity: 0.9,
        color: 'white',
    },
});
