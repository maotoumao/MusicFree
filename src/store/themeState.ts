import {atomWithStorage, loadable} from 'jotai/utils';
import storage from './storage';

// 主题相关的状态

const themeState = {
  /** 文字、图标颜色 */
  textColor: '#333333',
  /** 背景图 */
  backgroundImage: undefined,
};
const themeStateAtom = atomWithStorage<typeof themeState>(
  'theme',
  themeState,
  storage,
);
const loadableThemeStateAtom = loadable(themeStateAtom);

export {themeStateAtom, loadableThemeStateAtom};
