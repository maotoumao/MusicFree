import React, {useEffect} from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import {useAtomValue} from 'jotai';
import {scrollToTopAtom} from '../store/atoms';
import {Avatar} from 'react-native-paper';
import ThemeText from '@/components/base/themeText';
import Tag from '@/components/base/tag';
import {useParams} from '@/entry/router';

const headerHeight = rpx(350);

interface IHeaderProps {
    neverFold?: boolean;
}

export default function Header(props: IHeaderProps) {
    const {neverFold} = props;

    const {artistItem} = useParams<'artist-detail'>();

    const heightValue = useSharedValue(headerHeight);
    const opacityValue = useSharedValue(1);
    const scrollToTopState = useAtomValue(scrollToTopAtom);

    const heightStyle = useAnimatedStyle(() => {
        return {
            height: heightValue.value,
            opacity: opacityValue.value,
        };
    });

    const avatar = artistItem.avatar?.startsWith('//')
        ? `https:${artistItem.avatar}`
        : artistItem.avatar;

    /** 折叠 */
    useEffect(() => {
        if (neverFold) {
            heightValue.value = withTiming(headerHeight);
            opacityValue.value = withTiming(1);
            return;
        }
        if (scrollToTopState) {
            heightValue.value = withTiming(headerHeight);
            opacityValue.value = withTiming(1);
        } else {
            heightValue.value = withTiming(0);
            opacityValue.value = withTiming(0);
        }
    }, [scrollToTopState, neverFold]);

    return (
        <Animated.View style={[style.wrapper, heightStyle]}>
            <View style={style.headerWrapper}>
                <Avatar.Image size={rpx(144)} source={{uri: avatar}} />
                <View style={style.info}>
                    <View style={style.title}>
                        <ThemeText
                            fontSize="title"
                            style={style.titleText}
                            numberOfLines={1}
                            ellipsizeMode="tail">
                            {artistItem?.name ?? ''}
                        </ThemeText>
                        {artistItem.platform ? (
                            <Tag tagName={artistItem.platform} />
                        ) : null}
                    </View>

                    {artistItem.fans ? (
                        <ThemeText fontSize="subTitle" fontColor="secondary">
                            粉丝数: {artistItem.fans}
                        </ThemeText>
                    ) : null}
                </View>
            </View>

            <ThemeText
                style={style.description}
                numberOfLines={2}
                ellipsizeMode="tail"
                fontColor="secondary"
                fontSize="description">
                {artistItem?.description ?? ''}
            </ThemeText>
        </Animated.View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        height: headerHeight,
        backgroundColor: 'rgba(28, 28, 28, 0.1)',
        zIndex: 1,
    },
    headerWrapper: {
        width: rpx(750),
        paddingTop: rpx(24),
        paddingHorizontal: rpx(24),
        height: rpx(240),
        flexDirection: 'row',
        alignItems: 'center',
    },
    info: {
        marginLeft: rpx(24),
        justifyContent: 'space-around',
        height: rpx(144),
    },
    title: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    titleText: {
        marginRight: rpx(18),
        maxWidth: rpx(400),
    },
    description: {
        marginTop: rpx(24),
        width: rpx(750),
        paddingHorizontal: rpx(24),
    },
});
