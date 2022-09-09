import React from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import {useNavigation, useRoute, useTheme} from '@react-navigation/native';
import {Appbar} from 'react-native-paper';
import ThemeText from '@/components/base/themeText';
import {SafeAreaView} from 'react-native-safe-area-context';
import StatusBar from '@/components/base/statusBar';
import LocalMusicList from './localMusicList';
import MusicBar from '@/components/musicBar';
import { useEffect } from 'react';
import DownloadManager from '@/core/downloadManager';

interface ILocalMusicProps {}
export default function LocalMusic(props: ILocalMusicProps) {
  const route = useRoute<any>();
  const navigation = useNavigation();
  const type: string = route.params?.type;

  const {colors} = useTheme();

  useEffect(() => {
    DownloadManager.setupDownload();
  }, []);

  return (
    <SafeAreaView style={style.wrapper}>
      <StatusBar></StatusBar>
      <Appbar style={[style.appbar, {backgroundColor: colors.primary}]}>
        <Appbar.BackAction
          color={colors.text}
          onPress={() => {
            navigation.goBack();
          }}></Appbar.BackAction>
        <Appbar.Header style={style.header}>
          <ThemeText
            style={style.header}
            fontSize="title"
            fontWeight="semibold">
            本地音乐
          </ThemeText>
        </Appbar.Header>
      </Appbar>
      <LocalMusicList></LocalMusicList>
      <MusicBar></MusicBar>
    </SafeAreaView>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    flex: 1,
  },
  appbar: {
    shadowColor: 'transparent',
    backgroundColor: '#2b333eaa',
  },
  header: {
    backgroundColor: 'transparent',
    shadowColor: 'transparent',
  },
});
