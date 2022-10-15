import React from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import {SafeAreaView} from 'react-native-safe-area-context';
import StatusBar from '@/components/base/statusBar';
import LocalMusicList from './localMusicList';
import MusicBar from '@/components/musicBar';
import ComplexAppBar from '@/components/base/ComplexAppBar';
import DocumentPicker from 'react-native-document-picker';
import Toast from '@/utils/toast';
import LocalMusicSheet from '@/core/localMusicSheet';
import {useNavigation} from '@react-navigation/native';
import {ROUTE_PATH} from '@/entry/router';
import {errorLog} from '@/utils/log';

export default function LocalMusic() {
    const navigation = useNavigation<any>();

    return (
        <SafeAreaView style={style.wrapper}>
            <StatusBar />
            <ComplexAppBar
                title="本地音乐"
                onSearchPress={() => {
                    navigation.navigate(ROUTE_PATH.SEARCH_MUSIC_LIST, {
                        musicList: LocalMusicSheet.getMusicList(),
                    });
                }}
                menuOptions={[
                    {
                        icon: 'magnify',
                        title: '从文件夹导入',
                        async onPress() {
                            try {
                                const dir =
                                    await DocumentPicker.pickDirectory();
                                if (dir?.uri) {
                                    await LocalMusicSheet.importFolder(dir.uri);
                                    Toast.success('导入成功');
                                }
                            } catch (e: any) {
                                errorLog('导入歌曲失败', e?.message ?? '');
                                Toast.warn('导入失败');
                            }
                        },
                    },
                ]}
            />
            <LocalMusicList />
            <MusicBar />
        </SafeAreaView>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        flex: 1,
    },
});
