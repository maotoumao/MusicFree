import Config from '@/core/config';
import Theme from '@/core/theme';
import useCheckUpdate from '@/hooks/useCheckUpdate.ts';
import {useListenOrientationChange} from '@/hooks/useOrientation';
import {useEffect} from 'react';
import {useColorScheme} from 'react-native';

export function BootstrapComp() {
    useListenOrientationChange();
    useCheckUpdate();

    const followSystem = Config.useConfig('setting.theme.followSystem');

    const colorScheme = useColorScheme();

    useEffect(() => {
        if (followSystem) {
            if (colorScheme === 'dark') {
                Theme.setTheme('p-dark');
            } else if (colorScheme === 'light') {
                Theme.setTheme('p-light');
            }
        }
    }, [colorScheme, followSystem]);

    return null;
}
