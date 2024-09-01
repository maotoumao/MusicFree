/**
 * @format
 */

import {AppRegistry} from 'react-native';
import {name as appName} from './app.json';
import TrackPlayer from 'react-native-track-player';
import Pages from '@/entry';

AppRegistry.registerComponent(appName, () => Pages);
TrackPlayer.registerPlaybackService(() => require('./src/service/index'));
