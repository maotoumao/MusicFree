/**
 * Player 冒烟屏：仅在 __DEV__ 下使用，直接驱动 core/player（真实 Player 和 hooks）
 * 使用内嵌直链 MusicItem；resolver 走 embedded 路径解析 item.url，无需安装 plugin
 * core/player 接入正式 UI 后删除此页面
 */
import { useCallback, useMemo, useState } from 'react';
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { history, useHistory } from '@/core/history';
import {
    player,
    useCurrentMusic,
    usePlaybackRate,
    usePlaybackState,
    usePreferredQuality,
    useProgress,
    useQueue,
    useRepeatMode,
} from '@/core/player';

import type { MusicItem } from '@/types';

/** 内嵌直链 MusicItem：resolver 无插件时走 embedded 路径解析 item.url */
function song(id: string, title: string, url: string): MusicItem {
    return {
        platform: 'smoke',
        id,
        title,
        artist: 'SoundHelix',
        album: '',
        artwork: '',
        duration: 0,
        url,
    };
}

const SONGS: MusicItem[] = [
    song(
        's1',
        'Song 1',
        'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    ),
    song(
        's2',
        'Song 2',
        'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    ),
    song(
        's3',
        'Song 3',
        'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    ),
];

/** 队列摘要上限：仅展示前几项，避免恢复 1 万项队列时整队格式化 */
const QUEUE_PREVIEW = 5;

function Btn({ label, onPress }: { label: string; onPress: () => void }) {
    return (
        <TouchableOpacity style={styles.btn} onPress={onPress}>
            <Text style={styles.btnText}>{label}</Text>
        </TouchableOpacity>
    );
}

function Row({ children }: { children: React.ReactNode }) {
    return <View style={styles.row}>{children}</View>;
}

export default function PlayerProbeScreen() {
    const current = useCurrentMusic();
    const queue = useQueue();
    const state = usePlaybackState();
    const progress = useProgress();
    const repeat = useRepeatMode();
    const rate = usePlaybackRate();
    const quality = usePreferredQuality();
    const historyList = useHistory();
    const [err, setErr] = useState<string | null>(null);

    // 统一执行命令：显式暴露 SlotController 未向外抛出的失败，便于诊断成功、无效和解析失败
    const run = useCallback((action: () => Promise<void>) => {
        setErr(null);
        action().catch((e: unknown) => setErr(String(e)));
    }, []);

    const queueSummary = useMemo(() => {
        const head = queue
            .slice(0, QUEUE_PREVIEW)
            .map(q => q.title)
            .join(', ');
        const more = queue.length > QUEUE_PREVIEW ? ' …' : '';
        return `${head}${more}` || '-';
    }, [queue]);

    const historySummary = useMemo(() => {
        const head = historyList
            .slice(0, QUEUE_PREVIEW)
            .map(h => h.title)
            .join(', ');
        const more = historyList.length > QUEUE_PREVIEW ? ' …' : '';
        return `${head}${more}` || '-';
    }, [historyList]);

    const removeCurrent = useCallback(() => {
        if (current) {
            run(() => player.removeFromQueue(current));
        }
    }, [current, run]);

    return (
        <SafeAreaView style={styles.root}>
            <ScrollView contentContainerStyle={styles.body}>
                <Text style={styles.h}>Player 冒烟</Text>
                <Text style={styles.mono}>state: {state}</Text>
                <Text style={styles.mono}>
                    current: {current?.title ?? '-'}
                </Text>
                <Text style={styles.mono}>
                    progress: {progress.position.toFixed(1)}/
                    {progress.duration.toFixed(1)} buf=
                    {progress.buffered.toFixed(1)}
                </Text>
                <Text style={styles.mono}>
                    repeat: {repeat} rate: {rate}x quality: {quality}
                </Text>
                <Text style={styles.mono}>
                    queue({queue.length}): {queueSummary}
                </Text>
                <Text style={styles.mono}>
                    history({historyList.length}): {historySummary}
                </Text>
                {err ? <Text style={styles.err}>err: {err}</Text> : null}

                <Row>
                    <Btn
                        label="载入并播放"
                        onPress={() =>
                            run(() =>
                                player.replaceQueueAndPlay(SONGS[0]!, SONGS),
                            )
                        }
                    />
                    <Btn
                        label="全部播放"
                        onPress={() => run(() => player.playAll(SONGS))}
                    />
                    <Btn
                        label="暂停"
                        onPress={() => run(() => player.pause())}
                    />
                    <Btn
                        label="播放"
                        onPress={() => run(() => player.play())}
                    />
                </Row>
                <Row>
                    <Btn
                        label="上一首"
                        onPress={() => run(() => player.skipToPrevious())}
                    />
                    <Btn
                        label="下一首"
                        onPress={() => run(() => player.skipToNext())}
                    />
                    <Btn
                        label="+10s"
                        onPress={() =>
                            run(() => player.seekTo(progress.position + 10))
                        }
                    />
                </Row>
                <Row>
                    <Btn
                        label="循环模式"
                        onPress={() => run(() => player.toggleRepeatMode())}
                    />
                    <Btn
                        label={rate === 1 ? '1.5x' : '1x'}
                        onPress={() =>
                            run(() =>
                                player.setPlaybackRate(rate === 1 ? 1.5 : 1),
                            )
                        }
                    />
                    <Btn
                        label={quality === 'standard' ? 'high' : 'standard'}
                        onPress={() =>
                            run(() =>
                                player.setPreferredQuality(
                                    quality === 'standard'
                                        ? 'high'
                                        : 'standard',
                                ),
                            )
                        }
                    />
                </Row>
                <Row>
                    <Btn
                        label="尾部入队 s3"
                        onPress={() => run(() => player.enqueue(SONGS[2]!))}
                    />
                    <Btn
                        label="插播下一首 s2"
                        onPress={() => run(() => player.enqueueNext(SONGS[1]!))}
                    />
                    <Btn label="移除当前" onPress={removeCurrent} />
                    <Btn
                        label="清空"
                        onPress={() => run(() => player.clearQueue())}
                    />
                </Row>
                <Row>
                    <Btn
                        label="清空历史"
                        onPress={() => {
                            history.clear();
                        }}
                    />
                </Row>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#111' },
    body: { padding: 16, gap: 8 },
    h: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
    mono: { color: '#9fe', fontSize: 13 },
    err: { color: '#f99', fontSize: 13 },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    btn: {
        backgroundColor: '#2a2a2a',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 8,
    },
    btnText: { color: '#fff', fontSize: 13 },
});
