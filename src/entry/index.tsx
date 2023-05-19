import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import bootstrap from './bootstrap';
import {routes} from './router';
import {Provider as PaperProvider} from 'react-native-paper';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import Dialogs from '@/components/dialogs';
import Toast from 'react-native-toast-message';
import Panels from '@/components/panels';
import {CustomTheme, DefaultTheme} from './theme';
import Config from '@/core/config';
import PageBackground from '@/components/base/pageBackground';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import toastConfig from '@/components/base/toast';
import useBootstrap from './useBootstrap';
import Debug from '@/components/debug';
import {ImageViewComponent} from '@/components/imageViewer';

/**
 * 字体颜色
 */

bootstrap();
const Stack = createNativeStackNavigator<any>();

export default function Pages() {
    const themeName = Config.useConfig('setting.theme.mode') ?? 'dark';
    const themeColors = Config.useConfig('setting.theme.colors') ?? {};
    const theme = themeName.includes('dark') ? CustomTheme : DefaultTheme;
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
        <GestureHandlerRootView style={{flex: 1}}>
            <PaperProvider theme={mergedTheme}>
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
                                animationDuration: 200,
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
                    </NavigationContainer>
                </SafeAreaProvider>
            </PaperProvider>
        </GestureHandlerRootView>
    );
}
