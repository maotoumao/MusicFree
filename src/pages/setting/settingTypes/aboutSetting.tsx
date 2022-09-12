import React from 'react';
import {Image, StyleSheet, TouchableOpacity, View} from 'react-native';
import rpx from '@/utils/rpx';
import {ImgAsset} from '@/constants/assetsConst';
import ThemeText from '@/components/base/themeText';
import deviceInfoModule from 'react-native-device-info';
import {ScrollView} from 'react-native-gesture-handler';
import LinkText from '@/components/base/linkText';
import useCheckUpdate from '@/hooks/useCheckUpdate';

export default function AboutSetting() {
    const checkAndShowResult = useCheckUpdate();

    return (
        <View style={style.wrapper}>
            <View style={style.header}>
                <TouchableOpacity
                    onPress={() => {
                        checkAndShowResult(true);
                    }}>
                    <Image
                        source={ImgAsset.logo}
                        style={style.image}
                        resizeMode="contain"
                    />
                </TouchableOpacity>
                <ThemeText style={style.margin}>
                    当前版本: {deviceInfoModule.getVersion()} (点击logo检查更新)
                </ThemeText>
            </View>
            <ScrollView style={style.scrollView}>
                <ThemeText fontSize="title">开发者的话: </ThemeText>
                <ThemeText style={style.content}>
                    首先感谢你使用这款软件。开发这款软件的初衷首先是满足自己日常的需求，顺便分享出来，如果能对更多人有帮助那再好不过。
                </ThemeText>
                <ThemeText style={style.content}>
                    本软件完全免费，并基于GPL协议开源，仅供学习参考使用，不可用于商业目的。代码地址如下，如果打不开试试把github换成gitee:
                </ThemeText>
                <LinkText linkTo={'https://github.com/maotoumao/MusicFree'}>
                    https://github.com/maotoumao/MusicFree
                </LinkText>
                <ThemeText style={style.content}>
                    本软件需要通过插件来完成包括播放、搜索在内的大部分功能，如果你是从第三方下载的插件，
                    <ThemeText fontWeight="bold">
                        请一定谨慎识别这些插件的安全性，保护好自己
                    </ThemeText>
                    。
                </ThemeText>
                <ThemeText style={style.content}>
                    如果你对这款软件有一些建议，无论是设计（自己设计的实在太丑...）、逻辑还是交互；或者有一些bug需要反馈，又或者想一起写代码，欢迎加QQ群
                    <LinkText linkTo="https://qm.qq.com/cgi-bin/qm/qr?k=O9R33tW_lrx85ng-mtlqV6awSbEvaFJP&authKey=SchXj8Uz5sHL4JcfORmfwgvp0BAPoZ9vZsPoHimAlFo%2F8GPQOIoOKWpbS1ZepM2S&noverify=0&group_code=252994941">
                        252994941
                    </LinkText>
                    ，也可以在github的issue区反馈；最新的进展可能会在b站:{' '}
                    <LinkText
                        fontWeight="semibold"
                        linkTo="https://space.bilibili.com/12866223">
                        不想睡觉猫头猫
                    </LinkText>{' '}
                    或者上边的QQ群更新，感兴趣的话就点个关注吧orz~
                </ThemeText>
                <ThemeText style={style.content}>
                    最后，如果真的有人看到这里，希望这款软件可以帮到你，这也是这款软件存在的意义。
                </ThemeText>
                <ThemeText style={style.content}>by: 猫头猫</ThemeText>
            </ScrollView>
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        flex: 1,
    },
    header: {
        width: rpx(750),
        height: rpx(350),
        justifyContent: 'center',
        alignItems: 'center',
    },
    image: {
        width: rpx(150),
        height: rpx(150),
        borderRadius: rpx(28),
    },
    margin: {
        marginTop: rpx(24),
    },
    content: {
        marginTop: rpx(24),
        lineHeight: rpx(48),
    },
    scrollView: {
        flex: 1,
        paddingHorizontal: rpx(24),
        paddingVertical: rpx(48),
    },
});
