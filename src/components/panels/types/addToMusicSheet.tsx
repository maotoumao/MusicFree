import React, {useRef} from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import BottomSheet, {
    BottomSheetBackdrop,
    BottomSheetFlatList,
} from '@gorhom/bottom-sheet';
import ThemeText from '@/components/base/themeText';
import {useTheme} from 'react-native-paper';
import ListItem from '@/components/base/listItem';
import MusicSheet from '@/core/musicSheet';
import {ImgAsset} from '@/constants/assetsConst';
import {BottomSheetMethods} from '@gorhom/bottom-sheet/lib/typescript/types';
import Toast from '@/utils/toast';
import usePanel from '../usePanel';

interface IAddToMusicSheetProps {
    musicItem: IMusic.IMusicItem | IMusic.IMusicItem[];
}

export default function AddToMusicSheet(props: IAddToMusicSheetProps) {
    const sheetRef = useRef<BottomSheetMethods | null>();
    const sheets = MusicSheet.useSheets();
    const {showPanel, unmountPanel} = usePanel();
    const {musicItem = []} = props ?? {};
    const {colors} = useTheme();

    return (
        <BottomSheet
            ref={_ => (sheetRef.current = _)}
            backdropComponent={props => {
                return (
                    <BottomSheetBackdrop
                        disappearsOnIndex={-1}
                        pressBehavior={'close'}
                        opacity={0.5}
                        {...props}
                    />
                );
            }}
            backgroundStyle={{backgroundColor: colors.primary}}
            index={0}
            snapPoints={['60%', '80%']}
            enablePanDownToClose
            enableOverDrag={false}
            onClose={unmountPanel}>
            <View style={style.header}>
                <ThemeText fontSize="title" fontWeight="semibold">
                    添加到歌单
                    <ThemeText fontSize="subTitle" fontColor="secondary">
                        {' '}
                        ({Array.isArray(musicItem) ? musicItem.length : 1})
                    </ThemeText>
                </ThemeText>
            </View>
            <BottomSheetFlatList
                data={sheets ?? []}
                keyExtractor={sheet => sheet.id}
                ListHeaderComponent={
                    <ListItem
                        key="new"
                        title="新建歌单"
                        left={{
                            fallback: ImgAsset.add,
                        }}
                        onPress={() => {
                            showPanel('NewMusicSheet', {
                                async onSheetCreated(sheetId) {
                                    try {
                                        await MusicSheet.addMusic(
                                            sheetId,
                                            musicItem,
                                        );
                                        Toast.success('添加到歌单成功');
                                    } catch {
                                        Toast.warn('添加到歌单失败');
                                    }
                                },
                                onCancel() {
                                    showPanel('AddToMusicSheet', {
                                        musicItem: musicItem,
                                    });
                                },
                            });
                        }}
                    />
                }
                renderItem={({item: sheet}) => (
                    <ListItem
                        key={`${sheet.id}`}
                        title={sheet.title}
                        left={{
                            artwork: sheet.coverImg,
                            fallback: ImgAsset.albumDefault,
                        }}
                        onPress={async () => {
                            try {
                                await MusicSheet.addMusic(sheet.id, musicItem);
                                unmountPanel();
                                Toast.success('添加到歌单成功');
                            } catch {
                                Toast.warn('添加到歌单失败');
                            }
                        }}
                        desc={`${sheet.musicList.length ?? '-'}首`}
                    />
                )}
            />
        </BottomSheet>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
    },
    header: {
        paddingHorizontal: rpx(24),
        marginTop: rpx(24),
        marginBottom: rpx(36),
    },
    scrollWrapper: {
        paddingHorizontal: rpx(24),
        paddingTop: rpx(24),
    },
});
