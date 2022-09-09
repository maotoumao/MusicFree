import React, {useEffect, useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import MusicQueue from '@/core/musicQueue';
import Image from '@/components/base/image';
import {ImgAsset} from '@/constants/assetsConst';
import LyricParser from '@/core/lrcParser';
import ListItem from '@/components/base/listItem';
import ThemeText from '@/components/base/themeText';
import useDelayFalsy from '@/hooks/useDelayFalsy';
import {
  FlatList,
  Gesture,
  TapGestureHandler,
} from 'react-native-gesture-handler';
import timeformat from '@/utils/timeformat';
import {fontSizeConst} from '@/constants/uiConst';
import IconButton, { IconButtonWithGesture } from '@/components/base/iconButton';
import musicIsPaused from '@/utils/musicIsPaused';
import MediaMeta from '@/core/mediaMeta';
import {pluginMethod} from '@/core/pluginManager';
import {trace} from '@/utils/log';
import Loading from '@/components/base/loading';
import { isSameMediaItem } from '@/utils/mediaItem';

interface ICurrentLyricItem {
  lrc?: ILyric.IParsedLrcItem;
  index: number;
}

function useLyric() {
  const musicItem = MusicQueue.useCurrentMusicItem();
  const musicItemRef = useRef<IMusic.IMusicItem>();
  const progress = MusicQueue.useProgress();
  const lrcManagerRef = useRef<LyricParser>();
  const [loading, setLoading] = useState(true);

  const [lyric, setLyric] = useState<ILyric.IParsedLrc>([]);
  const [meta, setMeta] = useState<Record<string, any>>({});
  const [currentLrcItem, setCurentLrcItem] = useState<ICurrentLyricItem>();

  useEffect(() => {
    if (
      !lrcManagerRef.current ||
      !isSameMediaItem(
        lrcManagerRef.current?.getCurrentMusicItem?.(),
        musicItem,
      )
    ) {
      setLoading(true);
      pluginMethod
        .getLyric(musicItem)
        .then(lrc => {
          setLoading(false);
          trace(musicItem.title, lrc);
          if (isSameMediaItem(musicItem, musicItemRef.current)) {
            if (lrc) {
              const parser = new LyricParser(lrc, musicItem);
              setLyric(parser.getLyric());
              setMeta(parser.getMeta());
              lrcManagerRef.current = parser;
            } else {
              setLyric([]);
              setMeta({});
              lrcManagerRef.current = undefined;
            }
          }
        })
        .catch(_ => {
          setLoading(false);
        });
    }
    musicItemRef.current = musicItem;
  }, [musicItem]);

  useEffect(() => {
    if (lrcManagerRef.current) {
      setCurentLrcItem(lrcManagerRef.current.getPosition(progress.position));
    }
  }, [progress]);

  return {lyric, currentLrcItem, meta, loading} as const;
}

const ITEM_HEIGHT = rpx(72);
interface IContentProps {}

function Empty() {
  return <View style={style.empty}></View>;
}

export default function Lyric(props: IContentProps) {
  const {lyric, currentLrcItem, meta, loading} = useLyric();
  const [drag, setDrag] = useState(false);
  const [draggingIndex, setDraggingIndex, setDraggingIndexImmi] = useDelayFalsy<
    number | undefined
  >(undefined, 2000);
  const listRef = useRef<FlatList<ILyric.IParsedLrcItem> | null>();
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
      const time = lyric[draggingIndex].time + (meta?.offset ?? 0);
      if (time !== undefined && !isNaN(time)) {
        await MusicQueue.seekTo(time);
        await MusicQueue.play();
        setDraggingIndexImmi(undefined);
      }
    }
  };

  return (
    <>
      {loading ? (
        <Loading></Loading>
      ) : (
        <FlatList
          ref={_ => {
            listRef.current = _;
          }}
          getItemLayout={(data, index) => ({
            length: ITEM_HEIGHT,
            offset: ITEM_HEIGHT * index,
            index,
          })}
          ListEmptyComponent={
            <ThemeText style={style.highlightItem}>暂无歌词</ThemeText>
          }
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
      )}
      {draggingIndex !== undefined && (
        <View style={style.draggingTime}>
          <Text style={style.draggingTimeText}>
            {timeformat(
              (lyric[draggingIndex]?.time ?? 0) + (meta?.offset ?? 0),
            )}
          </Text>
          <View style={style.singleLine}></View>

          <IconButtonWithGesture
            style={style.playIcon}
            size="small"
            name="play"
            onPress={onLyricSeekPress}></IconButtonWithGesture>
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
    opacity: 0.4,
  },
  playIcon: {
    width: rpx(90),
    textAlign: 'right',
  },
});
