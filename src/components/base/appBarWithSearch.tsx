import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import {useNavigation, useTheme} from '@react-navigation/native';
import {Appbar, Divider, Menu, Provider} from 'react-native-paper';

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
export default function AppBarWithSearch(props: IComplexAppBarProps) {
  const navigation = useNavigation();
  const {title, onSearchPress, menuOptions = []} = props;
  const {colors} = useTheme();
  const [isMenuVisible, setMenuVisible] = useState(true);

  const onDismissMenu = () => {
    setMenuVisible(false);
  };
  const onShowMenu = () => {
    setMenuVisible(true);
  };

  return (
    <Appbar.Header style={[style.appbar, {backgroundColor: colors.primary}]}>
      <Appbar.BackAction
        onPress={() => {
          navigation.goBack();
        }}
      />
      <Appbar.Content title={title} />
      <Appbar.Action icon="magnify" onPress={onSearchPress} />
      <Menu
        contentStyle={[style.menuContent, {backgroundColor: colors.primary}]}
        onDismiss={onDismissMenu}
        visible={isMenuVisible}
        anchor={
          <Appbar.Action
            color="white"
            icon="dots-vertical"
            onPress={onShowMenu}
          />
        }>
        {menuOptions.map(_ =>
          _.show === false ? (
            <></>
          ) : (
            <Menu.Item
              key={`menu-${_.title}`}
              icon={_.icon}
              title={_.title}
              onPress={() => {
                _?.onPress?.();
                setMenuVisible(false);
              }}></Menu.Item>
          ),
        )}
      </Menu>
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
  },
  header: {
    backgroundColor: 'transparent',
    shadowColor: 'transparent',
  },
  menuContent: {
    marginTop: rpx(28),
  },
});
