import {useTheme} from 'react-native-paper';

export default function useTextColor() {
    const {colors} = useTheme();
    return colors.text;
}
