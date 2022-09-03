import React, {useEffect, useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import MusicQueue from '@/common/musicQueue';
import Image from '@/components/base/image';
import {ImgAsset} from '@/constants/assetsConst';
import LyricParser from '@/common/lrcParser';
import isSameMusicItem from '@/utils/isSameMusicItem';
import ListItem from '@/components/base/listItem';
import ThemeText from '@/components/base/themeText';
import useDelayFalse from '@/hooks/useDelayState';
import {FlatList} from 'react-native-gesture-handler';

function useLyric() {
  const musicItem = MusicQueue.useCurrentMusicItem();
  const progress = MusicQueue.useProgress();
  const lrcManagerRef = useRef<LyricParser>();

  const lrc = `[ti:七里香]
    [ar:周杰伦]
    [al:Initial J (日本版)]
    [by:MP3.5nd]
    [offset:500]
    [00:08.28]作词：方文山　作曲：周杰伦
    [00:21.33]制作：MP3.5nd
    [00:27.43]窗外的麻雀 在电线杆上多嘴
    [00:34.33]你说这一句 很有夏天的感觉
    [00:40.98]手中的铅笔 在纸上来来回回
    [00:47.30]我用几行字形容你是我的谁
    [00:54.03]秋刀鱼的滋味 猫跟你都想了解
    [01:01.10]初恋的香味就这样被我们寻回
    [01:07.40]那温暖的阳光 象刚摘的鲜艳草莓
    [01:14.14]你说你舍不得吃掉这一种感觉
    [02:14.66]
    [03:35.01][02:41.25][01:47.47][01:20.45]雨下整夜 我的爱溢出就象雨水
    [03:41.68][02:47.85][01:27.24]院子落叶 跟我的思念厚厚一叠
    [03:48.30][02:54.55][01:33.92]几句是非 也无法将我的热情冷却
    [03:55.90][03:02.15][01:41.51]你出现在我诗的每一页
    [03:07.79]
    [04:02.36]整夜 我的爱溢出就象雨水
    [04:08.52][01:54.12]窗台蝴蝶 象诗里纷飞的美丽章节
    [04:15.47][02:00.84]我接着写 把永远爱你写进诗的结尾
    [04:22.77][02:08.35]你是我唯一想要的了解
    [04:29.28]
    [03:08.51]那饱满的稻穗 幸福了这个季节
    [03:15.85]而你的脸颊象田里熟透的蕃茄
    [03:21.87]你突然对我说 七里香的名字很美
    [03:28.56]我此刻却只想亲吻你倔强的嘴5nd
    `;

  const [lyric, setLyric] = useState<IMusic.ILrc>([]);
  const [currentLrcItem, setCurentLrcItem] = useState<{
    lrc?: IMusic.ILrcItem;
    index: number;
  }>();

  useEffect(() => {
    if (
      !lrcManagerRef.current ||
      !isSameMusicItem(lrcManagerRef.current.getCurrentMusicItem(), musicItem)
    ) {
      const parser = new LyricParser(lrc, musicItem);
      setLyric(parser.getLyric());
      lrcManagerRef.current = parser;
    }
  }, [musicItem]);

  useEffect(() => {
    if (lrcManagerRef.current) {
      setCurentLrcItem(lrcManagerRef.current.getPosition(progress.position));
    }
  }, [progress]);

  return [lyric, currentLrcItem] as const;
}

const ITEM_HEIGHT = rpx(72);
interface IContentProps {}

function Empty() {
  return <View style={style.empty}></View>;
}

export default function Lyric(props: IContentProps) {
  const [lyric, currentLrcItem] = useLyric();
  const [drag, setDrag] = useDelayFalse(false, 1500);
  const listRef = useRef<FlatList<IMusic.ILrcItem> | null>();

  useEffect(() => {
    if (lyric.length === 0 || drag) {
      return;
    }
    if (currentLrcItem?.index === -1 || !currentLrcItem) {
      listRef.current?.scrollToIndex({
        index: 0,
        viewPosition: 0,
      });
    } else {
      listRef.current?.scrollToIndex({
        index: currentLrcItem.index ?? 0,
        viewPosition: 0,
      });
    }
  }, [currentLrcItem, lyric, drag]);

  const onScrollBeginDrag = (e: any) => {
    console.log('e', e);
    setDrag(true);
  };

  const onScrollEndDrag = () => {
    setDrag(false);
  };

  return (
    <FlatList
      ref={_ => {
        listRef.current = _;
      }}
      getItemLayout={(data, index) => ({
        length: ITEM_HEIGHT,
        offset: ITEM_HEIGHT * index,
        index,
      })}
      ListHeaderComponent={Empty}
      ListFooterComponent={Empty}
      onScrollBeginDrag={onScrollBeginDrag}
      onScrollEndDrag={onScrollEndDrag}
      style={style.wrapper}
      data={lyric}
      extraData={currentLrcItem}
      renderItem={({item, index}) => (
        <ThemeText
          style={
            index === currentLrcItem?.index ? style.highlightItem : style.item
          }>
          {item.lrc}
        </ThemeText>
      )}></FlatList>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    marginVertical: rpx(48),
    flex: 1,
  },
  item: {
    fontSize: rpx(28),
    color: '#aaaaaa',
    width: rpx(750),
    height: ITEM_HEIGHT,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  highlightItem: {
    fontSize: rpx(32),
    color: 'white',
    width: rpx(750),
    height: ITEM_HEIGHT,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  empty: {
    paddingTop: '60%',
  },
});
