import React from 'react';
import {StyleSheet, View} from 'react-native';
import rpx from '@/utils/rpx';
import {List} from 'react-native-paper';
import Tag from './tag';
import ThemeText from './themeText';
import Image from './image';
import IconButton from './iconButton';
import FastImage from 'react-native-fast-image';

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
      <Component></Component>
    ) : (
      <View style={[leftStyle.artworkWrapper, {width}]}>
        {index !== undefined ? (
          <ThemeText fontColor="secondary" style={{fontStyle: 'italic'}}>
            {index}
          </ThemeText>
        ) : icon !== undefined ? (
          <IconButton {...icon}></IconButton>
        ) : (
          <FastImage
            style={leftStyle.artwork}
            source={{
              uri: artwork?.startsWith('//') ? `https:${artwork}` : artwork,
            }}
            defaultSource={fallback}></FastImage>
        )}
      </View>
    )
  ) : (
    <></>
  );
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
  itemHeight?: number;
  onPress?: () => void;
}

export default function ListItem(props: IListItemProps) {
  const {
    title,
    desc,
    tag,
    right,
    itemHeight,
    onPress,
    left,
    itemPaddingHorizontal = rpx(24),
  } = props;
  return (
    <List.Item
      left={() => <Left {...(left ?? {})}></Left>}
      style={[
        style.wrapper,
        {
          paddingHorizontal: itemPaddingHorizontal,
          height: itemHeight ?? rpx(120),
          paddingVertical: 0,
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
            <ThemeText numberOfLines={1} style={style.textWidth}>
              {title}
            </ThemeText>
            {tag ? <Tag tagName={tag}></Tag> : <></>}
          </View>
          {desc ? (
            <ThemeText
              fontColor="secondary"
              fontSize="description"
              numberOfLines={1}
              style={[style.textWidth, {marginTop: rpx(18)}]}>
              {desc}
            </ThemeText>
          ) : (
            <></>
          )}
        </View>
      )}
      titleStyle={{
        paddingVertical: 0,
        marginLeft: 0,
        marginVertical: 0,
      }}
      right={right ? right : () => <></>}
      onPress={onPress}></List.Item>
  );
}
const style = StyleSheet.create({
  wrapper: {
    justifyContent: 'center',
  },
  titleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  textWidth: {
    maxWidth: rpx(460),
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
