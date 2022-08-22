import deepmerge from 'deepmerge';
import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationDefaultTheme,
} from '@react-navigation/native';
import {
  DarkTheme as PaperDarkTheme,
  DefaultTheme as PaperDefaultTheme,
} from 'react-native-paper';

const DarkTheme = deepmerge(PaperDarkTheme, NavigationDarkTheme);
const _DefaultTheme = deepmerge(PaperDefaultTheme, NavigationDefaultTheme);
const _CustomTheme = deepmerge(PaperDarkTheme, NavigationDarkTheme);

const DefaultTheme = {
  ..._DefaultTheme,
  colors: {
    ..._DefaultTheme.colors,
    text: '#333333',
    background: '#66ccff',
  }
}

const CustomTheme = {
  ..._CustomTheme,
  colors: {
    ..._CustomTheme.colors,
    /** 文字 */
    text: '#dddddd',
    placeholder: '#cccccc',
    background: 'rgba(128,128,128,0.1)',
    surface: '#ffffff44',
    backdrop: 'rgba(0,0,0,0.2)',
    primary: "#2b333e",
    accent: '#66ccff',
    disabled: '#66ccff',
    onSurface: '#66ccff',
    notification: '#66ccff'
  },
};

export {DarkTheme, DefaultTheme, CustomTheme};



/**
 * {
            ...DarkTheme,
            colors: {
              ...DarkTheme.colors,
              text: 'white',
              background: 'transparent',
            },
          }
 */
