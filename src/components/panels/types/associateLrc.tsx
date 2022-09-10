import React, {useRef, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import BottomSheet, {
    BottomSheetBackdrop,
    BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import {Divider} from 'react-native-paper';
import {_usePanel} from '../usePanel';
import {fontSizeConst} from '@/constants/uiConst';
import Color from 'color';
import Button from '@/components/base/button';
import useColors from '@/hooks/useColors';
import {BottomSheetMethods} from '@gorhom/bottom-sheet/lib/typescript/types';
import MediaMeta from '@/core/mediaMeta';
import Clipboard from '@react-native-clipboard/clipboard';
import {errorLog} from '@/utils/log';
import {parseMediaKey} from '@/utils/mediaItem';
import Cache from '@/core/cache';
import Toast from '@/utils/toast';

interface INewMusicSheetProps {
    musicItem: IMusic.IMusicItem;
}
export default function AssociateLrc(props: INewMusicSheetProps) {
    const {musicItem} = props;
    const sheetRef = useRef<BottomSheetMethods | null>();
    const {unmountPanel} = _usePanel(sheetRef);
    const [input, setInput] = useState('');
    const colors = useColors();
    const snap = useRef(['30%']);

    function closePanel() {
        sheetRef.current?.close();
    }

    return (
        <BottomSheet
            ref={_ => (sheetRef.current = _)}
            backgroundStyle={{backgroundColor: colors.primary}}
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
            handleComponent={null}
            index={0}
            snapPoints={snap.current}
            enablePanDownToClose
            enableOverDrag={false}
            onClose={unmountPanel}>
            <View style={style.opeartions}>
                <Button
                    onPress={() => {
                        closePanel();
                    }}>
                    取消
                </Button>
                <Button
                    onPress={async () => {
                        const inputValue =
                            input ?? (await Clipboard.getString());
                        if (inputValue) {
                            try {
                                const targetMedia = parseMediaKey(
                                    inputValue.trim(),
                                );
                                // 目标也要写进去
                                const targetCache = Cache.get(targetMedia);
                                if (!targetCache) {
                                    Toast.warn('地址失效了，重新复制一下吧~');
                                    // TODO: ERROR CODE
                                    throw new Error('CLIPBOARD TIMEOUT');
                                }
                                // todo 双向记录
                                await MediaMeta.update(musicItem, {
                                    associatedLrc: targetMedia,
                                });
                                await MediaMeta.update(targetMedia, [
                                    ['lrc', targetCache.lrc],
                                    ['rawLrc', targetCache.rawLrc],
                                    [
                                        '$.local.localLrc',
                                        targetCache.$?.local?.localLrc,
                                    ],
                                ]);
                                Toast.success('关联歌词成功');
                                closePanel();
                            } catch (e: any) {
                                if (e.message !== 'CLIPBOARD TIMEOUT') {
                                    Toast.warn('关联歌词失败');
                                }
                                errorLog('关联歌词失败', e?.message);
                            }
                        }
                    }}>
                    确认
                </Button>
            </View>
            <Divider />
            <BottomSheetTextInput
                value={input}
                onChangeText={_ => {
                    setInput(_);
                }}
                style={[
                    style.input,
                    {
                        color: colors.text,
                        backgroundColor: Color(colors.primary)
                            .lighten(0.7)
                            .toString(),
                    },
                ]}
                placeholderTextColor={colors.textSecondary}
                placeholder={'输入要关联歌词的歌曲ID'}
                maxLength={80}
            />
        </BottomSheet>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
    },
    opeartions: {
        width: rpx(750),
        paddingHorizontal: rpx(24),
        flexDirection: 'row',
        height: rpx(100),
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    input: {
        marginTop: rpx(12),
        marginBottom: rpx(12),
        borderRadius: rpx(12),
        fontSize: fontSizeConst.content,
        lineHeight: fontSizeConst.content * 1.5,
        padding: rpx(12),
    },
});
