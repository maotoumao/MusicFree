import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import bootstrap from './bootstrap';
import {navigationRef, routes} from './router';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import Dialogs from '@/components/dialogs';
import Panels from '@/components/panels';
import PageBackground from '@/components/base/pageBackground';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import Debug from '@/components/debug';
import {PortalHost} from '@/components/base/portal';
import globalStyle from '@/constants/globalStyle';
import Theme from '@/core/theme';
import {BootstrapComp} from './useBootstrap';
import {ToastBaseComponent} from '@/components/base/toast';
import {StatusBar} from 'react-native';
import {ReducedMotionConfig, ReduceMotion} from 'react-native-reanimated';
/**
 * 字体颜色
 */

/**
 * 字体颜色
 */

StatusBar.setBackgroundColor('transparent');
StatusBar.setTranslucent(true);

bootstrap();
const Stack = createNativeStackNavigator<any>();

export default function Pages() {
    const theme = Theme.useTheme();

    return (
        <>
            <BootstrapComp />
            <ReducedMotionConfig mode={ReduceMotion.Never} />
            <GestureHandlerRootView style={globalStyle.flex1}>
                <SafeAreaProvider>
                    <NavigationContainer theme={theme} ref={navigationRef}>
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
                        <Debug />
                        <PortalHost />
                        <ToastBaseComponent />
                    </NavigationContainer>
                </SafeAreaProvider>
            </GestureHandlerRootView>
        </>
    );
}
