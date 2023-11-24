import React, {useState} from 'react';
import {DeviceEventEmitter, StyleSheet, View} from 'react-native';
import rpx, {vmax} from '@/utils/rpx';

import {fontSizeConst} from '@/constants/uiConst';
import Button from '@/components/base/button';
import useColors from '@/hooks/useColors';
import Clipboard from '@react-native-clipboard/clipboard';
import {errorLog} from '@/utils/log';
import {associateLrc, parseMediaKey} from '@/utils/mediaItem';
import Cache from '@/core/cache';
import Toast from '@/utils/toast';
import PanelBase from '../base/panelBase';
import {TextInput} from 'react-native-gesture-handler';
import {hidePanel} from '../usePanel';
import {EDeviceEvents} from '@/constants/commonConst';
import Divider from '@/components/base/divider';

interface INewMusicSheetProps {
    musicItem: IMusic.IMusicItem;
}

export default function AssociateLrc(props: INewMusicSheetProps) {
    const {musicItem} = props;

    const [input, setInput] = useState('');
    const colors = useColors();

    return (
        <PanelBase
            height={vmax(30)}
            renderBody={() => (
                <>
                    <View style={style.opeartions}>
                        <Button
                            onPress={() => {
                                hidePanel();
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
                                        const targetCache =
                                            Cache.get(targetMedia);
                                        if (!targetCache) {
                                            Toast.warn(
                                                '地址失效了，重新复制一下吧~',
                                            );
                                            // TODO: ERROR CODE
                                            throw new Error(
                                                'CLIPBOARD TIMEOUT',
                                            );
                                        }
                                        await associateLrc(musicItem, {
                                            ...targetMedia,
                                            ...targetCache,
                                        });
                                        Toast.success('关联歌词成功');
                                        DeviceEventEmitter.emit(
                                            EDeviceEvents.REFRESH_LYRIC,
                                        );
                                        hidePanel();
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
                    <TextInput
                        value={input}
                        onChangeText={_ => {
                            setInput(_);
                        }}
                        style={[
                            style.input,
                            {
                                color: colors.text,
                                backgroundColor: colors.placeholder,
                            },
                        ]}
                        placeholderTextColor={colors.textSecondary}
                        placeholder={'输入要关联歌词的歌曲ID'}
                        maxLength={80}
                    />
                </>
            )}
        />
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
        margin: rpx(24),
        borderRadius: rpx(12),
        fontSize: fontSizeConst.content,
        lineHeight: fontSizeConst.content * 1.5,
        padding: rpx(12),
    },
});
