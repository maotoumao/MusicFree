import {Dimensions} from 'react-native';

const windowWidth = Dimensions.get('window').width;
const windowHeight = Dimensions.get('window').height;

export default function (rpx: number) {
    return (rpx / 750) * Math.min(windowWidth, windowHeight);
}

export function vh(pct: number) {
    return (pct / 100) * Dimensions.get('window').height;
}

export function vw(pct: number) {
    return (pct / 100) * Dimensions.get('window').width;
}

export function sh(pct: number) {
    return (pct / 100) * Dimensions.get('screen').height;
}

export function sw(pct: number) {
    return (pct / 100) * Dimensions.get('screen').width;
}
