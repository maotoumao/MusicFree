/**
 * 组合根装配：按拓扑序 provideXxx(new Xxx(deps)) 装配 core 单例
 * 唯一知道各 core 具体实现的地方；只装配、不含业务；随各轮增量补
 */

import { AppUpdate, provideAppUpdate } from '@/core/appUpdate';
import { AudioEffect, provideAudioEffect } from '@/core/audioEffect';
import { Backup, provideBackup } from '@/core/backup';
import { Config, provideConfig } from '@/core/config';
import { Download, provideDownload } from '@/core/download';
import { ErrorLog, provideErrorLog } from '@/core/errorLog';
import { FloatingLyric, provideFloatingLyric } from '@/core/floatingLyric';
import { History, provideHistory } from '@/core/history';
import { LocalMusic, provideLocalMusic } from '@/core/localMusic';
import { Lyric, provideLyric } from '@/core/lyric';
import { MediaMeta, provideMediaMeta } from '@/core/mediaMeta';
import { Player, providePlayer } from '@/core/player';
import { Playlist, providePlaylist } from '@/core/playlist';
import { PluginManager, providePluginManager } from '@/core/plugin';
import { SleepTimer, provideSleepTimer } from '@/core/sleepTimer';
import { provideTheme, Theme } from '@/core/theme';
import { getLocale } from '@/i18n';
import {
    appVersion,
    buildNumber,
    deviceModel,
    os,
    osVersion,
} from '@/infra/device';

/** 同步装配 core 单例（按拓扑序：被依赖的在前） */
export function assembleContainer(): void {
    // —— 配置：最底层，其他模块的依赖 ——
    const config = new Config();
    provideConfig(config);

    // —— 主题：无依赖，同步读取持久偏好；文件对账由 bootstrap 后台启动 ——
    provideTheme(new Theme());

    // —— mediaMeta：无依赖，仅读取 MMKV ——
    const mediaMeta = new MediaMeta();
    provideMediaMeta(mediaMeta);

    // —— 插件：构造依赖 config ——
    const pluginManager = new PluginManager({ config });
    providePluginManager(pluginManager);

    // —— 错误日志：依赖 pluginManager（只快照 platform+version，不碰用户变量）——
    // 紧跟插件之后装配：此后任何 core 的构造异常都已能被上报
    const errorLog = new ErrorLog({
        pluginManager,
        environment: {
            appVersion,
            buildNumber,
            os,
            osVersion,
            deviceModel,
            now: () => Date.now(),
        },
    });
    provideErrorLog(errorLog);

    // —— player：依赖 pluginManager、config 和 mediaMeta ——
    const player = new Player({ pluginManager, config, mediaMeta });
    providePlayer(player);

    // —— history：仅依赖 config ——
    const history = new History({ config });
    provideHistory(history);

    // —— playlist：依赖 config + errorLog（迁移 / 水合降级只留痕不提示）；setup() 由 bootstrap 调、跑迁移阶梯 ——
    const playlist = new Playlist({ config, errorLog });
    providePlaylist(playlist);

    // —— lyric：依赖 config（自动搜索）+ player（切歌 / 进度 / 取初值）+ pluginManager（取词）+ mediaMeta（手动偏移）——
    const lyric = new Lyric({ config, player, pluginManager, mediaMeta });
    provideLyric(lyric);

    // —— 桌面歌词：依赖 config（读写配置）+ lyric（当前内容）+ player（兜底歌名 / 显隐）——
    const floatingLyric = new FloatingLyric({ config, lyric, player });
    provideFloatingLyric(floatingLyric);

    // —— 本地音乐：懒加载库（不进浏览页不占内存）；依赖 mediaMeta 写本地路径供 player 音源 ——
    // getDownloadDir 取值函数在此闭合 download 单例（它下面才装配，故必须惰性取）：
    // 「下载的歌算作本地音乐」开着时扫描要一并看那个目录，见 LocalMusicDeps
    const localMusic = new LocalMusic({
        mediaMeta,
        // 显式标注返回类型：不标的话 TS 会顺着 localMusic → download → localMusic 兜圈子推不出来
        getDownloadTarget: (): { dir: string; isAppPrivate: boolean } => ({
            dir: download.getDownloadDir(),
            isAppPrivate: download.isUsingDefaultDownloadDir(),
        }),
        // 现问现取：用户改语言后下一次扫描就该换码表（见 LocalMusicDeps）
        getLocale,
    });
    provideLocalMusic(localMusic);

    // —— 音效：仅依赖 config（持久化 EQ 配置）；setup() 由 bootstrap 于 player.setup 后调 ——
    const audioEffect = new AudioEffect({ config });
    provideAudioEffect(audioEffect);

    // —— 定时关闭：到点调 player 停止；config 存两项偏好（倒计时本身不持久化）——
    const sleepTimer = new SleepTimer({ player, config });
    provideSleepTimer(sleepTimer);

    // —— 下载：config 控并发/间隔/音质，pluginManager 解析音源，localMusic 接收完成的文件，mediaMeta 存离线锚点 ——
    const download = new Download({
        config,
        pluginManager,
        localMusic,
        mediaMeta,
    });
    provideDownload(download);

    // —— 备份：编排各传输端口 + config（读快照组装信封）——
    const backup = new Backup({
        playlist,
        pluginManager,
        mediaMeta,
        config,
    });
    provideBackup(backup);

    // —— 更新检查：无依赖，只取远端清单与本机版本比对 ——
    provideAppUpdate(new AppUpdate());
}
