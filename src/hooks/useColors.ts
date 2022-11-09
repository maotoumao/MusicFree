import {useTheme} from 'react-native-paper';

// !!! 这里useTheme有问题，歌曲进度更新的时候会导致重新渲染
export default function useColors() {
    const {colors} = useTheme();
    return colors;
}
