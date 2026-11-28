import { Linking } from 'react-native';

import { showToast } from '@/components/overlay';
import { localMusic } from '@/core/localMusic';
import { player } from '@/core/player';
import { t } from '@/i18n';
import { navigationRef } from '@/infra/navigation';

const FILE_URL = /^(?:content|file):\/\//i;

let listening = false;
let enabled = false;
let pendingUrls: string[] = [];
let handling = Promise.resolve();

/** 尽早捕获冷 / 热启动的系统文件打开请求；播放器就绪前只排队 */
export function captureDeepLinks(): void {
    if (listening) {
        return;
    }
    listening = true;
    Linking.addEventListener('url', event => enqueue(event.url));
    Linking.getInitialURL()
        .then(url => {
            if (url) {
                enqueue(url);
            }
        })
        .catch(() => undefined);
}

/** player setup 完成后放行已捕获请求；后续请求随到随处理 */
export function activateDeepLinkHandling(): void {
    if (enabled) {
        return;
    }
    enabled = true;
    const queued = pendingUrls;
    pendingUrls = [];
    queued.forEach(schedule);
}

function enqueue(url: string): void {
    if (!FILE_URL.test(url)) {
        return;
    }
    if (!enabled) {
        pendingUrls.push(url);
        return;
    }
    schedule(url);
}

function schedule(url: string): void {
    handling = handling.then(() => openAudio(url)).catch(showOpenFailed);
}

async function openAudio(url: string): Promise<void> {
    const resolved = await localMusic.resolveMusicFile(url);
    if (!resolved) {
        showOpenFailed();
        return;
    }
    await player.play(resolved.item, {
        preferredLocalPath: resolved.path,
    });
    openMusicDetailWhenReady();
}

function openMusicDetailWhenReady(): void {
    if (navigationRef.isReady()) {
        navigationRef.navigate('MusicDetail');
        return;
    }
    const unsubscribe = navigationRef.addListener('state', () => {
        if (navigationRef.isReady()) {
            unsubscribe();
            navigationRef.navigate('MusicDetail');
        }
    });
}

function showOpenFailed(): void {
    showToast(t('localMusic.openFileFailed'), { type: 'error' });
}
