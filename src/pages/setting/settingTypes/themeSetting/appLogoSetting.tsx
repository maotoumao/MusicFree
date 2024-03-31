import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import ThemeText from '@/components/base/themeText';
import PersistStatus from '@/core/persistStatus';
import LogoCard from './logoCard';
import {ImgAsset} from '@/constants/assetsConst';
import AppIconUtil from '@/native/appIconUtil';

export default function AppLogoSetting() {
    const logo = PersistStatus.useValue('app.logo', 'Default');

    return (
        <View>
            <ThemeText
                fontSize="subTitle"
                fontWeight="bold"
                style={styles.header}>
                切换软件logo
            </ThemeText>
            <View style={styles.logoContainer}>
                <LogoCard
                    selected={logo === 'Default'}
                    logo={ImgAsset.logo}
                    onPress={() => {
                        if (logo !== 'Default') {
                            AppIconUtil.changeIcon('Default').then(() => {
                                PersistStatus.set('app.logo', 'Default');
                            });
                        }
                    }}
                    title="默认"
                />
                <LogoCard
                    selected={logo === 'Logo1'}
                    logo={ImgAsset.logo1}
                    onPress={() => {
                        if (logo !== 'Logo1') {
                            AppIconUtil.changeIcon('Logo1').then(() => {
                                PersistStatus.set('app.logo', 'Logo1');
                            });
                        }
                    }}
                    title="Logo1"
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        marginTop: rpx(36),
        paddingLeft: rpx(24),
    },
    logoContainer: {
        marginTop: rpx(36),
        flexDirection: 'row',
        paddingHorizontal: rpx(24),
    },
});
