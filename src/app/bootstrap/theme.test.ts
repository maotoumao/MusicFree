import { THEME_COLOR_ROLES } from '@/core/theme';
import { lightColors } from '@/design/tokens/colors';

jest.mock('@/infra/paths', () => ({ basePath: '/base' }));
jest.mock('@/infra/storage', () => ({
    getOrCreateMMKV: () => ({
        getAllKeys: () => [],
        addOnValueChangedListener: () => ({ remove: () => undefined }),
    }),
    getObject: () => undefined,
    getStoreVersion: () => 2,
    setObject: () => true,
    setStoreVersion: () => undefined,
}));
jest.mock('@dr.pogodin/react-native-fs', () => ({
    copyFile: jest.fn(),
    exists: jest.fn(),
    mkdir: jest.fn(),
    moveFile: jest.fn(),
    readDir: jest.fn(),
    stat: jest.fn(),
    unlink: jest.fn(),
    writeFile: jest.fn(),
}));

/**
 * `core` 不能 import `design`，可覆盖角色名只能手抄一份；组合根是唯一同时认识两边的层，
 * 由它守住这条接缝：漏改一个名字，用户的覆盖会被静默注入到没人读的野键上、毫无报错
 */
describe('可覆盖主题角色与语义 token 词表', () => {
    it('每个可覆盖角色都是真实存在的语义 token', () => {
        const tokens = new Set(Object.keys(lightColors));
        const unknown = THEME_COLOR_ROLES.filter(role => !tokens.has(role));

        expect(unknown).toEqual([]);
    });
});
