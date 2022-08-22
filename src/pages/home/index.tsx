/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * Generated with the TypeScript template
 * https://github.com/react-native-community/react-native-template-typescript
 *
 * @format
 */

import React from 'react';
import {StatusBar, StyleSheet, View} from 'react-native';

import NavBar from './components/navBar';
import Operations from './components/operations';
import MySheets from './components/mySheets';
import MusicBar from '@/components/musicBar';
import {Divider} from 'react-native-paper';
import {createDrawerNavigator} from '@react-navigation/drawer';
import HomeDrawer from './components/drawer';
import getStatusBarHeight from '@/utils/getStatusBarHeight';
import rpx from '@/utils/rpx';

function Home() {
  return (
    <View style={styles.appWrapper}>
      <StatusBar></StatusBar>
      <NavBar></NavBar>
      <Divider></Divider>
      <Operations></Operations>
      <MySheets></MySheets>
      <MusicBar></MusicBar>
    </View>
  );
}

const LeftDrawer = createDrawerNavigator();
export default function App() {
  return (
    <LeftDrawer.Navigator
      screenOptions={{
        headerShown: false,
        drawerStyle: {
          width: rpx(600),
        },
      }}
      initialRouteName="HOME-MAIN"
      drawerContent={props => <HomeDrawer {...props}></HomeDrawer>}>
      <LeftDrawer.Screen name="HOME-MAIN" component={Home}></LeftDrawer.Screen>
    </LeftDrawer.Navigator>
  );
}

const styles = StyleSheet.create({
  appWrapper: {
    flexDirection: 'column',
    height: '100%',
    paddingTop: getStatusBarHeight(),
  },
});
