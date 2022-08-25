import React, { useEffect } from 'react';
import {Image, StyleSheet} from 'react-native';

import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import bootstrap from './bootstrap';
import {routes} from './router';
import {Provider as PaperProvider} from 'react-native-paper';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import Dialogs from '@/components/dialogs';
import Toast from 'react-native-toast-message';
import Panels from '@/components/panels';
import {CustomTheme, DarkTheme, DefaultTheme} from './theme';
import {useConfig} from '@/common/localConfigManager';
import Share from '@/components/share';
import PageBackground from '@/components/pageBackground';
import RNBootSplash from "react-native-bootsplash";

// todo: load config
/**
 * 字体颜色
 */

bootstrap();
const Stack = createNativeStackNavigator();

export default function Pages() {
  const theme = useConfig('setting.theme.mode') ?? 'dark';
  useEffect(() => {
    if(__DEV__) {
      RNBootSplash.hide({fade: true});
    }
  }, []);

  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <PaperProvider theme={theme === 'dark'? CustomTheme : DefaultTheme}>
        <NavigationContainer theme={theme === 'dark'? CustomTheme : DefaultTheme}>
          <PageBackground></PageBackground>
          <Stack.Navigator
            initialRouteName={routes[0].path}
            screenOptions={{
              statusBarColor: 'transparent',
              statusBarTranslucent: true,
              headerShown: false,
              animation: 'slide_from_right',
              animationDuration: 200,
            }}>
            {routes.map(route => (
              <Stack.Screen
                key={route.path}
                name={route.path}
                component={route.component}></Stack.Screen>
            ))}
          </Stack.Navigator>

          <Panels></Panels>
          <Dialogs></Dialogs>
          <Share></Share>
          <Toast></Toast>
        </NavigationContainer>
      </PaperProvider>
    </GestureHandlerRootView>
  );
}

const style = StyleSheet.create({
  blur: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
