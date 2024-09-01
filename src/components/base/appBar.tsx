import React, {ReactNode, useEffect, useState} from 'react';
import {
    LayoutRectangle,
    StatusBar as OriginalStatusBar,
    StyleProp,
    StyleSheet,
    TouchableWithoutFeedback,
    View,
    ViewStyle,
} from 'react-native';
import rpx from '@/utils/rpx';
import useColors from '@/hooks/useColors';
import StatusBar from './statusBar';
import color from 'color';
import IconButton from './iconButton';
import globalStyle from '@/constants/globalStyle';
import ThemeText from './themeText';
import {useNavigation} from '@react-navigation/native';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import Portal from './portal';
import ListItem from './listItem';
import {IIconName} from '@/components/base/icon.tsx';

interface IAppBarProps {
    titleTextOpacity?: number;
    withStatusBar?: boolean;
    color?: string;
    actions?: Array<{
        icon: IIconName;
        onPress?: () => void;
    }>;
    menu?: Array<{
        icon: IIconName;
        title: string;
        show?: boolean;
        onPress?: () => void;
    }>;
    menuWithStatusBar?: boolean;
    children?: string | ReactNode;
    containerStyle?: StyleProp<ViewStyle>;
    contentStyle?: StyleProp<ViewStyle>;
    actionComponent?: ReactNode;
    onBackPress?: () => void;
}

const ANIMATION_EASING: Animated.EasingFunction = Easing.out(Easing.exp);
const ANIMATION_DURATION = 500;

const timingConfig = {
    duration: ANIMATION_DURATION,
    easing: ANIMATION_EASING,
};

export default function AppBar(props: IAppBarProps) {
    const {
        titleTextOpacity = 1,
        withStatusBar,
        color: _color,
        actions = [],
        menu = [],
        menuWithStatusBar = true,
        containerStyle,
        contentStyle,
        children,
        actionComponent,
        onBackPress,
    } = props;

    const colors = useColors();
    const navigation = useNavigation();

    const bgColor = color(colors.appBar ?? colors.primary).toString();
    const contentColor = _color ?? colors.appBarText;

    const [showMenu, setShowMenu] = useState(false);
    const [menuIconLayout, setMenuIconLayout] =
        useState<LayoutRectangle | null>(null);
    const scaleRate = useSharedValue(0);

    useEffect(() => {
        if (showMenu) {
            scaleRate.value = withTiming(1, timingConfig);
        } else {
            scaleRate.value = withTiming(0, timingConfig);
        }
    }, [showMenu]);

    const transformStyle = useAnimatedStyle(() => {
        return {
            opacity: scaleRate.value,
        };
    });

    return (
        <>
            {withStatusBar ? <StatusBar backgroundColor={bgColor} /> : null}
            <View
                style={[
                    styles.container,
                    containerStyle,
                    {backgroundColor: bgColor},
                ]}>
                <IconButton
                    name="arrow-left"
                    sizeType="normal"
                    color={contentColor}
                    style={globalStyle.notShrink}
                    onPress={
                        onBackPress ||
                        (() => {
                            navigation.goBack();
                        })
                    }
                />
                <View style={[globalStyle.grow, styles.content, contentStyle]}>
                    {typeof children === 'string' ? (
                        <ThemeText
                            fontSize="title"
                            fontWeight="bold"
                            numberOfLines={1}
                            color={
                                titleTextOpacity !== 1
                                    ? color(contentColor)
                                          .alpha(titleTextOpacity)
                                          .toString()
                                    : contentColor
                            }>
                            {children}
                        </ThemeText>
                    ) : (
                        children
                    )}
                </View>
                {actions.map((action, index) => (
                    <IconButton
                        key={index}
                        name={action.icon}
                        sizeType="normal"
                        color={contentColor}
                        style={[globalStyle.notShrink, styles.rightButton]}
                        onPress={action.onPress}
                    />
                ))}
                {actionComponent ?? null}
                {menu?.length ? (
                    <IconButton
                        name="ellipsis-vertical"
                        sizeType="normal"
                        onLayout={evt => {
                            setMenuIconLayout(evt.nativeEvent.layout);
                        }}
                        color={contentColor}
                        style={[globalStyle.notShrink, styles.rightButton]}
                        onPress={() => {
                            setShowMenu(true);
                        }}
                    />
                ) : null}
            </View>
            <Portal>
                {showMenu ? (
                    <TouchableWithoutFeedback
                        onPress={() => {
                            setShowMenu(false);
                        }}>
                        <View style={styles.blocker} />
                    </TouchableWithoutFeedback>
                ) : null}
                <>
                    <Animated.View
                        pointerEvents={showMenu ? 'auto' : 'none'}
                        style={[
                            {
                                borderBottomColor: colors.background,
                                left:
                                    (menuIconLayout?.x ?? 0) +
                                    (menuIconLayout?.width ?? 0) / 2 -
                                    rpx(10),
                                top:
                                    (menuIconLayout?.y ?? 0) +
                                    (menuIconLayout?.height ?? 0) +
                                    (menuWithStatusBar
                                        ? OriginalStatusBar.currentHeight ?? 0
                                        : 0),
                            },
                            transformStyle,
                            styles.bubbleCorner,
                        ]}
                    />
                    <Animated.View
                        pointerEvents={showMenu ? 'auto' : 'none'}
                        style={[
                            {
                                backgroundColor: colors.background,
                                right: rpx(24),
                                top:
                                    (menuIconLayout?.y ?? 0) +
                                    (menuIconLayout?.height ?? 0) +
                                    rpx(20) +
                                    (menuWithStatusBar
                                        ? OriginalStatusBar.currentHeight ?? 0
                                        : 0),
                                shadowColor: colors.shadow,
                            },
                            transformStyle,
                            styles.menu,
                        ]}>
                        {menu.map(it =>
                            it.show !== false ? (
                                <ListItem
                                    key={it.title}
                                    withHorizontalPadding
                                    heightType="small"
                                    onPress={() => {
                                        setShowMenu(false);
                                        // async
                                        setTimeout(() => {
                                            it.onPress?.();
                                        }, 20);
                                    }}>
                                    <ListItem.ListItemIcon icon={it.icon} />
                                    <ListItem.Content title={it.title} />
                                </ListItem>
                            ) : null,
                        )}
                    </Animated.View>
                </>
            </Portal>
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        zIndex: 10000,
        height: rpx(88),
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: rpx(24),
    },
    content: {
        flexDirection: 'row',
        flexBasis: 0,
        alignItems: 'center',
        paddingHorizontal: rpx(24),
    },
    rightButton: {
        marginLeft: rpx(28),
    },
    blocker: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 10010,
    },
    bubbleCorner: {
        position: 'absolute',
        borderColor: 'transparent',
        borderWidth: rpx(10),
        zIndex: 10012,
        transformOrigin: 'right top',
        opacity: 0,
    },
    menu: {
        width: rpx(340),
        maxHeight: rpx(600),
        borderRadius: rpx(8),
        zIndex: 10011,
        position: 'absolute',
        opacity: 0,
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.23,
        shadowRadius: 2.62,
        elevation: 4,
    },
});
