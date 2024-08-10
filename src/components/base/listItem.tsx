import React, {ReactNode} from 'react';
import {
    StyleProp,
    StyleSheet,
    TextProps,
    TextStyle,
    TouchableHighlight,
    TouchableOpacity,
    View,
    ViewStyle,
} from 'react-native';
import rpx from '@/utils/rpx';
import useColors from '@/hooks/useColors';
import ThemeText from './themeText';
import {
    fontSizeConst,
    fontWeightConst,
    iconSizeConst,
} from '@/constants/uiConst';
import FastImage from './fastImage';
import {ImageStyle} from 'react-native-fast-image';
import Icon, {IIconName} from '@/components/base/icon.tsx';

interface IListItemProps {
    // 是否有左右边距
    withHorizontalPadding?: boolean;
    // 左边距
    leftPadding?: number;
    // 右边距
    rightPadding?: number;
    // height:
    style?: StyleProp<ViewStyle>;
    // 高度类型
    heightType?: 'big' | 'small' | 'smallest' | 'normal' | 'none';
    children?: ReactNode;
    onPress?: () => void;
    onLongPress?: () => void;
}

const defaultPadding = rpx(24);
const defaultActionWidth = rpx(80);

const Size = {
    big: rpx(120),
    normal: rpx(108),
    small: rpx(96),
    smallest: rpx(72),
    none: undefined,
};

function ListItem(props: IListItemProps) {
    const {
        withHorizontalPadding,
        leftPadding = defaultPadding,
        rightPadding = defaultPadding,
        style,
        heightType = 'normal',
        children,
        onPress,
        onLongPress,
    } = props;

    const defaultStyle: StyleProp<ViewStyle> = {
        paddingLeft: withHorizontalPadding ? leftPadding : 0,
        paddingRight: withHorizontalPadding ? rightPadding : 0,
        height: Size[heightType],
    };

    const colors = useColors();

    return (
        <TouchableHighlight
            style={styles.container}
            underlayColor={colors.listActive}
            onPress={onPress}
            onLongPress={onLongPress}>
            <View style={[styles.container, defaultStyle, style]}>
                {children}
            </View>
        </TouchableHighlight>
    );
}

interface IListItemTextProps {
    children?: number | string;
    fontSize?: keyof typeof fontSizeConst;
    fontWeight?: keyof typeof fontWeightConst;
    width?: number;
    position?: 'left' | 'right' | 'none';
    fixedWidth?: boolean;
    containerStyle?: StyleProp<ViewStyle>;
    contentStyle?: StyleProp<TextStyle>;
    contentProps?: TextProps;
}

function ListItemText(props: IListItemTextProps) {
    const {
        children,
        fontSize,
        fontWeight,
        position = 'left',
        fixedWidth,
        width,
        containerStyle,
        contentStyle,
        contentProps = {},
    } = props;

    const defaultStyle: StyleProp<ViewStyle> = {
        marginRight: position === 'left' ? defaultPadding : 0,
        marginLeft: position === 'right' ? defaultPadding : 0,
        width: fixedWidth ? width ?? defaultActionWidth : undefined,
        flexBasis: fixedWidth ? width ?? defaultActionWidth : undefined,
    };

    return (
        <View style={[styles.actionBase, defaultStyle, containerStyle]}>
            <ThemeText
                fontSize={fontSize}
                style={contentStyle}
                fontWeight={fontWeight}
                {...contentProps}>
                {children}
            </ThemeText>
        </View>
    );
}

interface IListItemIconProps {
    icon: IIconName;
    iconSize?: number;
    width?: number;
    position?: 'left' | 'right' | 'none';
    fixedWidth?: boolean;
    containerStyle?: StyleProp<ViewStyle>;
    contentStyle?: StyleProp<TextStyle>;
    onPress?: () => void;
    color?: string;
}

