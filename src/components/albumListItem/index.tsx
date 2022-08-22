import React from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import {List, useTheme} from 'react-native-paper';
import Tag from '../tag';
import {fontSizeConst} from '@/constants/uiConst';
import ThemeText from '../themeText';

interface IAlbumListItemProps {
  albumItem: IAlbum.IAlbumItem;
  onPress: () => void;
}

export default function AlbumListItem(props: IAlbumListItemProps) {
  const {albumItem, onPress} = props;
  return (
    <List.Item
      left={() => (
        <View style={style.artworkWrapper}>
          <Image
            style={style.artwork}
            source={
              albumItem.artwork
                ? {
                    uri: albumItem.artwork,
                  }
                : require('@/assets/imgs/album-default.jpg')
            }></Image>
        </View>
      )}
      title={props => (
        <View style={style.titleWrapper}>
          <ThemeText numberOfLines={1} style={style.title} {...props}>
            {albumItem.title}
          </ThemeText>
          <Tag tagName={albumItem.platform}></Tag>
        </View>
      )}
      descriptionEllipsizeMode="tail"
      descriptionNumberOfLines={1}
      description={`${albumItem.artist}    ${albumItem.date}`}
      descriptionStyle={style.desc}
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
    maxWidth: rpx(510),
  },
  desc: {
    fontSize: fontSizeConst.small,
    includeFontPadding: false,
  },
  artworkWrapper: {
    width: rpx(100),
    justifyContent: 'center',
    alignItems: 'center',
  },
  artwork: {
    width: rpx(72),
    height: rpx(72),
    borderRadius: rpx(16),
  },
});
