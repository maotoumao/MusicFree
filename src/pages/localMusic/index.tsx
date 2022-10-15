import React from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import {SafeAreaView} from 'react-native-safe-area-context';
import StatusBar from '@/components/base/statusBar';
import LocalMusicList from './localMusicList';
import MusicBar from '@/components/musicBar';
import {useEffect} from 'react';
import Download from '@/core/download';
import ComplexAppBar from '@/components/base/ComplexAppBar';
import DocumentPicker from 'react-native-document-picker';
import Toast from '@/utils/toast';
import LocalMusicSheet from '@/core/localMusicSheet';

export default function LocalMusic() {
    useEffect(() => {
        Download.setup();
    }, []);

    return (
        <SafeAreaView style={style.wrapper}>
            <StatusBar />
            <ComplexAppBar
                title="本地音乐"
                menuOptions={[
                    {
                        icon: 'magnify',
                        title: '从文件夹导入',
                        async onPress() {
                            try {
                                const dir =
                                    await DocumentPicker.pickDirectory();
                                if (dir?.uri) {
                                    LocalMusicSheet.importFolder(dir.uri);
                                }
                            } catch (e) {
                                console.log(e);
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
