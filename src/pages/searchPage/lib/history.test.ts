import { addSearchHistory, removeSearchHistory } from './history';

const cells = new Map<string, unknown>();
const setObjectSpy = jest.fn((key: string, value: unknown) => {
    cells.set(key, value);
    return true;
});

jest.mock('react-native-mmkv', () => ({
    useMMKVString: jest.fn(),
}));

jest.mock('@/infra/storage', () => ({
    getOrCreateMMKV: () => ({}),
    getObject: (_store: unknown, key: string) => mockCells().get(key),
    setObject: (_store: unknown, key: string, value: unknown) =>
        mockSetObject(key, value),
}));

const mockCells = () => cells;
const mockSetObject = (key: string, value: unknown) => setObjectSpy(key, value);

beforeEach(() => {
    cells.clear();
    setObjectSpy.mockClear();
});

describe('搜索历史单条删除', () => {
    it('只删除指定记录并保留原顺序', () => {
        addSearchHistory('first');
        addSearchHistory('second');
        addSearchHistory('third');
        setObjectSpy.mockClear();

        removeSearchHistory('second');

        expect(cells.get('history-search')).toEqual(['third', 'first']);
        expect(setObjectSpy).toHaveBeenCalledTimes(1);
    });

    it('目标不存在时不重复写盘', () => {
        addSearchHistory('first');
        setObjectSpy.mockClear();

        removeSearchHistory('missing');

        expect(setObjectSpy).not.toHaveBeenCalled();
        expect(cells.get('history-search')).toEqual(['first']);
    });
});
