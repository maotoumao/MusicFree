import React from 'react';
import {Image, Pressable, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import ListItem from '@/components/listItem';
import {setConfig, useConfig} from '@/common/localConfigManager';
import DocumentPicker from 'react-native-document-picker';
import {Button, List, Switch} from 'react-native-paper';
import ThemeText from '@/components/themeText';
import {fontSizeConst, fontWeightConst} from '@/constants/uiConst';
import ImageColors from 'react-native-image-colors';
import {launchImageLibrary} from 'react-native-image-picker';
import Color from 'color';

interface IThemeSettingProps {}
export default function ThemeSetting(props: IThemeSettingProps) {
  const background = useConfig('setting.theme.background');
  const mode = useConfig('setting.theme.mode') ?? 'dark';
  return (
    <View style={style.wrapper}>
      <ThemeText style={style.header}>显示样式</ThemeText>
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
      <ThemeText style={style.header}>背景设置</ThemeText>
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
              setConfig('setting.theme.background', uri);

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
              // const isDark = Color(colors.average).isDark();
              const primaryColor = Color(colors.primary).darken(0.3).toString();
              const textColor = Color(primaryColor).negate().lighten(0.3).toString();
              setConfig('setting.theme.colors', {
                primary: primaryColor,
                text: textColor,
                placeholder: Color(textColor).lighten(0.1).toString(),
                surface: Color(colors.average).darken(0.2).toString(),
                background: Color('#7f7f7f').mix(Color(primaryColor), 0.3).darken(0.15).alpha(0.15).toString(),
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
    fontWeight: fontWeightConst.bold,
    fontSize: fontSizeConst.big,
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
