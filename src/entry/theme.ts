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
    placeholder: '#666666',
    background: 'rgba(128,128,128,0.1)',
    primary: '#cdd1d3',
    surface: '#cdd1d3',
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
    surface: '#2b333e',
    backdrop: 'rgba(0,0,0,0.2)',
    primary: "#2b333e",
    accent: '#cdd1d3',
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
