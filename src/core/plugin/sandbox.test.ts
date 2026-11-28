import axios, { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';

jest.mock('cheerio', () => ({}));
jest.mock('webdav', () => ({}));
jest.mock('@/infra/device', () => ({
    appVersion: '1.0.0-test',
    os: 'android',
}));

import { compile, createSandboxEnv } from './sandbox';

describe('plugin sandbox axios Cookie / withCredentials policy (#670)', () => {
    const captured: InternalAxiosRequestConfig[] = [];

    beforeEach(() => {
        captured.length = 0;
        jest.spyOn(axios, 'getAdapter').mockImplementation(
            () => async (config: InternalAxiosRequestConfig) => {
                captured.push(config);
                return {
                    data: { ok: true },
                    status: 200,
                    statusText: 'OK',
                    headers: new AxiosHeaders({
                        'set-cookie': ['a=1,b=2'],
                    }),
                    config,
                };
            },
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('sets withCredentials=false when plugin passes explicit Cookie header (case-insensitive)', async () => {
        const { definition } = compile(
            `
            const axios = require('axios');
            module.exports = {
                platform: 'test-cookie',
                async getTopLists() {
                    await axios.get('https://example.com/a', {
                        headers: { Cookie: 'MUSIC_U=vip_token; csrf=1' },
                    });
                    await axios.get('https://example.com/b', {
                        headers: { cookie: 'lower_case=1' },
                    });
                    return [];
                },
            };
            `,
            createSandboxEnv(() => ({})),
        );

        await definition.getTopLists!();

        expect(captured).toHaveLength(2);
        expect(captured[0]?.withCredentials).toBe(false);
        expect(captured[0]?.headers.get('cookie')).toBe(
            'MUSIC_U=vip_token; csrf=1',
        );
        expect(captured[1]?.withCredentials).toBe(false);
        expect(captured[1]?.headers.get('cookie')).toBe('lower_case=1');
    });

    it('preserves default withCredentials when Cookie header is absent or undefined', async () => {
        const { definition } = compile(
            `
            const axios = require('axios');
            module.exports = {
                platform: 'test-no-cookie',
                async getTopLists() {
                    await axios.get('https://example.com/plain');
                    await axios.get('https://example.com/undef', {
                        headers: { Cookie: undefined },
                    });
                    return [];
                },
            };
            `,
            createSandboxEnv(() => ({})),
        );

        await definition.getTopLists!();

        expect(captured).toHaveLength(2);
        expect(captured[0]?.withCredentials).toBeUndefined();
        expect(captured[1]?.withCredentials).toBeUndefined();
    });

    it('respects explicit withCredentials=true even when Cookie header is set', async () => {
        const { definition } = compile(
            `
            const axios = require('axios');
            module.exports = {
                platform: 'test-explicit-creds',
                async getTopLists() {
                    await axios.get('https://example.com/creds', {
                        headers: { Cookie: 'a=1' },
                        withCredentials: true,
                    });
                    return [];
                },
            };
            `,
            createSandboxEnv(() => ({})),
        );

        await definition.getTopLists!();

        expect(captured).toHaveLength(1);
        expect(captured[0]?.withCredentials).toBe(true);
    });

    it('applies policy to axios.create() child instances and dynamic request interceptors', async () => {
        const { definition } = compile(
            `
            const axios = require('axios');
            const client = axios.create({ baseURL: 'https://example.com' });
            client.interceptors.request.use(cfg => {
                cfg.headers.Cookie = 'DYNAMIC_COOKIE=xyz';
                return cfg;
            });
            module.exports = {
                platform: 'test-child-instance',
                async getTopLists() {
                    const res = await client.get('/sub');
                    return res.headers['set-cookie'];
                },
            };
            `,
            createSandboxEnv(() => ({})),
        );

        const cookies = await definition.getTopLists!();

        expect(captured).toHaveLength(1);
        expect(captured[0]?.withCredentials).toBe(false);
        expect(captured[0]?.headers.get('cookie')).toBe('DYNAMIC_COOKIE=xyz');
        expect(cookies).toEqual(['a=1', 'b=2']);
    });

    it('forwards request config to axios.getAdapter so custom fetch env works', async () => {
        const getAdapterSpy = jest.mocked(axios.getAdapter);
        const { definition } = compile(
            `
            const axios = require('axios');
            const client = axios.create({ adapter: 'fetch' });
            module.exports = {
                platform: 'test-fetch-env',
                async getTopLists() {
                    await client.get('https://example.com/fetch', {
                        headers: { Cookie: 'c=1' },
                    });
                    return [];
                },
            };
            `,
            createSandboxEnv(() => ({})),
        );

        await definition.getTopLists!();

        expect(getAdapterSpy).toHaveBeenCalledWith(
            'fetch',
            expect.objectContaining({ url: 'https://example.com/fetch' }),
        );
    });
});
