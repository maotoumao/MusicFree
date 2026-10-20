/**
 * @format
 */

import {AppRegistry} from 'react-native';
import {name as appName} from './app.json';
import TrackPlayer from 'react-native-track-player';
import NativeRoot from './src/entry/nativeRoot';

AppRegistry.registerComponent(appName, () => NativeRoot);
TrackPlayer.registerPlaybackService(() => require('./src/service/index'));

AppRegistry.registerHeadlessTask("MusicFreeWidget", () => require("./src/service/widgetTask").default);
