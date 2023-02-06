import React from 'react';
import {SwitchProps} from 'react-native';
import useColors from '@/hooks/useColors';
import {Switch} from 'react-native-paper';

interface ISwitchProps extends SwitchProps {}
export default function ThemeSwitch(props: ISwitchProps) {
    const colors = useColors();
    return (
        <Switch
            {...props}
            trackColor={{
                false: colors.textSecondary,
                true: colors.textHighlight ?? '#eba0b3',
            }}
            onValueChange={props.onValueChange ?? undefined}
        />
    );
}
