import {Dimensions} from 'react-native';

const windowWidth = Dimensions.get('window').width;

export default function (rpx: number) {
  return (rpx / 750) * windowWidth;
}
