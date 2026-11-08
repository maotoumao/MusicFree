import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {internalSerializeKey} from '@/constants/commonConst';
import LocalMusicSheet from '@/core/localMusicSheet';
import {getMediaExtra, patchMediaExtra} from '@/utils/mediaExtra';
import {getStorage, setStorage} from '@/utils/storage';
import {unlink} from 'react-native-fs';

jest.mock('react-native-reanimated', () => ({
    Easing: {out: easing => easing, exp: () => {}},
}));
jest.mock('react-native-fs', () => {
    const fs = require('node:fs');
    return {
        exists: async file => fs.existsSync(file),
        unlink: jest.fn(file => fs.promises.unlink(file)),
    };
});
jest.mock('@/native/mp3Util', () => ({}));
jest.mock('@/utils/fileUtils.ts', () => ({}));
jest.mock('@/utils/getOrCreateMMKV', () => {
    const values = new Map();
    return () => ({
        getString: key => values.get(key),
        set: (key, value) => values.set(key, value),
    });
});
jest.mock('@/utils/storage', () => ({
    getStorage: jest.fn(),
    setStorage: jest.fn(),
}));
jest.mock('nanoid', () => ({}));

const song = {id: 'test-song', platform: 'test-plugin'};
let folder;
let file;

beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'musicfree-download-'));
    file = path.join(folder, 'track.mp3');
    fs.writeFileSync(file, 'test audio');
    patchMediaExtra(song, {downloaded: true, localPath: file, lyricOffset: 25});
    setStorage.mockClear();
});

afterEach(() => {
    if (fs.existsSync(file)) {
        fs.unlinkSync(file);
    }
    fs.rmdirSync(folder);
});

test.each([false, true])('deletes the file and download metadata (legacy path: %s)', async legacy => {
    getStorage.mockResolvedValue([
        legacy ? {...song, [internalSerializeKey]: {localPath: file}} : song,
    ]);
    await LocalMusicSheet.setup();
    expect(LocalMusicSheet.isLocalMusic(song)).toBeTruthy();

    await LocalMusicSheet.removeMusic(song, true);

    expect(fs.existsSync(file)).toBe(false);
    expect(LocalMusicSheet.isLocalMusic(song)).toBeUndefined();
    expect(setStorage).toHaveBeenLastCalledWith('local-music-sheet', []);
    expect(getMediaExtra(song)).toEqual({downloaded: false, lyricOffset: 25});
});

test('preserves the local file and metadata when only removing the list entry', async () => {
    getStorage.mockResolvedValue([song]);
    await LocalMusicSheet.setup();

    await LocalMusicSheet.removeMusic(song);

    expect(fs.existsSync(file)).toBe(true);
    expect(getMediaExtra(song)).toEqual({downloaded: true, localPath: file, lyricOffset: 25});
});

test('keeps the list entry and download metadata if deletion fails', async () => {
    getStorage.mockResolvedValue([song]);
    await LocalMusicSheet.setup();
    unlink.mockRejectedValueOnce(new Error('Permission denied'));

    await expect(LocalMusicSheet.removeMusic(song, true)).rejects.toThrow('Permission denied');

    expect(fs.existsSync(file)).toBe(true);
    expect(LocalMusicSheet.isLocalMusic(song)).toBeTruthy();
    expect(getMediaExtra(song)).toEqual({downloaded: true, localPath: file, lyricOffset: 25});
});
