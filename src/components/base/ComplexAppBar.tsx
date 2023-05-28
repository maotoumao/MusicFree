import React, {useState} from 'react';
import {StyleSheet} from 'react-native';
import rpx from '@/utils/rpx';
import {useNavigation, useTheme} from '@react-navigation/native';
import {Appbar, Menu} from 'react-native-paper';
import ThemeText from './themeText';
import HorizonalSafeAreaView from './horizonalSafeAreaView';

interface IMenuOption {
    icon: string;
    title: string;
    show?: boolean;
    onPress?: () => void;
}

interface IComplexAppBarProps {
    title?: string;
    onSearchPress?: () => void;
    menuOptions?: IMenuOption[];
}
export default function ComplexAppBar(props: IComplexAppBarProps) {
    const navigation = useNavigation();
    const {title, onSearchPress, menuOptions = []} = props;
    const {colors} = useTheme();
    const [isMenuVisible, setMenuVisible] = useState(false);

    const onDismissMenu = () => {
        setMenuVisible(false);
    };
    const onShowMenu = () => {
        setMenuVisible(true);
    };

    return (
        <Appbar.Header
            style={[style.appbar, {backgroundColor: colors.primary}]}>
            <HorizonalSafeAreaView style={style.safeArea}>
                <>
                    <Appbar.BackAction
                        color={colors.text}
                        onPress={() => {
                            navigation.goBack();
                        }}
                    />
                    <ThemeText
                        numberOfLines={1}
                        style={style.header}
                        fontSize="title"
                        fontWeight="semibold">
                        {title ?? ''}
                    </ThemeText>
                    {onSearchPress ? (
                        <Appbar.Action
                            icon="magnify"
                            color={colors.text}
                            onPress={onSearchPress}
                        />
                    ) : null}
                    {menuOptions.length !== 0 ? (
                        <Menu
                            contentStyle={[
                                style.menuContent,
                                {backgroundColor: colors.primary},
                            ]}
                            onDismiss={onDismissMenu}
                            visible={isMenuVisible}
                            anchor={
                                <Appbar.Action
                                    color={colors.text}
                                    icon="dots-vertical"
                                    onPress={onShowMenu}
                                />
                            }>
                            {menuOptions.map(_ =>
                                _.show === false ? null : (
                                    <Menu.Item
                                        key={`menu-${_.title}`}
                                        icon={_.icon}
                                        title={_.title}
                                        onPress={() => {
                                            _?.onPress?.();
                                            setMenuVisible(false);
                                        }}
                                    />
                                ),
                            )}
                        </Menu>
                    ) : null}
                </>
            </HorizonalSafeAreaView>
        </Appbar.Header>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: rpx(750),
        flex: 1,
    },
    appbar: {
        shadowColor: 'transparent',
        backgroundColor: '#2b333eaa',
        height: rpx(88),
    },
    header: {
        backgroundColor: 'transparent',
        shadowColor: 'transparent',
        flex: 1,
    },
    menuContent: {
        marginTop: rpx(28),
    },
    safeArea: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
});
