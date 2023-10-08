import Config from '@/core/config';
import Theme from '@/core/theme';
import useCheckUpdate from '@/hooks/useCheckUpdate';
import {useListenOrientationChange} from '@/hooks/useOrientation';
import {useEffect} from 'react';
import {useColorScheme} from 'react-native';

export function BootstrapComp() {
    useListenOrientationChange();
    useCheckUpdate();

    const colorScheme = useColorScheme();

    useEffect(() => {
        if (Config.get('setting.theme.followSystem')) {
            if (colorScheme === 'dark') {
                Theme.setTheme('p-dark');
            } else if (colorScheme === 'light') {
                Theme.setTheme('p-light');
            }
        }
    }, [colorScheme]);

    return null;
}
