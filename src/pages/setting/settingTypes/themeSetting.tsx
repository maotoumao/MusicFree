import React from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import ListItem from '@/components/listItem';
import {setConfig, useConfig} from '@/common/localConfigManager';
import DocumentPicker from 'react-native-document-picker';
import {Button} from 'react-native-paper';
import ThemeText from '@/components/themeText';
import {fontSizeConst, fontWeightConst} from '@/constants/uiConst';

interface IThemeSettingProps {}
export default function ThemeSetting(props: IThemeSettingProps) {
  const background = useConfig('setting.background');
  return (
    <View style={style.wrapper}>
      <ThemeText style={style.header}>背景设置</ThemeText>
      <View style={style.cardWrapper}>
        <ImageCard
          source={require('@/assets/imgs/background.jpg')}
          onPress={() => {
            setConfig('setting.background', undefined);
          }}></ImageCard>
        <ImageCard
          source={background?{
            uri: background,
          }: require('@/assets/imgs/add-image.png')}
          onPress={async () => {
            try {
              const result = await DocumentPicker.pickSingle({
                type: DocumentPicker.types.images,
              });
              setConfig('setting.background', result.uri);
            } catch {}
          }}></ImageCard>
      </View>
    </View>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    padding: rpx(24),
    marginTop: rpx(12),
  },
  header: {
    fontWeight: fontWeightConst.bold,
    fontSize: fontSizeConst.big,
  },
  cardWrapper: {
    marginTop: rpx(24),
    flexDirection: 'row'
  }
});

function ImageCard(props: {source: any; onPress: () => void}) {
  const {source, onPress} = props;
  return (
    <Pressable onPress={onPress} style={{marginRight:rpx(24)}}>
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
