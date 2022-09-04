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
import useDelayFalsy from '@/hooks/useDelayFalsy';
import {FlatList} from 'react-native-gesture-handler';
import timeformat from '@/utils/timeformat';
import {fontSizeConst} from '@/constants/uiConst';
import IconButton from '@/components/base/iconButton';
import musicIsPaused from '@/utils/musicIsPaused';

interface ICurrentLyricItem {
  lrc?: IMusic.ILrcItem;
  index: number;
}

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
  const [meta, setMeta] = useState<Record<string, any>>({});
  const [currentLrcItem, setCurentLrcItem] = useState<ICurrentLyricItem>();

  useEffect(() => {
    if (
      !lrcManagerRef.current ||
      !isSameMusicItem(lrcManagerRef.current.getCurrentMusicItem(), musicItem)
    ) {
      const parser = new LyricParser(lrc, musicItem);
      setLyric(parser.getLyric());
      setMeta(parser.getMeta());
      lrcManagerRef.current = parser;
    }
  }, [musicItem]);

  useEffect(() => {
    if (lrcManagerRef.current) {
      setCurentLrcItem(lrcManagerRef.current.getPosition(progress.position));
    }
  }, [progress]);

  return [lyric, currentLrcItem, meta] as const;
}

const ITEM_HEIGHT = rpx(72);
interface IContentProps {}

function Empty() {
  return <View style={style.empty}></View>;
}

export default function Lyric(props: IContentProps) {
  const [lyric, currentLrcItem, meta] = useLyric();
  const [drag, setDrag] = useState(false);
  const [draggingIndex, setDraggingIndex, setDraggingIndexImmi] = useDelayFalsy<
    number | undefined
  >(undefined, 2000);
  const listRef = useRef<FlatList<IMusic.ILrcItem> | null>();
  const musicState = MusicQueue.usePlaybackState();

  useEffect(() => {
    // 暂停且拖拽才返回
    if (
      lyric.length === 0 ||
      draggingIndex !== undefined ||
      (draggingIndex === undefined && musicIsPaused(musicState))
    ) {
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
    // 音乐暂停状态不应该影响到滑动，所以不放在依赖里，但是这样写不好。。
  }, [currentLrcItem, lyric, draggingIndex]);

  const onScrollBeginDrag = (e: any) => {
    setDrag(true);
  };

  const onScrollEndDrag = async () => {
    if (draggingIndex !== undefined) {
      setDraggingIndex(undefined);
    }
    setDrag(false);
  };

  const onScroll = (e: any) => {
    if (drag) {
      setDraggingIndex(Math.floor(e.nativeEvent.contentOffset.y / ITEM_HEIGHT));
    }
  };

  const onLyricSeekPress = async () => {
    if (draggingIndex !== undefined) {
      const time = lyric[draggingIndex].time + meta?.offset ?? 0;
      if (time !== undefined) {
        await MusicQueue.seekTo(time);
        await MusicQueue.play();
        setDraggingIndexImmi(undefined);
      }
    }
  };

  return (
    <>
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
        onStartShouldSetResponder={() => true}
        onStartShouldSetResponderCapture={() => true}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
        onScroll={onScroll}
        style={style.wrapper}
        data={lyric}
        extraData={currentLrcItem}
        renderItem={({item, index}) => (
          <ThemeText
            style={[
              index === currentLrcItem?.index
                ? style.highlightItem
                : style.item,
              index === draggingIndex ? style.draggingItem : undefined,
            ]}>
            {item.lrc}
          </ThemeText>
        )}></FlatList>
      {draggingIndex !== undefined && (
        <View style={style.draggingTime}>
          <Text style={style.draggingTimeText}>
            {timeformat(
              (lyric[draggingIndex]?.time ?? 0) + (meta?.offset ?? 0),
            )}
          </Text>
          <View style={style.singleLine}></View>
          <IconButton
            style={style.playIcon}
            size="small"
            name="play"
            onPress={onLyricSeekPress}></IconButton>
        </View>
      )}
    </>
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
  draggingItem: {
    color: '#dddddd',
  },
  empty: {
    paddingTop: '60%',
  },
  draggingTime: {
    position: 'absolute',
    width: rpx(750),
    height: ITEM_HEIGHT,
    top: '40%',
    marginTop: rpx(48),
    paddingHorizontal: rpx(28),
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  draggingTimeText: {
    color: '#dddddd',
    fontSize: fontSizeConst.description,
    width: rpx(90),
  },
  singleLine: {
    width: rpx(458),
    height: 1,
    backgroundColor: '#cccccc',
    opacity: 0.4
  },
  playIcon: {
    width: rpx(90),
    textAlign: 'right',
  },
});
