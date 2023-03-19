import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx, {vmax} from '@/utils/rpx';
import ThemeText from '@/components/base/themeText';
import ListItem from '@/components/base/listItem';
import MusicSheet from '@/core/musicSheet';
import {ImgAsset} from '@/constants/assetsConst';
import Toast from '@/utils/toast';
import usePanel from '../usePanel';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import PanelBase from '../base/panelBase';
import {FlatList} from 'react-native-gesture-handler';

interface IAddToMusicSheetProps {
    musicItem: IMusic.IMusicItem | IMusic.IMusicItem[];
    // 如果是新建歌单，可以传入一个默认的名称
    newSheetDefaultName?: string;
}

export default function AddToMusicSheet(props: IAddToMusicSheetProps) {
    const sheets = MusicSheet.useSheets();
    const {showPanel, hidePanel} = usePanel();
    const {musicItem = [], newSheetDefaultName} = props ?? {};
    const safeAreaInsets = useSafeAreaInsets();

    return (
        <PanelBase
            renderBody={() => (
                <>
                    <View style={style.header}>
                        <ThemeText fontSize="title" fontWeight="semibold">
                            添加到歌单
                            <ThemeText
                                fontSize="subTitle"
                                fontColor="secondary">
                                {' '}
                                (
                                {Array.isArray(musicItem)
                                    ? musicItem.length
                                    : 1}
                                )
                            </ThemeText>
                        </ThemeText>
                    </View>
                    <View style={style.wrapper}>
                        <FlatList
                            data={sheets ?? []}
                            keyExtractor={sheet => sheet.id}
                            style={{
                                marginBottom: safeAreaInsets.bottom,
                            }}
                            ListHeaderComponent={
                                <ListItem
                                    key="new"
                                    title="新建歌单"
                                    left={{
                                        fallback: ImgAsset.add,
                                    }}
                                    onPress={() => {
                                        showPanel('NewMusicSheet', {
                                            defaultName: newSheetDefaultName,
                                            async onSheetCreated(sheetId) {
                                                try {
                                                    await MusicSheet.addMusic(
                                                        sheetId,
                                                        musicItem,
                                                    );
                                                    Toast.success(
                                                        '添加到歌单成功',
                                                    );
                                                } catch {
                                                    Toast.warn(
                                                        '添加到歌单失败',
                                                    );
                                                }
                                            },
                                            onCancel() {
                                                showPanel('AddToMusicSheet', {
                                                    musicItem: musicItem,
                                                    newSheetDefaultName,
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
                                            await MusicSheet.addMusic(
                                                sheet.id,
                                                musicItem,
                                            );
                                            hidePanel();
                                            Toast.success('添加到歌单成功');
                                        } catch {
                                            Toast.warn('添加到歌单失败');
                                        }
                                    }}
                                    desc={`${sheet.musicList.length ?? '-'}首`}
                                />
                            )}
                        />
                    </View>
                </>
            )}
            height={vmax(70)}
        />
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: '100%',
        flex: 1,
    },
    header: {
        paddingHorizontal: rpx(24),
        marginTop: rpx(24),
        marginBottom: rpx(36),
    },
});
