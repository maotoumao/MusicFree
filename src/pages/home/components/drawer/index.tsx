import React from 'react';
import {
  BackHandler,
  ImageBackground,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import rpx from '@/utils/rpx';
import {DrawerContentScrollView} from '@react-navigation/drawer';
import {Button, Card, IconButton} from 'react-native-paper';
import MusicQueue from '@/common/musicQueue';
import ListItem from '@/components/listItem';
import {useNavigation} from '@react-navigation/native';
import {ROUTE_PATH} from '@/entry/router';
import { fontSizeConst, fontWeightConst } from '@/constants/uiConst';
import ThemeText from '@/components/themeText';
import { useConfig } from '@/common/localConfigManager';

interface IDrawerProps {}

export default function HomeDrawer(props: IDrawerProps) {
  const navigation = useNavigation<any>();
  const background = useConfig('setting.background');
  function navigateToSetting(settingType: string) {
    navigation.navigate(ROUTE_PATH.SETTING, {
      type: settingType,
    });
  }
  return (
    <ImageBackground
      blurRadius={20}
      source={background
        ? {
            uri: background,
          }: require('@/assets/imgs/background.jpg')}
      style={style.wrapper}>
      <DrawerContentScrollView {...props} style={style.scrollWrapper}>
        <View style={style.header}>
          <ThemeText style={style.title}>Music Free</ThemeText>
          <IconButton
            icon={'qrcode-scan'}
            size={rpx(36)}></IconButton>
        </View>
        <Card style={style.card}>
          <Card.Title
            title={<ThemeText style={style.cardTitle}>设置</ThemeText>}></Card.Title>
          <Card.Content>
            <ListItem
              icon="cog-outline"
              title="基本设置"
              onPress={() => {
                navigateToSetting('basic');
              }}></ListItem>
            <ListItem
              icon="language-javascript"
              title="插件设置"
              onPress={() => {
                navigateToSetting('plugin');
              }}></ListItem>
            <ListItem icon="tshirt-v-outline" title="主题设置"></ListItem>
            <ListItem icon="backup-restore" title="备份与恢复"></ListItem>
          </Card.Content>
        </Card>
        <View style={style.bottom}>
          <Button
            onPress={() => {
              MusicQueue.stop();
              BackHandler.exitApp();
            }}>
            退出
          </Button>
        </View>
      </DrawerContentScrollView>
    </ImageBackground>
  );
}

const style = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#999999',
  },
  scrollWrapper: {
    paddingHorizontal: rpx(24),
    paddingTop: rpx(12),
  },

  header: {
    height: rpx(100),
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: fontSizeConst.bigger,
    includeFontPadding: false,
    fontWeight: fontWeightConst.bold
  },
  cardTitle: {
    fontSize: fontSizeConst.small,
  },
  card: {
    backgroundColor: '#eeeeee22',
  },
  bottom: {
    height: rpx(100),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
});
