/**
 * @format
 */

import {AppRegistry} from 'react-native';
import Pages from './src/entry';
import {name as appName} from './app.json';
import TrackPlayer from 'react-native-track-player';

AppRegistry.registerComponent(appName, () => Pages);
TrackPlayer.registerPlaybackService(() => require('./src/service/index'));
