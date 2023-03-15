import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import rpx, {vmax} from '@/utils/rpx';
import {Divider} from 'react-native-paper';
import {fontSizeConst} from '@/constants/uiConst';
import Color from 'color';
import Button from '@/components/base/button';
import useColors from '@/hooks/useColors';
import usePanel from '../usePanel';
import ThemeText from '@/components/base/themeText';
import {ScrollView, TextInput} from 'react-native-gesture-handler';
import PanelBase from '../base/panelBase';

interface ISimpleInputProps {
    onOk: (text: string, closePanel: () => void) => void;
    hints?: string[];
    onCancel?: () => void;
    maxLength?: number;
    placeholder?: string;
}

export default function SimpleInput(props: ISimpleInputProps) {
    const {onOk, onCancel, placeholder, maxLength = 80, hints} = props;
    const {hidePanel} = usePanel();
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
                                onCancel?.();
                                hidePanel();
                            }}>
                            取消
                        </Button>
                        <Button
                            onPress={async () => {
                                onOk(input, hidePanel);
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
                                backgroundColor: Color(colors.primary)
                                    .lighten(0.7)
                                    .toString(),
                            },
                        ]}
                        placeholderTextColor={colors.textSecondary}
                        placeholder={placeholder ?? ''}
                        maxLength={maxLength}
                    />
                    <ScrollView>
                        {hints?.length ? (
                            <View style={style.hints}>
                                {hints.map((_, index) => (
                                    <ThemeText
                                        key={`hint-index-${index}`}
                                        style={style.hintLine}
                                        fontSize="subTitle"
                                        fontColor="secondary">
                                        ￮ {_}
                                    </ThemeText>
                                ))}
                            </View>
                        ) : null}
                    </ScrollView>
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
        marginTop: rpx(12),
        marginBottom: rpx(12),
        borderRadius: rpx(12),
        fontSize: fontSizeConst.content,
        lineHeight: fontSizeConst.content * 1.5,
        padding: rpx(12),
    },
    hints: {
        marginTop: rpx(24),
        paddingHorizontal: rpx(24),
    },
    hintLine: {
        marginBottom: rpx(12),
    },
});
