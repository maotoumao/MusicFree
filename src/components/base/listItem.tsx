import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import {List} from 'react-native-paper';
import Tag from './tag';
import ThemeText from './themeText';
import IconButton from './iconButton';
import FastImage from './fastImage';
import {fontSizeConst} from '@/constants/uiConst';

export interface ILeftProps {
    /** 序号 */
    index?: number | string;
    /** 封面图 */
    artwork?: string;
    /** 封面图的兜底 */
    fallback?: any;
    /** icon */
    icon?: Parameters<typeof IconButton>[0];
    /** 宽度 */
    width?: number;
    /** 组件 */
    component?: () => JSX.Element;
}

function Left(props?: ILeftProps) {
    const {
        index,
        artwork,
        fallback,
        icon,
        width = rpx(100),
        component: Component,
    } = props ?? {};

    return props && Object.keys(props).length ? (
        Component ? (
            <Component />
        ) : (
            <View style={[leftStyle.artworkWrapper, {width}]}>
                {index !== undefined ? (
                    <ThemeText
                        fontColor="secondary"
                        style={{
                            fontStyle: 'italic',
                            fontSize: Math.min(
                                (width / `${index}`.length) * 0.8,
                                fontSizeConst.content,
                            ),
                        }}>
                        {index}
                    </ThemeText>
                ) : icon !== undefined ? (
                    <IconButton {...icon} />
                ) : (
                    <FastImage
                        style={leftStyle.artwork}
                        uri={
                            artwork?.startsWith('//')
                                ? `https:${artwork}`
                                : artwork
                        }
                        emptySrc={fallback}
                    />
                )}
            </View>
        )
    ) : null;
}

const leftStyle = StyleSheet.create({
    artworkWrapper: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    artwork: {
        width: rpx(76),
        height: rpx(76),
        borderRadius: rpx(16),
    },
});

/** 歌单item */
interface IListItemProps {
    /** 标题 */
    title: string | number;
    /** 描述 */
    desc?: string | JSX.Element;
    /** 标签 */
    tag?: string;
    left?: ILeftProps;
    /** 右侧按钮 */
    right?: () => JSX.Element;
    itemPaddingHorizontal?: number;
    itemPaddingLeft?: number;
    itemPaddingRight?: number;
    itemWidth?: number | string;
    itemHeight?: number;
    itemBackgroundColor?: string;
    onPress?: () => void;
    onLongPress?: () => void;
}

export default function ListItem(props: IListItemProps) {
    const {
        title,
        desc,
        tag,
        right,
        itemWidth,
        itemHeight,
        onPress,
        onLongPress,
        left,
        itemBackgroundColor,
        itemPaddingHorizontal = rpx(24),
        itemPaddingLeft,
        itemPaddingRight,
    } = props;

    return (
        <List.Item
            onLongPress={onLongPress}
            left={() => <Left {...(left ?? {})} />}
            style={[
                style.wrapper,
                {
                    paddingHorizontal: itemPaddingHorizontal,
                    paddingLeft: itemPaddingLeft,
                    paddingRight: itemPaddingRight,
                    width: itemWidth,
                    height: itemHeight ?? rpx(120),
                    paddingVertical: 0,
                    backgroundColor: itemBackgroundColor,
                },
            ]}
            title={() => (
                <View
                    style={{
                        alignItems: 'stretch',
                        justifyContent: 'center',
                        height: itemHeight ?? rpx(120),
                        marginRight: right ? rpx(18) : 0,
                    }}>
                    <View style={style.titleWrapper}>
                        <ThemeText numberOfLines={1} style={style.titleText}>
                            {title}
                        </ThemeText>
                        {tag ? <Tag tagName={tag} /> : null}
                    </View>
                    {desc ? (
                        <ThemeText
                            fontColor="secondary"
                            fontSize="description"
                            numberOfLines={1}
                            style={style.descText}>
                            {desc}
                        </ThemeText>
                    ) : null}
                </View>
            )}
            titleStyle={{
                paddingVertical: 0,
                marginLeft: 0,
                marginVertical: 0,
            }}
            right={right ? right : () => null}
            onPress={onPress}
        />
    );
}
const style = StyleSheet.create({
    wrapper: {
        justifyContent: 'center',
        width: '100%',
    },
    titleWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    titleText: {
        flex: 1,
        paddingRight: rpx(12),
    },
    descText: {
        marginTop: rpx(18),
    },
    artworkWrapper: {
        width: rpx(76),
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: rpx(12),
    },
    artwork: {
        width: rpx(76),
        height: rpx(76),
        borderRadius: rpx(16),
    },
});
