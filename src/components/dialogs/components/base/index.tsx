import React, {ReactNode, useEffect} from 'react';
import {
    StyleProp,
    StyleSheet,
    TouchableWithoutFeedback,
    View,
    ViewStyle,
} from 'react-native';
import rpx, {vh} from '@/utils/rpx';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import {timingConfig} from '@/constants/commonConst';
import useColors from '@/hooks/useColors';
import ThemeText from '@/components/base/themeText';
import Divider from '@/components/base/divider';
import {fontSizeConst} from '@/constants/uiConst';
import {ScrollView} from 'react-native-gesture-handler';
import Button from '@/components/base/button';

interface IDialogProps {
    onDismiss?: () => void;
    children?: ReactNode;
}
function Dialog(props: IDialogProps) {
    const {children, onDismiss} = props;

    const sharedShowValue = useSharedValue(0);
    const colors = useColors();

    useEffect(() => {
        sharedShowValue.value = withTiming(1, timingConfig.animationFast);

        return () => {
            sharedShowValue.value = withTiming(0, timingConfig.animationFast);
        };
    }, []);

    const containerStyle = useAnimatedStyle(() => {
        return {
            opacity: sharedShowValue.value,
        };
    });

    const scaleStyle = useAnimatedStyle(() => {
        return {
            transform: [
                {
                    scale: 0.9 + sharedShowValue.value * 0.1,
                },
            ],
        };
    });

    return (
        <View style={styles.backContainer}>
            <TouchableWithoutFeedback
                style={styles.container}
                onPress={onDismiss}>
                <Animated.View style={[styles.container, containerStyle]} />
            </TouchableWithoutFeedback>
            <Animated.View
                style={[
                    styles.dialogContainer,
                    containerStyle,
                    scaleStyle,
                    {
                        backgroundColor: colors.backdrop,
                        shadowColor: colors.shadow,
                    },
                ]}>
                {children}
            </Animated.View>
        </View>
    );
}

interface IDialogTitleProps {
    children?: ReactNode;
    withDivider?: boolean;
    stringContent?: boolean;
}

function Title(props: IDialogTitleProps) {
    const {children, withDivider, stringContent} = props;

    return (
        <>
            <View style={styles.titleContainer}>
                {typeof children === 'string' || stringContent ? (
                    <ThemeText
                        fontSize="title"
                        fontWeight="bold"
                        numberOfLines={1}>
                        {children}
                    </ThemeText>
                ) : (
                    children
                )}
            </View>
            {withDivider ? <Divider /> : null}
        </>
    );
}

interface IDialogContentProps {
    children?: ReactNode;
    style?: StyleProp<ViewStyle>;
    needScroll?: boolean;
}

function Content(props: IDialogContentProps) {
    const {children, style, needScroll} = props;

    const content =
        typeof children === 'string' ? (
            <ThemeText fontSize="content" style={styles.defaultFontStyle}>
                {children}
            </ThemeText>
        ) : (
            children
        );

    return (
        <View
            style={[
                styles.contentContainer,
                {
                    maxHeight: vh(50),
                },
                style,
            ]}>
            {needScroll ? <ScrollView>{content}</ScrollView> : content}
        </View>
    );
}

interface IDialogActionsProps {
    children?: ReactNode;
    actions?: Array<{
        title: string;
        onPress?: () => void;
    }>;
    style?: StyleProp<ViewStyle>;
}

function Actions(props: IDialogActionsProps) {
    const {children, style, actions} = props;

    const _children = actions?.length ? (
        <>
            {actions.map((it, index) => (
                <Button
                    key={index}
                    style={index === 0 ? null : styles.actionButton}
                    onPress={it.onPress}>
                    {it.title}
                </Button>
            ))}
        </>
    ) : (
        children
    );

    return (
        <View style={[styles.actionsContainer, style]}>
            {typeof children === 'string' ? (
                <ThemeText fontSize="content" numberOfLines={1}>
                    {children}
                </ThemeText>
            ) : (
                _children
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    backContainer: {
        position: 'absolute',
        zIndex: 10299,
        width: '100%',
        height: '100%',
        left: 0,
        top: 0,
        alignItems: 'center',
        justifyContent: 'center',
    },
    container: {
        zIndex: 10300,
        position: 'absolute',
        width: '100%',
        height: '100%',
        left: 0,
        top: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    dialogContainer: {
        position: 'absolute',
        width: '80%',
        zIndex: 10310,
        borderRadius: rpx(16),
        backgroundColor: 'red',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.5,
        shadowRadius: 4,

        elevation: 5,
    },

    defaultFontStyle: {
        lineHeight: fontSizeConst.content * 1.5,
    },

    /**** title */
    titleContainer: {
        height: rpx(88),
        width: '100%',
        alignItems: 'center',
        flexDirection: 'row',
        paddingHorizontal: rpx(24),
    },
    /** content */
    contentContainer: {
        width: '100%',
        paddingHorizontal: rpx(24),
        paddingVertical: rpx(36),
    },
    /** actions */
    actionsContainer: {
        width: '100%',
        height: rpx(88),
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingHorizontal: rpx(24),
        flexWrap: 'nowrap',
    },
    actionButton: {
        marginLeft: rpx(48),
    },
});

Dialog.Title = Title;
Dialog.Content = Content;
Dialog.Actions = Actions;

export default Dialog;
