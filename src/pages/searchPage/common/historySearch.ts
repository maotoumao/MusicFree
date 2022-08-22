import AsyncStorage from '@react-native-async-storage/async-storage';

export async function getHistory() {
  let searchList = [];
  try {
    const _ = await AsyncStorage.getItem('history-search');
    if (!_) {
      throw new Error();
    }
    searchList = JSON.parse(_);
  } catch {
    searchList = [];
  }
  return searchList;
}

export async function addHistory(query: string) {
  let searchList = await getHistory();
  searchList = [query].concat(searchList.filter((_: string) => _ !== query));
  await AsyncStorage.setItem('history-search', JSON.stringify(searchList));
}

export async function removeHistory(query: string) {
  let searchList = await getHistory();
  searchList = searchList.filter((_: string) => _ !== query);
  await AsyncStorage.setItem('history-search', JSON.stringify(searchList));
}
