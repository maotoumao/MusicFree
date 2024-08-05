import React from 'react';
import {Appearance, StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import ThemeText from '@/components/base/themeText';
import ListItem from '@/components/base/listItem';
import ThemeSwitch from '@/components/base/switch';
import Config from '@/core/config';
import Theme from '@/core/theme';

export default function Mode() {
    const mode = Config.useConfig('setting.theme.followSystem') ?? false;
    return (
        <View>
            <ThemeText
                fontSize="subTitle"
                fontWeight="bold"
                style={styles.header}>
                显示样式
            </ThemeText>
            <View style={styles.sectionWrapper}>
                <ListItem withHorizontalPadding>
                    <ListItem.Content>
                        <View style={styles.itemRow}>
                            <ThemeText>跟随系统深色设置</ThemeText>
                            <ThemeSwitch
                                value={mode}
                                onValueChange={e => {
                                    if (e) {
                                        const colorScheme =
                                            Appearance.getColorScheme();
                                        if (colorScheme === 'dark') {
                                            Theme.setTheme('p-dark');
                                        } else if (colorScheme === 'light') {
                                            Theme.setTheme('p-light');
                                        }
                                    }
                                    Config.set('setting.theme.followSystem', e);
                                }}
                            />
                        </View>
                    </ListItem.Content>
                </ListItem>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        paddingLeft: rpx(24),
        marginTop: rpx(36),
    },
    sectionWrapper: {
        marginTop: rpx(24),
    },
    itemRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
});
