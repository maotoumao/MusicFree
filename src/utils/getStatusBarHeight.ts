import {Platform, StatusBar} from 'react-native';

export default () => (Platform.OS === 'android' ? StatusBar.currentHeight : 0);
