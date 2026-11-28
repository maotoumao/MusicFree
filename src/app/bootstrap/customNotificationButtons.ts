/**
 * 桥接通知栏自定义按钮与 core / i18n：core 不 import i18n，故按钮文案只能在 app 层组装
 * 单向环：任一数据源变化 → 全量重组按钮表下发 → 用户点击回传标识 → 在此按当前状态决策 → 状态变化回到起点
 * 原生零状态：图标由 state 决定、落位定死，它既不知道收藏是什么也不知道点了会发生什么
 * 启动订阅一次、随进程存活（不退订）
 */
import { config } from '@/core/config';
import { floatingLyric } from '@/core/floatingLyric';
import { player } from '@/core/player';
import { playlist } from '@/core/playlist';
import { localeAtom, t } from '@/i18n';
import { CustomNotificationButtonId } from '@/native/audioEngine';
import { atomStore } from '@/utils/atomStore';

import type { PlainKey } from '@/i18n';
import type { CustomNotificationButtons } from '@/native/audioEngine';

/**
 * 通知栏那个按钮只代表「桌面歌词卡」这一件事，与状态栏条无关：
 * 开着状态栏条时它显示为未开启，点一下就把浮层换成桌面歌词卡
 */
type LyricCardButtonState = 'off' | 'on' | 'locked';

function readLyricCardState(): LyricCardButtonState {
    // 没开浮层、或开的是状态栏条，都算「桌面歌词卡没开」
    if (
        !config.get('floatingLyric.enabled') ||
        config.get('floatingLyric.mode') !== 'desktop'
    ) {
        return 'off';
    }
    // locked 单列是因为锁定后卡片不可点，通知栏是唯一顺手的解锁入口
    return config.get('floatingLyric.desktop.locked') ? 'locked' : 'on';
}

const LYRIC_CARD_TITLE_KEYS = {
    off: 'playbackNotification.showLyricCard',
    on: 'playbackNotification.hideLyricCard',
    locked: 'playbackNotification.unlockLyricCard',
} as const satisfies Record<LyricCardButtonState, PlainKey>;

/** 组装当前状态下的整张按钮表；无当前曲时不放收藏（没有可收藏的对象） */
function buildButtons(): CustomNotificationButtons {
    const current = player.getCurrentMusic();
    const lyricState = readLyricCardState();
    const buttons: CustomNotificationButtons = {
        lyric: {
            state: lyricState,
            title: t(LYRIC_CARD_TITLE_KEYS[lyricState]),
        },
    };
    if (current) {
        const favorited = playlist.isFavorite(current);
        buttons.favorite = {
            state: favorited ? 'on' : 'off',
            title: favorited
                ? t('playbackNotification.unfavorite')
                : t('playbackNotification.favorite'),
        };
    }
    return buttons;
}

function publishButtons(): void {
    player.setCustomNotificationButtons(buildButtons());
}

/** 按钮点击：原生只回传标识，具体动作按当前状态推导 */
function handleButton(button: CustomNotificationButtonId): void {
    if (button === CustomNotificationButtonId.Favorite) {
        const current = player.getCurrentMusic();
        if (!current) {
            return;
        }
        // 失败（存储降级等）不重试也不提示：通知栏没有承载错误的位置，按钮表会在下次变化时回到真实状态
        playlist.toggleFavorite(current).catch(() => {});
        return;
    }
    switch (readLyricCardState()) {
        case 'off':
            // 开着状态栏条时先换回卡片形态，两者互斥
            config.set('floatingLyric.mode', 'desktop');
            // TODO 无悬浮窗权限时 core 发权限引导事件，但 app 在后台的话对话框看不见、
            // 通知栏这一下表现为无响应；需要一并把 app 拉到前台
            floatingLyric.enable().catch(() => {});
            break;
        case 'on':
            floatingLyric.disable();
            break;
        case 'locked':
            config.set('floatingLyric.desktop.locked', false);
            break;
    }
}

/** 启动时下发一次并订阅全部数据源（随进程存活，不退订） */
export function syncCustomNotificationButtons(): void {
    publishButtons();
    player.subscribeCurrentMusic(publishButtons);
    playlist.subscribeFavoriteChange(publishButtons);
    config.subscribe(
        [
            'floatingLyric.enabled',
            'floatingLyric.mode',
            'floatingLyric.desktop.locked',
        ],
        publishButtons,
    );
    atomStore.sub(localeAtom, publishButtons);
    player.subscribeCustomNotificationButton(handleButton);
}
