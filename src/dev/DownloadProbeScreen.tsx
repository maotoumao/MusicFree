/**
 * 下载引擎冒烟屏：__DEV__ 专用，直连 @/native/downloadEngine（自研引擎）
 * 验证 New Arch 下引擎加载、写 basePath/download、进度事件、暂停 / 恢复、同进程重连（getActiveTasks）
 * 正式 core/download 落地后应删除
 */
import { exists, stat } from '@dr.pogodin/react-native-fs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { download } from '@/core/download';
import { player } from '@/core/player';
import { readTags } from '@/infra/audioTags';
import { basePath } from '@/infra/paths';
import {
    downloadEngine,
    DownloadConflictStrategy,
} from '@/native/downloadEngine';

import type { DownloadRequest } from '@/native/downloadEngine';

/** 可编辑：多格式样本直链（中性示例站，非任何音乐厂商），验证 A2 容器嗅探给出正确扩展名。
 * mp3=samplelib、flac/m4a=Espressif dl（CC 授权）；换成你网络可达的 URL 再测。 */
const SAMPLES = {
    mp3: 'https://download.samplelib.com/mp3/sample-3s.mp3',
    flac: 'https://dl.espressif.com/dl/audio/gs-16b-1c-44100hz.flac',
    m4a: 'https://dl.espressif.com/dl/audio/gs-16b-1c-44100hz.m4a',
    // 较大 mp3（约 8 MB），为暂停 / 恢复提供足够长的观测窗口
    big: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
};
/** 封面样本（中性示例站的小 PNG），验证 A3 内嵌封面 */
const COVER_URL = 'https://samplelib.com/png/sample-red-200x200.png';
const DOWNLOAD_DIR = `${basePath}/download`;

