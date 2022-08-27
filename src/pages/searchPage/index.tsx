import React, {useEffect} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import rpx from '@/utils/rpx';
import NavBar from './components/navBar';
import {useAtom, useAtomValue, useSetAtom} from 'jotai';
import {PageStatus, pageStatusAtom, queryAtom, searchResultsAtom} from './store/atoms';
import HistoryPanel from './components/historyPanel';
import ResultPanel from './components/resultPanel';
import MusicBar from '@/components/musicBar';
import Loading from '@/components/loading';
import { SafeAreaView } from 'react-native-safe-area-context';
import StatusBar from '@/components/statusBar';
interface IProps {}
export default function (props: IProps) {
  const [pageStatus, setPageStatus] = useAtom(pageStatusAtom);
  const setQuery = useSetAtom(queryAtom);
  const setSearchResultsState = useSetAtom(searchResultsAtom);
  useEffect(() => {
    setSearchResultsState({});
    return () => {
      setPageStatus(PageStatus.EDITING);
      setQuery('');
    };
  }, []);

  useEffect(() => {
    console.log(pageStatus);
  }, [pageStatus]);

  return (
    <SafeAreaView style={style.wrapper}>
      <StatusBar></StatusBar>
      <NavBar></NavBar>
      <View style={{flex: 1}}>
        {pageStatus === PageStatus.EDITING && <HistoryPanel></HistoryPanel>}
        {pageStatus === PageStatus.SEARCHING && <Loading></Loading>}
        {pageStatus === PageStatus.RESULT && <ResultPanel></ResultPanel>}
      </View>
      <MusicBar></MusicBar>
    </SafeAreaView>
  );
}

const style = StyleSheet.create({
  wrapper: {
    width: rpx(750),
    flex: 1,
  },
});
