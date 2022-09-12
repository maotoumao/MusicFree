import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import ThemeText from '@/components/base/themeText';
import {ImgAsset} from '@/constants/assetsConst';
import pathConst from '@/constants/pathConst';
import Config from '@/core/config';
import Color from 'color';
import {copyFile} from 'react-native-fs';
import ImageColors from 'react-native-image-colors';
import {launchImageLibrary} from 'react-native-image-picker';
import ImageCard from './imageCard';
import Slider from '@react-native-community/slider';

export default function Background() {
    const theme = Config.useConfig('setting.theme');

    const onCustomBgPress = async () => {
        try {
            const result = await launchImageLibrary({
                mediaType: 'photo',
            });
            const uri = result.assets?.[0].uri;
            if (!uri) {
                return;
            }

            const bgPath = `${pathConst.dataPath}background${uri.substring(
                uri.lastIndexOf('.'),
            )}`;
            await copyFile(uri, bgPath);
            Config.set(
                'setting.theme.background',
                `file://${bgPath}#${Date.now()}`,
            );

            const colorsResult = await ImageColors.getColors(uri, {
                fallback: '#ffffff',
            });
            const colors = {
                primary:
                    colorsResult.platform === 'android'
                        ? colorsResult.dominant
                        : colorsResult.platform === 'ios'
                        ? colorsResult.primary
                        : colorsResult.vibrant,
                average:
                    colorsResult.platform === 'android'
                        ? colorsResult.average
                        : colorsResult.platform === 'ios'
                        ? colorsResult.detail
                        : colorsResult.dominant,
                vibrant:
                    colorsResult.platform === 'android'
                        ? colorsResult.vibrant
                        : colorsResult.platform === 'ios'
                        ? colorsResult.secondary
                        : colorsResult.vibrant,
            };
            const primaryColor = Color(colors.primary).darken(0.3).toString();
            // const secondaryColor = Color(colors.average)
            //   .darken(0.3)
            //   .toString();
            const textHighlight = Color(
                0xffffff - Color(primaryColor).rgbNumber(),
                'rgb',
            )
                .saturate(0.5)
                .toString();
            Config.set('setting.theme.mode', 'custom-dark');
            Config.set('setting.theme.colors', {
                primary: primaryColor,
                textHighlight: textHighlight,
                accent: textHighlight,
            });
        } catch (e) {
            console.log(e);
        }
    };

    return (
        <View>
            <ThemeText fontSize="title" style={style.header}>
                背景设置
            </ThemeText>
            <View style={style.sectionWrapper}>
                <ImageCard
                    emptySrc={ImgAsset.backgroundDefault}
                    onPress={() => {
                        Config.set('setting.theme.background', undefined);
                        Config.set('setting.theme.colors', undefined);
                    }}
                />
                <ImageCard
                    uri={theme?.background}
                    emptySrc={ImgAsset.addBackground}
                    onPress={onCustomBgPress}
                />
            </View>
            <View style={style.sliderWrapper}>
                <ThemeText>模糊度</ThemeText>
                <Slider
                    style={style.slider}
                    minimumTrackTintColor={'#cccccc'}
                    maximumTrackTintColor={'#999999'}
                    thumbTintColor={'#dddddd'}
                    minimumValue={0}
                    maximumValue={30}
                    onSlidingComplete={val => {
                        Config.set('setting.theme.backgroundBlur', val);
                    }}
                    value={theme?.backgroundBlur ?? 20}
                />
            </View>
            <View style={style.sliderWrapper}>
                <ThemeText>透明度</ThemeText>
                <Slider
                    style={style.slider}
                    minimumTrackTintColor={'#cccccc'}
                    maximumTrackTintColor={'#999999'}
                    thumbTintColor={'#dddddd'}
                    minimumValue={0.3}
                    maximumValue={1}
                    onSlidingComplete={val => {
                        Config.set('setting.theme.backgroundOpacity', val);
                    }}
                    value={theme?.backgroundOpacity ?? 0.7}
                />
            </View>
        </View>
    );
}

const style = StyleSheet.create({
    header: {
        marginTop: rpx(36),
    },
    sectionWrapper: {
        marginTop: rpx(28),
        flexDirection: 'row',
    },
    sliderWrapper: {
        marginTop: rpx(28),
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    slider: {
        width: rpx(550),
        height: rpx(40),
    },
});