function ListItemIcon(props: IListItemIconProps) {
    const {
        icon,
        iconSize = iconSizeConst.normal,
        position = 'left',
        fixedWidth,
        width,
        containerStyle,
        contentStyle,
        onPress,
        color,
    } = props;

    const colors = useColors();

    const defaultStyle: StyleProp<ViewStyle> = {
        marginRight: position === 'left' ? defaultPadding : 0,
        marginLeft: position === 'right' ? defaultPadding : 0,
        width: fixedWidth ? width ?? defaultActionWidth : undefined,
        flexBasis: fixedWidth ? width ?? defaultActionWidth : undefined,
    };

    const innerContent = (
        <View style={[styles.actionBase, defaultStyle, containerStyle]}>
            <Icon
                name={icon}
                size={iconSize}
                style={contentStyle}
                color={color || colors.text}
            />
        </View>
    );

    return onPress ? (
        <TouchableOpacity onPress={onPress}>{innerContent}</TouchableOpacity>
    ) : (
        innerContent
    );
}

interface IListItemImageProps {
    uri?: string;
    fallbackImg?: number;
    imageSize?: number;
    width?: number;
    position?: 'left' | 'right';
    fixedWidth?: boolean;
    containerStyle?: StyleProp<ViewStyle>;
    contentStyle?: StyleProp<ImageStyle>;
    maskIcon?: IIconName | null;
}

function ListItemImage(props: IListItemImageProps) {
    const {
        uri,
        fallbackImg,
        position = 'left',
        fixedWidth,
        width,
        containerStyle,
        contentStyle,
        maskIcon,
    } = props;

    const defaultStyle: StyleProp<ViewStyle> = {
        marginRight: position === 'left' ? defaultPadding : 0,
        marginLeft: position === 'right' ? defaultPadding : 0,
        width: fixedWidth ? width ?? defaultActionWidth : undefined,
        flexBasis: fixedWidth ? width ?? defaultActionWidth : undefined,
    };

    return (
        <View style={[styles.actionBase, defaultStyle, containerStyle]}>
            <FastImage
                style={[styles.leftImage, contentStyle]}
                uri={uri}
                emptySrc={fallbackImg}
            />
            {maskIcon ? (
                <View style={[styles.leftImage, styles.imageMask]}>
                    <Icon
                        name={maskIcon}
                        size={iconSizeConst.normal}
                        color="red"
                    />
                </View>
            ) : null}
        </View>
    );
}

interface IContentProps {
    title?: ReactNode;
    children?: ReactNode;
    description?: ReactNode;
    containerStyle?: StyleProp<ViewStyle>;
}

function Content(props: IContentProps) {
    const {
        children,
        title = children,
        description = null,
        containerStyle,
    } = props;

    let realTitle;
    let realDescription;

    if (typeof title === 'string' || typeof title === 'number') {
        realTitle = <ThemeText numberOfLines={1}>{title}</ThemeText>;
    } else {
        realTitle = title;
    }

    if (typeof description === 'string' || typeof description === 'number') {
        realDescription = (
            <ThemeText
                numberOfLines={1}
                fontSize="description"
                fontColor="textSecondary"
                style={styles.contentDesc}>
                {description}
            </ThemeText>
        );
    } else {
        realDescription = description;
    }

    return (
        <View style={[styles.itemContentContainer, containerStyle]}>
            {realTitle}
            {realDescription}
        </View>
    );
}

export function ListItemHeader(props: {children?: ReactNode}) {
    const {children} = props;
    return (
        <ListItem
            withHorizontalPadding
            heightType="smallest"
            style={styles.listItemHeader}>
            {typeof children === 'string' ? (
                <ThemeText
                    fontSize="subTitle"
                    fontColor="textSecondary"
                    fontWeight="bold">
                    {children}
                </ThemeText>
            ) : (
                children
            )}
        </ListItem>
    );
}

const styles = StyleSheet.create({
    /** listitem */
    container: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
    },
    /** left */
    actionBase: {
        height: '100%',
        flexShrink: 0,
        flexGrow: 0,
        flexBasis: 0,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },

    leftImage: {
        width: rpx(80),
        height: rpx(80),
        borderRadius: rpx(16),
    },
    imageMask: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#00000022',
    },
    itemContentContainer: {
        flex: 1,
        height: '100%',
        justifyContent: 'center',
    },
    contentDesc: {
        marginTop: rpx(16),
    },

    listItemHeader: {
        marginTop: rpx(20),
    },
});

ListItem.Size = Size;
ListItem.ListItemIcon = ListItemIcon;
ListItem.ListItemImage = ListItemImage;
ListItem.ListItemText = ListItemText;
ListItem.Content = Content;

export default ListItem;
