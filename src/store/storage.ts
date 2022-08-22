import {createJSONStorage} from 'jotai/utils';
import AsyncStorage from '@react-native-async-storage/async-storage';

const storage: any = createJSONStorage(() => AsyncStorage);

export default storage;
