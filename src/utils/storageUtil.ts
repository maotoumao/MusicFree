import AsyncStorage from '@react-native-async-storage/async-storage';

export async function setStorage(key: string, value: any) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export async function getStorage(key: string) {
  try {
    const result = await AsyncStorage.getItem(key);
    if (result) {
      return JSON.parse(result);
    }
  } catch {}
  return null;
}
