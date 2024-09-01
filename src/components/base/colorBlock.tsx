import React from 'react';
import {Image, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import {ImgAsset} from '@/constants/assetsConst';

interface IColorBlockProps {
    color: string;
}
export default function ColorBlock(props: IColorBlockProps) {
    const {color} = props;

    return (
        <View style={[styles.showBar]}>
            <Image
                resizeMode="repeat"
                source={ImgAsset.transparentBg}
                style={styles.transparentBg}
            />
            <View
                style={[
                    styles.showBarContent,
                    {
                        backgroundColor: color,
                    },
                ]}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    showBar: {
        width: rpx(76),
        height: rpx(50),
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: '#ccc',
    },
    showBarContent: {
        width: '100%',
        height: '100%',
        position: 'absolute',
        left: 0,
        top: 0,
    },
    transparentBg: {
        position: 'absolute',
        zIndex: -1,
        width: '100%',
        height: '100%',
        left: 0,
        top: 0,
    },
});
