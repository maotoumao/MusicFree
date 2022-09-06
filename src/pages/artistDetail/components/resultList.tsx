import React, {useEffect, useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import MusicItem from '@/components/mediaItem/musicItem';
import {FlatList} from 'react-native-gesture-handler';
import {useAtom, useSetAtom} from 'jotai';
import {IQueryResult, scrollToTopAtom} from '../store/atoms';
import {RequestStateCode} from '@/constants/commonConst';
import useQueryArtist from '../hooks/useQuery';
import {useRoute} from '@react-navigation/native';
import Empty from '@/components/base/empty';
import ListLoading from '@/components/base/listLoading';
import ListReachEnd from '@/components/base/listReachEnd';

const fakeMusicList = Array(50)
  .fill(1)
  .map(_ => ({
    id: '1125499111' + Math.random(),
    artist: '周杰伦',
    title: '我是如此相信 (电影《天火》主题曲)',
    album: '我是如此相信',
    artwork:
      'https://mcontent.migu.cn/newlv2/new/album/20201103/1125499110/s_Xlihp7auugzpWgbW.jpg',
    url: 'https://freetyst.nf.migu.cn/public%2Fproduct6th%2Fproduct36%2F2019%2F12%2F1319%2F2019%E5%B9%B412%E6%9C%8813%E6%97%A519%E7%82%B933%E5%88%86%E7%B4%A7%E6%80%A5%E5%86%85%E5%AE%B9%E5%87%86%E5%85%A5%E7%BA%B5%E6%A8%AA%E4%B8%96%E4%BB%A31%E9%A6%96%2F%E5%85%A8%E6%9B%B2%E8%AF%95%E5%90%AC%2FMp3_64_22_16%2F60054704118.mp3?Key=418a2b05ec5576d6&Tim=1662191674042&channelid=01&msisdn=dbea15217ccb4a1882585e57f2a23b3e',
    lrc: 'https://tyqk.migu.cn/files/lyric/2019-12-14/dcf94ea8351c4cdc9a60316cdd8f14aa.lrc',
    platform: '咪咕',
  }));

const ITEM_HEIGHT = rpx(120);

interface IResultListProps<T = IArtist.ArtistMediaType> {
  tab: T;
  data: IQueryResult<T>;
  renderItem: (...args: any) => any;
}
export default function ResultList(props: IResultListProps) {
  const {data, renderItem, tab} = props;
  const [scrollToTopState, setScrollToTopState] = useAtom(scrollToTopAtom);
  const lastScrollY = useRef<number>(0);
  const route = useRoute<any>();
  const pluginHash: string = route.params.pluginHash;
  const artistItem: IArtist.IArtistItem = route.params.artistItem;
  const [queryState, setQueryState] = useState<RequestStateCode>(
    data?.state ?? RequestStateCode.IDLE,
  );

  const queryArtist = useQueryArtist(pluginHash);

  useEffect(() => {
    queryState === RequestStateCode.IDLE && queryArtist(artistItem, 1, tab);
  }, []);

  useEffect(() => {
    setQueryState(data?.state ?? RequestStateCode.IDLE);
  }, [data]);

  return (
    <FlatList
      onScroll={e => {
        const currentY = e.nativeEvent.contentOffset.y;
        if (!scrollToTopState && currentY < ITEM_HEIGHT * 8 - rpx(350)) {
          currentY < lastScrollY.current && setScrollToTopState(true);
        } else {
          if (scrollToTopState && currentY > ITEM_HEIGHT * 8) {
            currentY > lastScrollY.current && setScrollToTopState(false);
          }
        }
        lastScrollY.current = currentY;
      }}
      ListEmptyComponent={<Empty></Empty>}
      ListFooterComponent={
        queryState === RequestStateCode.PENDING ? (
          <ListLoading></ListLoading>
        ) : (queryState === RequestStateCode.FINISHED && data.data?.length !== 0) ? (
          <ListReachEnd></ListReachEnd>
        ) : (
          <></>
        )
      }
      onEndReached={() => {
        (queryState === RequestStateCode.IDLE ||
          queryState === RequestStateCode.PARTLY_DONE) &&
          queryArtist(artistItem, undefined, tab);
      }}
      getItemLayout={(_, index) => ({
        length: ITEM_HEIGHT,
        offset: ITEM_HEIGHT * index,
        index,
      })}
      overScrollMode="always"
      data={data.data ?? []}
      renderItem={renderItem}></FlatList>
  );
}
