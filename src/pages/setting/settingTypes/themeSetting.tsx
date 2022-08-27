import React from 'react';
import {Image, Pressable, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import {setConfig, useConfig} from '@/common/localConfigManager';
import {List, Switch} from 'react-native-paper';
import ThemeText from '@/components/themeText';
import ImageColors from 'react-native-image-colors';
import {launchImageLibrary} from 'react-native-image-picker';
import Color from 'color';
import {copyFile} from 'react-native-fs';
import pathConst from '@/constants/pathConst';

interface IThemeSettingProps {}
export default function ThemeSetting(props: IThemeSettingProps) {
  const background = useConfig('setting.theme.background');
  const mode = useConfig('setting.theme.mode') ?? 'dark';
  return (
    <View style={style.wrapper}>
      <ThemeText fontSize="title" style={style.header}>
        显示样式
      </ThemeText>
      <View style={style.sectionWrapper}>
        <List.Item
          title={<ThemeText>深色模式</ThemeText>}
          right={() => (
            <Switch
              value={mode === 'dark'}
              onValueChange={_ => {
                setConfig('setting.theme.mode', _ ? 'dark' : 'light');
              }}></Switch>
          )}></List.Item>
      </View>
      <ThemeText fontSize="title" style={style.header}>
        背景设置
      </ThemeText>
      <View
        style={[
          style.sectionWrapper,
          {
            flexDirection: 'row',
          },
        ]}>
        <ImageCard
          source={require('@/assets/imgs/background.jpg')}
          onPress={() => {
            setConfig('setting.theme.background', undefined);
            setConfig('setting.theme.colors', undefined);
          }}></ImageCard>
        <ImageCard
          source={
            background
              ? {
                  uri: background,
                }
              : require('@/assets/imgs/add-image.png')
          }
          onPress={async () => {
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
              setConfig(
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
              const secondaryColor = Color(colors.average)
                .darken(0.3)
                .toString();
              const textHighlight =  Color(0xffffff - Color(primaryColor).rgbNumber(), 'rgb').saturate(0.5).toString();

              setConfig('setting.theme.colors', {
                primary: primaryColor,
                secondary: secondaryColor,
                textHighlight: textHighlight
              });
            } catch (e) {
              console.log(e);
            }
          }}></ImageCard>
      </View>
    </View>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    padding: rpx(24),
  },
  header: {
    marginTop: rpx(36),
  },
  sectionWrapper: {
    marginTop: rpx(24),
  },
});

function ImageCard(props: {source: any; onPress: () => void}) {
  const {source, onPress} = props;
  return (
    <Pressable onPress={onPress} style={{marginRight: rpx(24)}}>
      <Image
        source={source}
        style={{
          width: rpx(226),
          height: rpx(339),
          borderRadius: rpx(24),
        }}></Image>
    </Pressable>
  );
}
