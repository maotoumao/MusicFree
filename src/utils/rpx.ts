import {Dimensions} from 'react-native';

const windowWidth = Dimensions.get('window').width;
const windowHeight = Dimensions.get('window').height;

export default function (rpx: number) {
    return (rpx / 750) * Math.min(windowWidth, windowHeight);
}

export function vh(pct: number) {
    return (pct / 100) * windowHeight;
}

export function vw(pct: number) {
    return (pct / 100) * windowWidth;
}
