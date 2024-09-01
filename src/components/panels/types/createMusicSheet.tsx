import React, {useState} from 'react';
import {StyleSheet} from 'react-native';
import rpx, {vmax} from '@/utils/rpx';
import {fontSizeConst} from '@/constants/uiConst';
import useColors from '@/hooks/useColors';

import PanelBase from '../base/panelBase';
import {TextInput} from 'react-native-gesture-handler';
import {hidePanel} from '../usePanel';
import PanelHeader from '../base/panelHeader';
import MusicSheet from '@/core/musicSheet';

interface ICreateMusicSheetProps {
    defaultName?: string;
    onSheetCreated?: (sheetId: string) => void;
    onCancel?: () => void;
}

export default function CreateMusicSheet(props: ICreateMusicSheetProps) {
    const {onSheetCreated, onCancel, defaultName = '新建歌单'} = props;

    const [input, setInput] = useState('');
    const colors = useColors();

    return (
        <PanelBase
            height={vmax(30)}
            keyboardAvoidBehavior="height"
            renderBody={() => (
                <>
                    <PanelHeader
                        title="新建歌单"
                        onCancel={() => {
                            onCancel ? onCancel() : hidePanel();
                        }}
                        onOk={async () => {
                            const sheetId = await MusicSheet.addSheet(
                                input || defaultName,
                            );
                            onSheetCreated?.(sheetId);
                            hidePanel();
                        }}
                    />
                    <TextInput
                        value={input}
                        onChangeText={_ => {
                            setInput(_);
                        }}
                        autoFocus
                        accessible
                        accessibilityLabel="输入框"
                        accessibilityHint={'新建歌单'}
                        style={[
                            style.input,
                            {
                                color: colors.text,
                                backgroundColor: colors.placeholder,
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
