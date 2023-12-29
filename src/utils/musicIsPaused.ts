import {State} from 'react-native-track-player';

export default (state: State | undefined) => state !== State.Playing;