export default function DownloadProbeScreen() {
    const [logs, setLogs] = useState<string[]>([]);
    const [conflict, setConflict] = useState<DownloadConflictStrategy>(
        DownloadConflictStrategy.Fail,
    );
    const attemptRef = useRef(0);
    // 最近一次启动的 taskId，供取消针对性操作
    const lastTaskIdRef = useRef('download-probe-mp3');
    // 最近一次启动的 request，供恢复（same taskId 再 start）重放
    const lastReqRef = useRef<DownloadRequest | null>(null);

    const log = useCallback((line: string) => {
        const stamp = new Date().toLocaleTimeString();
        setLogs(prev => [`${stamp}  ${line}`, ...prev].slice(0, 200));
    }, []);

    // 订阅引擎事件（挂载订阅、卸载退订）
    useEffect(() => {
        downloadEngine
            .setup({ progressIntervalMs: 500 })
            .catch(e => log(`setup err ${String(e)}`));
        const subs = [
            downloadEngine.onBegin(e =>
                log(
                    `begin ${e.taskId}#${e.attemptId} ${e.disposition} total=${e.totalBytes}`,
                ),
            ),
            downloadEngine.onProgress(e => {
                const pct =
                    e.totalBytes > 0
                        ? Math.round((e.downloadedBytes / e.totalBytes) * 100)
                        : -1;
                log(`progress ${pct}% ${e.downloadedBytes}/${e.totalBytes}`);
            }),
            downloadEngine.onFinalizing(e =>
                log(`finalizing ${e.taskId}#${e.attemptId}`),
            ),
            downloadEngine.onComplete(async e => {
                log(
                    `complete ${e.taskId} ${e.path} .${e.extension} ${e.sizeBytes}B taggedOk=${e.taggedOk}`,
                );
                try {
                    if (await exists(e.path)) {
                        const info = await stat(e.path);
                        log(`verify exists=true size=${info.size}B`);
                        const t = await readTags(e.path);
                        log(
                            `tags TITLE=${t.fields.TITLE?.[0] ?? '∅'} ARTIST=${
                                t.fields.ARTIST?.[0] ?? '∅'
                            } cover=${t.hasCoverArt}`,
                        );
                    } else {
                        log('verify exists=false ⚠');
                    }
                } catch (err) {
                    log(`verify err ${String(err)}`);
                }
            }),
            downloadEngine.onError(e =>
                log(
                    `error ${e.code}/${e.phase} http=${e.httpStatus} retryable=${e.retryable} ${e.message}`,
                ),
            ),
            downloadEngine.onCanceled(e =>
                log(`canceled ${e.taskId}#${e.attemptId}`),
            ),
            downloadEngine.onPaused(e =>
                log(`paused(system) ${e.taskId}#${e.attemptId}`),
            ),
        ];
        return () => subs.forEach(s => s());
    }, [log]);

    const startDownload = useCallback(
        async (kind: keyof typeof SAMPLES) => {
            attemptRef.current += 1;
            const taskId = `download-probe-${kind}`;
            lastTaskIdRef.current = taskId;
            const request: DownloadRequest = {
                taskId,
                attemptId: attemptRef.current,
                contentKey: `probe-${kind}`,
                url: SAMPLES[kind],
                destDir: DOWNLOAD_DIR,
                stagingKey: `probe-${kind}`,
                // finalName 每次运行唯一，重复测同格式不撞 target exists
                finalName: `probe-${kind}-${attemptRef.current}`,
                // A3：样本 tag + 封面，验证内嵌（完成后 onComplete 回读）
                tags: {
                    fields: {
                        TITLE: [`Probe ${kind} #${attemptRef.current}`],
                        ARTIST: ['MusicFree Probe'],
                        ALBUM: ['A2/A3 Smoke'],
                    },
                    coverUrl: COVER_URL,
                },
            };
            lastReqRef.current = request;
            try {
                const ack = await downloadEngine.start(request);
                log(`start ${kind} ack existing=${ack.existingBytes}`);
            } catch (e) {
                log(`start ${kind} err ${String(e)}`);
            }
        },
        [log],
    );

    // 固定 finalName 触发冲突，验证 conflictStrategy（fail/overwrite/rename）
    const startFixed = useCallback(async () => {
        attemptRef.current += 1;
        const taskId = `download-probe-fixed-${attemptRef.current}`;
        lastTaskIdRef.current = taskId;
        const request: DownloadRequest = {
            taskId,
            attemptId: attemptRef.current,
            contentKey: 'probe-fixed',
            url: SAMPLES.mp3,
            destDir: DOWNLOAD_DIR,
            // .part 每次唯一避免与上次收尾竞争；finalName 固定以触发冲突
            stagingKey: `probe-fixed-${attemptRef.current}`,
            finalName: 'probe-fixed',
            conflictStrategy: conflict,
            tags: {
                fields: {
                    TITLE: [`Fixed #${attemptRef.current}`],
                    ARTIST: ['MusicFree Probe'],
                },
                coverUrl: COVER_URL,
            },
        };
        lastReqRef.current = request;
        try {
            const ack = await downloadEngine.start(request);
            log(`start fixed[${conflict}] ack existing=${ack.existingBytes}`);
        } catch (e) {
            log(`start fixed err ${String(e)}`);
        }
    }, [conflict, log]);

    // 同 finalName、不同 taskId 的两个任务并发启动：验证发布期落名（RENAME 各自避让、混合策略不落同一路径）
    const startPair = useCallback(
        async (sa: DownloadConflictStrategy, sb: DownloadConflictStrategy) => {
            const a = (attemptRef.current += 1);
            const b = (attemptRef.current += 1);
            const mk = (
                n: number,
                s: DownloadConflictStrategy,
            ): DownloadRequest => ({
                taskId: `download-probe-pair-${n}`,
                attemptId: n,
                contentKey: `probe-pair-${n}`,
                url: SAMPLES.mp3,
                destDir: DOWNLOAD_DIR,
                stagingKey: `probe-pair-${n}`,
                finalName: 'probe-pair',
                conflictStrategy: s,
                tags: {
                    fields: {
                        TITLE: [`Pair #${n} ${s}`],
                        ARTIST: ['MusicFree Probe'],
                    },
                },
            });
            log(`pair start ${a}[${sa}] & ${b}[${sb}]`);
            await Promise.all([
                downloadEngine
                    .start(mk(a, sa))
                    .catch(e => log(`pair ${a} err ${String(e)}`)),
                downloadEngine
                    .start(mk(b, sb))
                    .catch(e => log(`pair ${b} err ${String(e)}`)),
            ]);
        },
        [log],
    );

    const reattach = useCallback(async () => {
        try {
            const tasks = await downloadEngine.getActiveTasks();
            log(`getActiveTasks: ${tasks.length}`);
            tasks.forEach(t =>
                log(
                    `  · ${t.taskId}#${t.attemptId} ${t.state} ${t.downloadedBytes}/${t.totalBytes}`,
                ),
            );
            const receipts = await downloadEngine.getUnackedCompletions();
            log(`unacked receipts: ${receipts.length}`);
            receipts.forEach(r =>
                log(
                    `  ✓ ${r.taskId} ${r.extension} ${r.sizeBytes}B tagged=${r.taggedOk}`,
                ),
            );
        } catch (e) {
            log(`reattach err ${String(e)}`);
        }
    }, [log]);

    /** 将所有未入账回执 ack 清除（探针不自动 ack，便于观察跨进程留存） */
    const clearReceipts = useCallback(async () => {
        try {
            const receipts = await downloadEngine.getUnackedCompletions();
            for (const r of receipts) {
                await downloadEngine.ackCompletion(r.taskId);
            }
            log(`ack ${receipts.length} receipts`);
        } catch (e) {
            log(`ack err ${String(e)}`);
        }
    }, [log]);

    /** 清下载目录下不在存活集合中的孤儿 .part；探针传空集，清掉全部残留 .part 以验证扫描/删除 */
    const cleanupOrphans = useCallback(async () => {
        try {
            await downloadEngine.cleanupOrphans(DOWNLOAD_DIR, []);
            log('cleanupOrphans done (liveKeys=[])');
        } catch (e) {
            log(`cleanupOrphans err ${String(e)}`);
        }
    }, [log]);

    const cancelDownload = useCallback(async () => {
        const taskId = lastTaskIdRef.current;
        try {
            await downloadEngine.cancel(taskId);
            log(`cancel ${taskId} sent`);
        } catch (e) {
            log(`cancel err ${String(e)}`);
        }
    }, [log]);

    /** 暂停最近一次任务；引擎会在 worker 退出后进入 Paused */
    const pauseDownload = useCallback(async () => {
        const taskId = lastTaskIdRef.current;
        try {
            await downloadEngine.pause(taskId);
            log(`pause ${taskId} sent`);
        } catch (e) {
            log(`pause err ${String(e)}`);
        }
    }, [log]);

    // 恢复使用相同 taskId 和递增的 attemptId 再次 start；引擎仅在 Paused 时续传
    const resumeDownload = useCallback(async () => {
        const prev = lastReqRef.current;
        if (!prev) {
            log('resume: 无可恢复任务');
            return;
        }
        attemptRef.current += 1;
        const request: DownloadRequest = {
            ...prev,
            attemptId: attemptRef.current,
        };
        try {
            const ack = await downloadEngine.start(request);
            log(`resume ${prev.taskId} ack existing=${ack.existingBytes}`);
        } catch (e) {
            log(`resume err ${String(e)}`);
        }
    }, [log]);

    /**
     * 走完整 JS 编排链路：enqueue → 调度泵 → 源解析 → engine.start → 事件 → 完成入账
     * 用当前播放的歌，这样 MusicItem 和插件都是真的（上面那些按钮是直连引擎，绕过了编排）
     */
    const enqueueCurrent = useCallback(() => {
        const music = player.getCurrentMusic();
        if (!music) {
            log('enqueue: 先随便播一首歌再点');
            return;
        }
        const accepted = download.enqueue([music]);
        log(
            `enqueue ${music.platform}@${music.id} 《${music.title}》 → 受理 ${accepted} 条`,
        );
        if (accepted === 0) {
            log(`  已在队列里，或本地已有不低于请求档的文件`);
        }
    }, [log]);

    /** 查这首歌现在的下载态：活动任务读 registry，已完成读本地库 */
    const inspectCurrent = useCallback(() => {
        const music = player.getCurrentMusic();
        if (!music) {
            log('inspect: 先随便播一首歌再点');
            return;
        }
        const record = download.getRecord(music);
        if (!record) {
            log('inspect: 无下载记录');
            return;
        }
        log(
            record.state === 'done'
                ? `inspect done ${record.resolvedQuality} ${record.path} ${record.sizeBytes}B`
                : `inspect ${record.state} 请求档=${record.requestedQuality}`,
        );
    }, [log]);

    return (
        <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
            <Text style={styles.title}>下载引擎冒烟（dev）</Text>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.btnRow}
            >
                <TouchableOpacity
                    style={styles.btn}
                    onPress={() => startDownload('mp3')}
                >
                    <Text style={styles.btnText}>下 mp3</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.btn}
                    onPress={() => startDownload('flac')}
                >
                    <Text style={styles.btnText}>下 flac</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.btn}
                    onPress={() => startDownload('m4a')}
                >
                    <Text style={styles.btnText}>下 m4a</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.btn}
                    onPress={() => startDownload('big')}
                >
                    <Text style={styles.btnText}>下大</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.btn}
                    onPress={() =>
                        setConflict(c =>
                            c === DownloadConflictStrategy.Fail
                                ? DownloadConflictStrategy.Overwrite
                                : c === DownloadConflictStrategy.Overwrite
                                ? DownloadConflictStrategy.Rename
                                : DownloadConflictStrategy.Fail,
                        )
                    }
                >
                    <Text style={styles.btnText}>策略:{conflict}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btn} onPress={startFixed}>
                    <Text style={styles.btnText}>下同名</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.btn}
                    onPress={() => startPair(conflict, conflict)}
                >
                    <Text style={styles.btnText}>并发x2</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.btn}
                    onPress={() =>
                        startPair(
                            DownloadConflictStrategy.Rename,
                            DownloadConflictStrategy.Overwrite,
                        )
                    }
                >
                    <Text style={styles.btnText}>并发混合</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btn} onPress={reattach}>
                    <Text style={styles.btnText}>重连</Text>
                </TouchableOpacity>
                {/* 下面两个走完整 JS 编排（core/download），其余按钮是直连引擎 */}
                <TouchableOpacity style={styles.btn} onPress={enqueueCurrent}>
                    <Text style={styles.btnText}>下载当前歌</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btn} onPress={inspectCurrent}>
                    <Text style={styles.btnText}>查下载态</Text>
                </TouchableOpacity>
                {/* 暂停后等待任务进入 Paused，再点击恢复 */}
                <TouchableOpacity style={styles.btn} onPress={pauseDownload}>
                    <Text style={styles.btnText}>暂停</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btn} onPress={resumeDownload}>
                    <Text style={styles.btnText}>恢复</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btn} onPress={cancelDownload}>
                    <Text style={styles.btnText}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btn} onPress={clearReceipts}>
                    <Text style={styles.btnText}>清回执</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btn} onPress={cleanupOrphans}>
                    <Text style={styles.btnText}>清孤儿</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.btn}
                    onPress={() => setLogs([])}
                >
                    <Text style={styles.btnText}>清空</Text>
                </TouchableOpacity>
            </ScrollView>
            <ScrollView style={styles.logs}>
                <Text style={styles.logLine}>{logs.join('\n')}</Text>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        padding: 12,
        backgroundColor: '#111',
    },
    title: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 12,
    },
    btnRow: {
        gap: 8,
        paddingBottom: 12,
    },
    btn: {
        backgroundColor: '#2a2a2a',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 8,
    },
    btnText: {
        color: '#fff',
        fontSize: 14,
    },
    logs: {
        flex: 1,
    },
    logLine: {
        color: '#8f8',
        fontSize: 12,
        fontFamily: 'monospace',
    },
});
