import {useTheme} from 'react-native-paper';

export default function usePrimaryColor() {
    const {colors} = useTheme();
    return colors.primary;
}
