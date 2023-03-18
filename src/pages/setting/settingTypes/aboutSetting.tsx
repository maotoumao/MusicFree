import React from 'react';
import {
    Image,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';
import rpx from '@/utils/rpx';
import {ImgAsset} from '@/constants/assetsConst';
import ThemeText from '@/components/base/themeText';
import deviceInfoModule from 'react-native-device-info';
import LinkText from '@/components/base/linkText';
import useCheckUpdate from '@/hooks/useCheckUpdate';
import useOrientation from '@/hooks/useOrientation';

export default function AboutSetting() {
    const checkAndShowResult = useCheckUpdate();
    const orientation = useOrientation();

    return (
        <View
            style={[
                style.wrapper,
                orientation === 'horizonal'
                    ? {
                          flexDirection: 'row',
                      }
                    : null,
            ]}>
            <View
                style={[
                    style.header,
                    orientation === 'horizonal' ? style.horizonalSize : null,
                ]}>
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
            <ScrollView
                contentContainerStyle={style.scrollViewContainer}
                style={style.scrollView}>
                <ThemeText fontSize="title">开发者的话: </ThemeText>
                <ThemeText style={style.content}>
                    首先感谢你使用这款软件。开发这款软件的初衷首先是满足自己日常的需求，顺便分享出来，如果能对更多人有帮助那再好不过。简单的介绍视频可以戳
                    <LinkText linkTo="https://mp.weixin.qq.com/s/sH_2vRm7EyBGgWggkJmsdg">
                        这里
                    </LinkText>
                    ，是公众号链接，如果要了解后续更新的话，点个关注也行。
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
                        请一定谨慎识别这些插件的安全性，保护好自己。（注意：插件以及插件可能产生的数据与本软件无关，请使用者合理合法使用。）
                    </ThemeText>
                </ThemeText>
                <ThemeText style={style.content}>
                    如果你对这款软件有一些建议，无论是设计（自己设计的实在太丑...）、逻辑还是交互；或者有一些bug需要反馈、了解一些最新进展，请移步Github仓库或直接公众号留言（不一定看得到）。
                </ThemeText>
                <Image
                    source={ImgAsset.wechatChannel}
                    style={style.wcChannel}
                />
                <ThemeText style={style.content}>
                    <ThemeText fontWeight="bold">
                        还请注意本软件只是个人的业余项目，距离正式版也有很长一段距离。
                    </ThemeText>
                    如果你在找成熟稳定的音乐软件，可以考虑其他优秀的软件。当然我会一直维护，让它变得尽可能的完善一些。业余时间用爱发电，进度慢还请见谅。
                </ThemeText>
                <ThemeText style={style.content}>
                    如果是技术交流或者技术向的闲聊的话，欢迎加QQ群(Github
                    Readme自取)，也可以直接发邮件;)
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
        width: '100%',
        flex: 1,
    },
    header: {
        width: rpx(750),
        height: rpx(350),
        justifyContent: 'center',
        alignItems: 'center',
    },
    horizonalSize: {
        width: rpx(600),
        height: '100%',
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
    wcChannel: {
        width: rpx(330),
        height: rpx(330),
        marginLeft: rpx(210),
        marginTop: rpx(24),
    },
    scrollView: {
        flex: 1,
        paddingHorizontal: rpx(24),
        paddingVertical: rpx(48),
    },
    scrollViewContainer: {
        paddingBottom: rpx(96),
    },
});
