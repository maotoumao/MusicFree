import React, {useState} from 'react';
import ThemeText from '@/components/base/themeText';
import {StyleSheet, View} from 'react-native';
import rpx, {vh} from '@/utils/rpx';
import {ScrollView, TouchableOpacity} from 'react-native-gesture-handler';
import {hideDialog} from '../useDialog';
import Checkbox from '@/components/base/checkbox';
import Dialog from './base';
import PersistStatus from '@/core/persistStatus.ts';
import NativeUtils from '@/native/utils';

export default function CheckStorage() {
    const [skipState, setSkipState] = useState(false);

    const onCancel = () => {
        if (skipState) {
            PersistStatus.set('app.skipBootstrapStorageDialog', true);
        }
        hideDialog();
    };

    return (
        <Dialog onDismiss={onCancel}>
            <Dialog.Title stringContent>存储权限</Dialog.Title>
            <ScrollView style={styles.scrollView}>
                <ThemeText style={styles.item}>
                    MusicFree
                    需要文件读写权限来进行歌单备份到本地、歌曲下载等操作。
                </ThemeText>
                <ThemeText style={styles.item}>
                    点击「去授予权限」跳转至设置界面授予文件管理权限。
                </ThemeText>
                <ThemeText style={styles.item}>
                    如果您不需要备份歌单或者下载歌曲，您也可以暂时不授予此权限。
                </ThemeText>
                <ThemeText style={styles.item}>
                    您可以随时在侧边栏「权限管理」-{'>'}
                    「文件读写权限」授予或取消授予权限。
                </ThemeText>
            </ScrollView>

            <TouchableOpacity
                style={styles.checkBox}
                onPress={() => {
                    setSkipState(state => !state);
                }}>
                <View style={styles.checkboxGroup}>
                    <Checkbox checked={skipState} />
                    <ThemeText style={styles.checkboxHint}>不再提示</ThemeText>
                </View>
            </TouchableOpacity>

            <Dialog.Actions
                actions={[
                    {
                        title: '取消',
                        type: 'normal',
                        onPress: onCancel,
                    },
                    {
                        title: '去授予权限',
                        type: 'primary',
                        onPress: () => {
                            NativeUtils.requestStoragePermission();
                            hideDialog();
                        },
                    },
                ]}
            />
        </Dialog>
    );
}

const styles = StyleSheet.create({
    item: {
        marginBottom: rpx(20),
        lineHeight: rpx(36),
    },

    scrollView: {
        maxHeight: vh(40),
        paddingHorizontal: rpx(26),
    },
    checkBox: {
        marginHorizontal: rpx(24),
        marginVertical: rpx(36),
    },
    checkboxGroup: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    checkboxHint: {
        marginLeft: rpx(12),
    },
});
