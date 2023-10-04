import React from 'react';
import {SwitchProps} from 'react-native';
import useColors from '@/hooks/useColors';
import {Switch} from 'react-native-gesture-handler';
import Color from 'color';

interface ISwitchProps extends SwitchProps {}
export default function ThemeSwitch(props: ISwitchProps) {
    const colors = useColors();
    return (
        <Switch
            {...props}
            trackColor={{
                false: Color(colors.placeholder).alpha(0.8).toString(),
                true: Color(colors.primary).alpha(0.6).toString(),
            }}
            thumbColor={
                props?.value ? colors.primary ?? '#eba0b3' : colors.placeholder
            }
            onValueChange={props.onValueChange ?? undefined}
        />
    );
}
