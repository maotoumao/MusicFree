/**
 * 启动序列：装配 container，再执行 pluginManager 和 player 的 setup
 * 同步装配与主题恢复在首次渲染前完成；异步 setup 不阻塞首屏，插件列表由 pluginsAtom 反应式更新
 */
import { showToast } from '@/components/overlay';
import { audioEffect } from '@/core/audioEffect';
import { download } from '@/core/download';
import { floatingLyric } from '@/core/floatingLyric';
import { history } from '@/core/history';
import { lyric } from '@/core/lyric';
import { player } from '@/core/player';
import { playlist } from '@/core/playlist';
import { pluginManager } from '@/core/plugin';
import { sleepTimer } from '@/core/sleepTimer';
import { t } from '@/i18n';

import { assembleContainer } from '../container';

import { syncCustomNotificationButtons } from './customNotificationButtons';
import { activateDeepLinkHandling, captureDeepLinks } from './deepLinkHandler';
import { installErrorHandlers } from './errorHandlers';
import {
    subscribeFloatingLyricRequests,
    syncFloatingLyricLabels,
} from './floatingLyricHandlers';
import { restoreLocale } from './locale';
import { activateTheme } from './theme';

import type { PlayerErrorCode } from '@/core/player';
import type { PlainKey } from '@/i18n';

/** 需要向用户 toast 的播放错误码 → 文案 key；未列入的 code 不弹（内部 / 非用户可感知） */
const PLAYBACK_ERROR_TOAST: Partial<Record<PlayerErrorCode, PlainKey>> = {
    invalidItem: 'feedback.playback.invalidItem',
    cellularBlocked: 'feedback.playback.cellularBlocked',
    // 拉源失败 sourceUnavailable 暂不提示（渠道仍上报，待合适 UI 再定）
};

/** 启动首步：由 index.js 调；同步装配 + 异步启动，不 await 于渲染 */
export async function bootstrap(): Promise<void> {
    assembleContainer();
    // 紧跟装配：errorLog 此时才存在。更早的模块求值期异常本就不是 JS 处理器能接住的
    installErrorHandlers();
    // 首个 await 前同步恢复主题并建立订阅，避免首屏先画默认主题；文件对账由内部后台启动
    activateTheme();
    captureDeepLinks();
    // 定时关闭：只注册内存订阅（不依赖 player.setup），故紧跟装配——
    // 首个 await 后用户已可能触发定时，此时订阅必须已建立，否则等待态无人收口
    sleepTimer.setup();
    try {
        // 语言排在最前：后续步骤的 toast 与首屏文案都按用户所选语言呈现
        restoreLocale();
    } catch {
        // 存储异常不拖垮启动：保持默认语言
    }
    // 播放失败按需弹提示（并非所有错误码都提示用户）；app 生命周期常驻订阅
    player.subscribeError(error => {
        const messageKey = PLAYBACK_ERROR_TOAST[error.code];
        if (messageKey) {
            showToast(t(messageKey), { type: 'error' });
        }
    });
    player.subscribePlaybackStarted(item => history.add(item));

    try {
        // 歌单启动迁移：读 legacy LocalSheet.* → 写干净 Playlist.*（setup 恒 resolve、独立于插件/播放器）
        await playlist.setup();
    } catch {
        // 隔离意外异常，不拖垮后续启动步骤
    }
    try {
        await pluginManager.setup();
    } catch {
        // setup 失败不挡启动：列表为空，用户可重试；下轮启动再对账
    }
    try {
        // 插件就绪后启动 player；会话恢复的自动续播依赖插件解析音源
        await player.setup();
    } catch {
        // player setup 失败不阻塞启动；会话恢复失败时保持空播放态
    }
    activateDeepLinkHandling();
    try {
        // 音效：EQ 需引擎 audioSessionId 就绪（player.setup 内建），故放其后；探测可用性 + 重放持久 EQ 配置
        await audioEffect.setup();
    } catch {
        // 无 EQ / 原生缺失：可用性保持 false，入口自动隐藏
    }
    // 歌词管理器：订阅切歌 / 进度；放 player.setup 后，好让 subscribeCurrentMusic 回放到已恢复的当前歌
    lyric.setup();
    try {
        // 桌面歌词：放最后，让当前歌 / 歌词内容订阅回放到已恢复态；Android-only，内部按平台守卫
        // 文案先于 setup 推入：浮层是原生视图，自己不认识任何用户可见文案
        syncFloatingLyricLabels();
        floatingLyric.setup();
        // 订阅 core 的 UI 请求事件（设置键打开面板 / 无权限引导授权 / 回正在播放页）；随进程存活
        subscribeFloatingLyricRequests();
    } catch (e) {
        // 启动失败（如 Android 缺原生模块）：dev 下抛出暴露配置错误，生产静默不拖垮启动
        if (__DEV__) {
            throw e;
        }
    }
    // 通知栏自定义按钮（收藏 / 桌面歌词）：放桌面歌词之后，好让歌词按钮态读到已恢复的配置
    syncCustomNotificationButtons();
    // 下载：初始化引擎 + 清上次进程残留的 `.part`
    // 放最后：它要扫盘，不该拖住前面那些用户能直接感知的初始化；内部恒 resolve
    await download.setup();

    // 插件自动更新：开关开且距上次满一天才跑，全程静默；不 await，纯后台（内部恒 resolve）
    pluginManager.autoUpdate();
}
