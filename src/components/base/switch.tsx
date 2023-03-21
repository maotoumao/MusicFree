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
                false: Color(colors.textSecondary).alpha(0.8).toString(),
                true:
                    Color(colors.textHighlight).alpha(0.8).toString() ??
                    '#eba0b3',
            }}
            thumbColor={
                props?.value
                    ? colors.textHighlight ?? '#eba0b3'
                    : colors.textSecondary
            }
            onValueChange={props.onValueChange ?? undefined}
        />
    );
}
