import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import rpx, {vmax} from '@/utils/rpx';
import {Divider} from 'react-native-paper';
import MusicSheet from '@/core/musicSheet';
import {fontSizeConst} from '@/constants/uiConst';
import Color from 'color';
import Button from '@/components/base/button';
import useColors from '@/hooks/useColors';

import PanelBase from '../base/panelBase';
import {TextInput} from 'react-native-gesture-handler';
import {hidePanel} from '../usePanel';

interface INewMusicSheetProps {
    defaultName?: string;
    onSheetCreated?: (sheetId: string) => void;
    onCancel?: () => void;
}

export default function NewMusicSheet(props: INewMusicSheetProps) {
    const {onSheetCreated, onCancel, defaultName = '新建歌单'} = props;

    const [input, setInput] = useState('');
    const colors = useColors();

    return (
        <PanelBase
            height={vmax(30)}
            renderBody={() => (
                <>
                    <View style={style.operations}>
                        <Button
                            onPress={() => {
                                onCancel ? onCancel() : hidePanel();
                            }}>
                            取消
                        </Button>
                        <Button
                            onPress={async () => {
                                const sheetId = await MusicSheet.addSheet(
                                    input || defaultName,
                                );
                                onSheetCreated?.(sheetId);
                                hidePanel();
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
                        accessible
                        accessibilityLabel="输入框"
                        accessibilityHint={'新建歌单'}
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
                        placeholder={defaultName}
                        maxLength={12}
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
    operations: {
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
