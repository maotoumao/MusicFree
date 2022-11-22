import React, {useRef, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import BottomSheet, {
    BottomSheetBackdrop,
    BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import {Divider} from 'react-native-paper';
import {fontSizeConst} from '@/constants/uiConst';
import Color from 'color';
import Button from '@/components/base/button';
import useColors from '@/hooks/useColors';
import {BottomSheetMethods} from '@gorhom/bottom-sheet/lib/typescript/types';
import usePanel from '../usePanel';

interface ISimpleInputProps {
    onOk: (text: string, closePanel: () => void) => void;
    onCancel?: () => void;
    maxLength?: number;
    placeholder?: string;
}
export default function SimpleInput(props: ISimpleInputProps) {
    const {onOk, onCancel, placeholder, maxLength = 80} = props;
    const sheetRef = useRef<BottomSheetMethods | null>();
    const {unmountPanel} = usePanel();
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
                        onCancel?.();
                        closePanel();
                    }}>
                    取消
                </Button>
                <Button
                    onPress={async () => {
                        onOk(input, closePanel);
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
                placeholder={placeholder ?? ''}
                maxLength={maxLength}
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
