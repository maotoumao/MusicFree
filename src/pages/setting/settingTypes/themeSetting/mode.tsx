import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import ThemeText from '@/components/base/themeText';
import Config from '@/core/config';
import {List} from 'react-native-paper';
import ThemeSwitch from '@/components/base/switch';

export default function Mode() {
    const mode = Config.useConfig('setting.theme.mode') ?? 'dark';
    return (
        <View>
            <ThemeText fontSize="title" style={style.header}>
                显示样式
            </ThemeText>
            <View style={style.sectionWrapper}>
                <List.Item
                    title={<ThemeText>深色模式</ThemeText>}
                    right={() => (
                        <ThemeSwitch
                            value={mode === 'dark'}
                            onValueChange={_ => {
                                Config.set(
                                    'setting.theme.mode',
                                    _ ? 'dark' : 'light',
                                );
                            }}
                        />
                    )}
                />
            </View>
        </View>
    );
}

const style = StyleSheet.create({
    header: {
        marginTop: rpx(36),
    },
    sectionWrapper: {
        marginTop: rpx(24),
    },
});
