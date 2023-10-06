import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import bootstrap from './bootstrap';
import {routes} from './router';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import Dialogs from '@/components/dialogs';
import Toast from 'react-native-toast-message';
import Panels from '@/components/panels';
import {DarkTheme, DefaultTheme} from './theme';
import Config from '@/core/config';
import PageBackground from '@/components/base/pageBackground';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import toastConfig from '@/components/base/toast';
import useBootstrap from './useBootstrap';
import Debug from '@/components/debug';
import {ImageViewComponent} from '@/components/imageViewer';
import {PortalHost} from '@/components/base/portal';
import globalStyle from '@/constants/globalStyle';

/**
 * 字体颜色
 */

bootstrap();
const Stack = createNativeStackNavigator<any>();

export default function Pages() {
    const themeName = Config.useConfig('setting.theme.mode') ?? 'dark';
    const themeColors = Config.useConfig('setting.theme.colors') ?? {};
    const theme = true ? DarkTheme : DefaultTheme;
    const isCustom = themeName.includes('custom') ? true : false;
    const mergedTheme = isCustom
        ? {
              ...theme,
              colors: {
                  ...theme.colors,
                  ...themeColors,
              },
          }
        : theme;

    useBootstrap();

    return (
        <GestureHandlerRootView style={globalStyle.flex1}>
            <SafeAreaProvider>
                <NavigationContainer theme={mergedTheme}>
                    <PageBackground />
                    <Stack.Navigator
                        initialRouteName={routes[0].path}
                        screenOptions={{
                            statusBarColor: 'transparent',
                            statusBarTranslucent: true,
                            headerShown: false,
                            animation: 'slide_from_right',
                            animationDuration: 100,
                        }}>
                        {routes.map(route => (
                            <Stack.Screen
                                key={route.path}
                                name={route.path}
                                component={route.component}
                            />
                        ))}
                    </Stack.Navigator>

                    <Panels />
                    <Dialogs />
                    <ImageViewComponent />
                    <Toast config={toastConfig} />
                    <Debug />
                    <PortalHost />
                </NavigationContainer>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}
