import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import ThemeText from './themeText';
import useColors from '@/hooks/useColors';

interface ITagProps {
    tagName: string;
}
export default function Tag(props: ITagProps) {
    const colors = useColors();
    return (
        <View
            style={[
                styles.tag,
                {backgroundColor: colors.card, borderColor: colors.divider},
            ]}>
            <ThemeText style={styles.tagText} fontSize="tag">
                {props.tagName}
            </ThemeText>
        </View>
    );
}

const styles = StyleSheet.create({
    tag: {
        height: rpx(32),
        marginLeft: rpx(12),
        paddingHorizontal: rpx(12),
        borderRadius: rpx(24),
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
        borderWidth: 1,
        borderStyle: 'solid',
    },
    tagText: {
        textAlignVertical: 'center',
    },
});
