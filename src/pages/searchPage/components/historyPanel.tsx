import React, {useEffect, useState} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import Loading from '@/components/base/loading';
import {Chip, useTheme} from 'react-native-paper';
import useSearch from '../hooks/useSearch';
import {addHistory, getHistory, removeHistory} from '../common/historySearch';
import {useSetAtom} from 'jotai';
import {
  initSearchResults,
  PageStatus,
  pageStatusAtom,
  queryAtom,
  searchResultsAtom,
} from '../store/atoms';
import ThemeText from '@/components/base/themeText';

interface IProps {}
export default function (props: IProps) {
  const [history, setHistory] = useState<string[] | null>(null);
  const search = useSearch();

  const setQuery = useSetAtom(queryAtom);
  const setPageStatus = useSetAtom(pageStatusAtom);
  const setSearchResultsState = useSetAtom(searchResultsAtom);

  useEffect(() => {
    getHistory().then(setHistory);
  }, []);

  return (
    <View style={style.wrapper}>
      {history === null ? (
        <Loading></Loading>
      ) : (
        <>
          <ThemeText fontSize="title" fontWeight="semibold" style={style.title}>
            历史记录
          </ThemeText>
          <ScrollView
            style={style.historyContent}
            contentContainerStyle={style.historyContentConainer}>
            {history.map(_ => (
              <Chip
                key={`search-history-${_}`}
                style={style.chip}
                onClose={async () => {
                  await removeHistory(_);
                  getHistory().then(setHistory);
                }}
                onPress={() => {
                  setSearchResultsState(initSearchResults);
                  search(_, 1);
                  addHistory(_);
                  setPageStatus(PageStatus.SEARCHING);
                  setQuery(_);
                }}>
                {_}
              </Chip>
            ))}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    maxWidth: rpx(750),
    flexDirection: 'column',
    padding: rpx(24),
    flex: 1,
  },
  title: {
    width: '100%',
    marginVertical: rpx(28),
  },
  historyContent: {
    width: rpx(750),
    flex: 1,
  },
  historyContentConainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    flexGrow: 0,
    marginRight: rpx(24),
    marginBottom: rpx(24),
  },
});
