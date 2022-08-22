import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import {IconButton, List} from 'react-native-paper';
import Tag from '../tag';
import { fontSizeConst } from '@/constants/uiConst';
import ThemeText from '../themeText';

interface IMusicListItemProps {
  musicItem: IMusic.IMusicItem;
  left?: (props: any) => JSX.Element | null;
  onRightPress?: () => void;
  onPress: () => void;
}
export default function MusicListItem(props: IMusicListItemProps) {
  const {musicItem, left, onRightPress, onPress} = props;
  return (
    <List.Item
      left={left}
      title={props => (
        <View style={style.titleWrapper}>
          <ThemeText numberOfLines={1} style={style.title} {...props}>{musicItem.title}</ThemeText>
          <Tag tagName={musicItem.platform}></Tag>
        </View>
      )}
      descriptionEllipsizeMode="tail"
      descriptionNumberOfLines={1}
      description={`${musicItem.artist} - ${musicItem.album}`}
      right={() =>
        onRightPress ? (
          <IconButton
            {...props}
            icon="dots-vertical"
            onPress={() => {
              onRightPress();
            }}></IconButton>
        ) : null
      }
      onPress={onPress}></List.Item>
  );
}
const style = StyleSheet.create({
  titleWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: fontSizeConst.normal,
    includeFontPadding: false,
    maxWidth: rpx(480)
  }
});
