import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import bootstrap from './bootstrap';
import {routes} from './router';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import Dialogs from '@/components/dialogs';
import Toast from 'react-native-toast-message';
import Panels from '@/components/panels';
import PageBackground from '@/components/base/pageBackground';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import toastConfig from '@/components/base/toast';
import Debug from '@/components/debug';
import {ImageViewComponent} from '@/components/imageViewer';
import {PortalHost} from '@/components/base/portal';
import globalStyle from '@/constants/globalStyle';
import Theme from '@/core/theme';
import {BootstrapComp} from './useBootstrap';

/**
 * 字体颜色
 */

bootstrap();
const Stack = createNativeStackNavigator<any>();

export default function Pages() {
    const theme = Theme.useTheme();

    return (
        <>
            <BootstrapComp />
            <GestureHandlerRootView style={globalStyle.flex1}>
                <SafeAreaProvider>
                    <NavigationContainer theme={theme}>
                        <PageBackground />
                        <Stack.Navigator
                            initialRouteName={routes[0].path}
                            screenOptions={{
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
        </>
    );
}
