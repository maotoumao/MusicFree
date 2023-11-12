import React, {useRef} from 'react';
import {StyleSheet, View} from 'react-native';
import rpx, {vmax} from '@/utils/rpx';
import Button from '@/components/base/button';
import useColors from '@/hooks/useColors';

import ThemeText from '@/components/base/themeText';
import {ScrollView} from 'react-native-gesture-handler';
import PanelBase from '../base/panelBase';
import {hidePanel} from '../usePanel';
import Divider from '@/components/base/divider';
import ListItem from '@/components/base/listItem';
import Input from '@/components/base/input';

interface IUserVariablesProps {
    onOk: (values: Record<string, string>, closePanel: () => void) => void;
    variables: IPlugin.IUserVariable[];
    initValues?: Record<string, string>;
    onCancel?: () => void;
}

export default function SetUserVariables(props: IUserVariablesProps) {
    const {onOk, onCancel, variables, initValues = {}} = props;

    const colors = useColors();

    const resultRef = useRef({...initValues});

    return (
        <PanelBase
            height={vmax(80)}
            renderBody={() => (
                <>
                    <View style={styles.opeartions}>
                        <Button
                            onPress={() => {
                                onCancel?.();
                                hidePanel();
                            }}>
                            取消
                        </Button>
                        <Button
                            onPress={async () => {
                                onOk(resultRef.current, hidePanel);
                            }}>
                            确认
                        </Button>
                    </View>
                    <Divider />
                    <ScrollView>
                        {variables.map(it => (
                            <ListItem
                                withHorizonalPadding
                                style={styles.listItem}>
                                <ThemeText
                                    numberOfLines={1}
                                    ellipsizeMode="tail"
                                    style={styles.varName}>
                                    {it.name ?? it.key}
                                </ThemeText>
                                <Input
                                    defaultValue={initValues[it.key]}
                                    onChangeText={e => {
                                        resultRef.current[it.key] = e;
                                    }}
                                    style={[
                                        styles.input,
                                        {backgroundColor: colors.placeholder},
                                    ]}
                                />
                            </ListItem>
                        ))}
                    </ScrollView>
                </>
            )}
        />
    );
}

const styles = StyleSheet.create({
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
    listItem: {
        justifyContent: 'space-between',
    },
    varName: {
        maxWidth: '35%',
    },
    input: {
        width: '50%',
        paddingVertical: rpx(8),
        paddingHorizontal: rpx(12),
        borderRadius: rpx(8),
    },
});
