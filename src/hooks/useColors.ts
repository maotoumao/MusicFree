import {useTheme} from 'react-native-paper';

export default function useColors() {
    const {colors} = useTheme();
    return colors;
}
