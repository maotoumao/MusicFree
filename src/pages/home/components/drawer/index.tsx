import React from 'react';
import {
  BackHandler,
  FlatList,
  ImageBackground,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import rpx from '@/utils/rpx';
import {DrawerContentScrollView} from '@react-navigation/drawer';
import {Button, Card, IconButton} from 'react-native-paper';
import MusicQueue from '@/common/musicQueue';
import ListItem from '@/components/base/listItem';
import {useNavigation} from '@react-navigation/native';
import {ROUTE_PATH} from '@/entry/router';
import ThemeText from '@/components/base/themeText';
import PageBackground from '@/components/base/pageBackground';
import DeviceInfo from 'react-native-device-info';

interface IDrawerProps {}

export default function HomeDrawer(props: IDrawerProps) {
  const navigation = useNavigation<any>();
  function navigateToSetting(settingType: string) {
    navigation.navigate(ROUTE_PATH.SETTING, {
      type: settingType,
    });
  }

  const basicSetting = [
    {
      icon: 'cog-outline',
      title: '基本设置',
      onPress: () => {
        navigateToSetting('basic');
      },
    },
    {
      icon: 'language-javascript',
      title: '插件设置',
      onPress: () => {
        navigateToSetting('plugin');
      },
    },
    {
      icon: 'tshirt-v-outline',
      title: '主题设置',
      onPress: () => {
        navigateToSetting('theme');
      },
    },
    {
      icon: 'backup-restore',
      title: '备份与恢复',
      onPress: () => {},
    },
  ] as const;

  return (
    <>
      <PageBackground></PageBackground>
      <DrawerContentScrollView {...props} style={style.scrollWrapper}>
        <View style={style.header}>
          <ThemeText fontSize='appbar' fontWeight='bold'>{DeviceInfo.getApplicationName()}</ThemeText>
          <IconButton icon={'qrcode-scan'} size={rpx(36)}></IconButton>
        </View>
        <Card style={style.card}>
          <Card.Title
            title={
              <ThemeText fontSize='description'>设置</ThemeText>
            }></Card.Title>
          <Card.Content>
            {basicSetting.map(item => (
              <ListItem
                key={item.title}
                itemPaddingHorizontal={0}
                left={{
                  icon: {
                    name: item.icon,
                    size: 'normal',
                    fontColor: 'normal',
                  },
                  width: rpx(48),
                }}
                title={item.title}
                onPress={item.onPress}></ListItem>
            ))}
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
    </>
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
