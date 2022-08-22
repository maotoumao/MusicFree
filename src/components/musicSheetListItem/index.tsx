import React from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import {IconButton, List, useTheme} from 'react-native-paper';
import ThemeText from '../themeText';

interface IMusicSheetItemProps {
  title: string;
  coverImg?: string;
  desc: string | (() => JSX.Element);
  onRightIconPress?: () => void;
  rightIconName?: string;
  onPress: () => void;
}
export default function MusicSheetItem(props: IMusicSheetItemProps) {
  const {title, coverImg, desc, rightIconName, onRightIconPress, onPress} = props;
  const {colors} = useTheme();
  return (
    <List.Item
      left={props => (
        <View style={style.albumWrapper}>
          <Image
            {...props}
            style={style.album}
            source={
              coverImg
                ? {
                    uri: coverImg,
                  }
                : require('@/assets/imgs/album-default.jpg')
            }></Image>
        </View>
      )}
      title={<ThemeText>{title}</ThemeText>}
      style={style.itemStyle}
      descriptionEllipsizeMode="tail"
      descriptionNumberOfLines={1}
      description={<ThemeText type='secondary'>{desc as string}</ThemeText>}
      right={props =>
        onRightIconPress ? (
          <IconButton
            {...props}
            style={style.rightButton}
            color={colors.text}
            icon={rightIconName ?? "dots-vertical"}
            onPress={onRightIconPress}></IconButton>
        ) : null
      }
      onPress={() => {
        onPress();
      }}></List.Item>
  );
}

const style = StyleSheet.create({
  itemStyle: {
    paddingHorizontal: 0,
    height: rpx(160),
  },
  albumWrapper: {
    width: rpx(120),
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  album: {
    width: rpx(100),
    height: rpx(100),
    borderRadius: rpx(12),
  },
  rightButton: {
    height: '100%'
  }
});
