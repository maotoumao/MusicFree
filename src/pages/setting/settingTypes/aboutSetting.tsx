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
import LinkText from '@/components/base/linkText';
import useCheckUpdate from '@/hooks/useCheckUpdate.ts';
import useOrientation from '@/hooks/useOrientation';
import Divider from '@/components/base/divider';

export default function AboutSetting() {
    const checkAndShowResult = useCheckUpdate();
    const orientation = useOrientation();

    return (
        <View
            style={[
                style.wrapper,
                orientation === 'horizontal'
                    ? {
                          flexDirection: 'row',
                      }
                    : null,
            ]}>
            <View
                style={[
                    style.header,
                    orientation === 'horizontal' ? style.horizontalSize : null,
                ]}>
                <TouchableOpacity
                    onPress={() => {
                        checkAndShowResult(true);
                    }}>
                    <Image
                        source={ImgAsset.author}
                        style={style.image}
                        resizeMode="contain"
                    />
                </TouchableOpacity>
                <ThemeText style={style.margin}>软件作者: 猫头猫</ThemeText>
                <ThemeText style={style.margin}>
                    公众号: 【一只猫头猫】
                </ThemeText>
                <ThemeText style={style.margin}>
                    B站:{' '}
                    <LinkText linkTo="https://space.bilibili.com/12866223">
                        不想睡觉猫头猫
                    </LinkText>
                </ThemeText>
            </View>
            <ScrollView
                contentContainerStyle={style.scrollViewContainer}
                style={style.scrollView}>
                <ThemeText fontSize="title">开发者的话: </ThemeText>
                <ThemeText style={style.content}>
                    软件作者是<ThemeText fontWeight="bold">猫头猫</ThemeText>
                    🐱，不是猫头鹰🦉，也不是什么其他的奇奇怪怪。软件没有其他版本，如果你下载到了付费版/广告版/挂羊头卖狗肉版，那说明你被坏蛋骗了😒。
                </ThemeText>
                <ThemeText style={style.content}>
                    软件相关信息会发布在公众号【
                    <ThemeText fontWeight="bold">一只猫头猫</ThemeText>
                    】中👇，也简单做了个
                    <LinkText linkTo="https://musicfree.catcat.work">
                        官方网站
                    </LinkText>
                    。（手机版和桌面版的）下载地址、使用方式、插件开发方式、常见问题都在站点中。
                </ThemeText>
                <Image
                    source={ImgAsset.wechatChannel}
                    style={style.wcChannel}
                />
                <Divider style={style.content} />

                <ThemeText style={style.content}>
                    本软件完全免费，并基于{' '}
                    <ThemeText fontWeight="bold">AGPL3.0 协议</ThemeText>{' '}
                    开源，如果需要使用此代码进行二次开发，请遵守如下约定：
                </ThemeText>

                <ThemeText style={style.content}>
                    1. 二次分发版必须同样遵循 AGPL 3.0 协议，开源且免费
                </ThemeText>
                <ThemeText style={style.content}>
                    2. 合法合规使用代码，不要用于商业用途;
                    修改后的软件造成的任何问题由使用此代码的开发者承担
                </ThemeText>
                <ThemeText style={style.content}>
                    3.
                    打包、二次分发时请保留代码出处：https://github.com/maotoumao/MusicFree
                </ThemeText>
                <ThemeText style={style.content}>
                    4. 如果开源协议变更，将在此 Github 仓库更新，不另行通知
                </ThemeText>
                <ThemeText style={style.content}>
                    代码已开源到{' '}
                    <LinkText linkTo="https://github.com/maotoumao/MusicFree">
                        Github
                    </LinkText>
                    ，如果打不开试试把链接中的 github 换成 gitee。
                </ThemeText>

                <Divider style={style.content} />

                <ThemeText style={style.content}>
                    本软件需要通过插件来完成包括播放、搜索在内的大部分功能，如果你是从第三方下载的插件，
                    <ThemeText fontWeight="bold">
                        请一定谨慎识别这些插件的安全性，保护好自己。（注意：插件以及插件可能产生的数据与本软件无关，请使用者合理合法使用。）
                    </ThemeText>
                </ThemeText>

                <ThemeText style={style.content}>
                    <ThemeText fontWeight="bold">
                        还请注意本软件只是个人的业余项目，距离正式版也有很长一段距离。
                    </ThemeText>
                    如果你在找成熟稳定的音乐软件，可以考虑其他优秀的软件。当然我会一直维护，让它变得尽可能的完善一些。业余时间用爱发电，进度慢还请见谅。
                </ThemeText>

                <ThemeText style={style.content}>
                    如果有问题或者建议，可以直接去 Github issue
                    区留言，也可以去公众号【一只猫头猫】留言，也可以去{' '}
                    <LinkText linkTo="https://qun.qq.com/qqweb/qunpro/share?_wv=3&_wwv=128&appChannel=share&inviteCode=1XgzeY8LfIa&businessType=9&from=246610&biz=ka&mainSourceId=share&subSourceId=others&jumpsource=shorturl">
                        QQ 频道
                    </LinkText>{' '}
                    发帖。
                </ThemeText>

                <ThemeText style={style.content}>
                    开发这个软件的最初目的是自用，顺便分享出来给有需要的人。如果这个软件能对你有些帮助，那这就是
                    MusicFree 存在的意义。
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
        height: rpx(400),
        justifyContent: 'center',
        alignItems: 'center',
    },
    horizontalSize: {
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
