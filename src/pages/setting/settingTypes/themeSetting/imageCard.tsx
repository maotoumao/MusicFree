import Image from '@/components/base/image';
import ThemeText from '@/components/base/themeText';
import rpx from '@/utils/rpx';
import React from 'react';
import {Pressable, StyleSheet} from 'react-native';

interface IImageCardProps {
    title?: string;
    onPress: () => void;
    uri?: string;
    emptySrc: any;
}
export default function ImageCard(props: IImageCardProps) {
    const {uri, emptySrc, onPress, title} = props;
    return (
        <Pressable onPress={onPress} style={style.wrapper}>
            <Image uri={uri} emptySrc={emptySrc} style={style.image} />
            {title ? <ThemeText style={style.text}>{title}</ThemeText> : null}
        </Pressable>
    );
}

const style = StyleSheet.create({
    wrapper: {
        marginRight: rpx(24),
    },
    image: {
        width: rpx(226),
        height: rpx(339),
        borderRadius: rpx(24),
    },
    text: {
        marginTop: rpx(18),
        textAlign: 'center',
    },
});
