/**
 * Audio SDK 冒烟屏：__DEV__ 专用诊断，直连 `@/native/audioEngine` 裸测引擎
 * core/audio 落地后此屏应删或降级为纯 core 调用
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { audioEngine as Audio, RemoteCommand } from '@/native/audioEngine';

const URLS: Record<string, string> = {
    song1: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    song2: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    song3: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    hls1: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    dash1: 'https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd',
};

// 简单播放队列（供 onRemote 上一首/下一首 & 自然播完推进游标）
const QUEUE = ['song1', 'song2', 'song3'];

const track = (id: string, title: string, streamType?: string) => ({
    platform: 'smoke',
    id,
    title,
    artist: 'SoundHelix',
    streamType,
});

export default function AudioProbeScreen() {
    const [logs, setLogs] = useState<string[]>([]);
    const [state, setState] = useState('-');
    const [progress, setProgress] = useState('-');
    const logRef = useRef((_s: string) => {});
    const queueIdx = useRef(0);

    const log = useCallback((s: string) => {
        console.log('[SMOKE]', s);
        setLogs(prev =>
            [`${new Date().toISOString().slice(11, 19)} ${s}`, ...prev].slice(
                0,
                60,
            ),
        );
    }, []);
    logRef.current = log;

    useEffect(() => {
        const l = (s: string) => logRef.current(s);
        // 队列跳转：定位到 idx（环绕），当前+下一首一起塞给引擎
        const playQueueAt = (idx: number) => {
            const n = QUEUE.length;
            const i = ((idx % n) + n) % n;
            queueIdx.current = i;
            const cur = QUEUE[i]!;
            const nxt = QUEUE[(i + 1) % n]!;
            l(`queue → ${cur} (next ${nxt})`);
            return Audio.setAudio(track(cur, cur), true, track(nxt, nxt));
        };
        const subs = [
            Audio.onStateChange(s => {
                setState(s);
                l('state=' + s);
            }),
            Audio.onProgress(p =>
                setProgress(
                    `${p.position.toFixed(1)}/${p.duration.toFixed(
                        1,
                    )} buf=${p.buffered.toFixed(1)}`,
                ),
            ),
            Audio.onError(e =>
                l(
                    `ERROR slot=${e.slot} code=${e.code} item=${
                        e.item?.id ?? '-'
                    } msg=${e.message}`,
                ),
            ),
            Audio.onAudioEnd(item => {
                l('audioEnd item=' + item.id);
                // 自然播完：native 已把 next 提升为 current，这里推进游标并补下一个 next
                queueIdx.current = (queueIdx.current + 1) % QUEUE.length;
                const nxt = QUEUE[(queueIdx.current + 1) % QUEUE.length]!;
                Audio.setNext(track(nxt, nxt));
            }),
            Audio.onRemote(a => {
                l('REMOTE cmd=' + a.command);
                if (a.command === RemoteCommand.Next)
                    playQueueAt(queueIdx.current + 1);
                else if (a.command === RemoteCommand.Prev)
                    playQueueAt(queueIdx.current - 1);
            }),
            // 适配层 setSourceResolver 封装了 onResolveSource↔provideSource（core 只给 item→source）
            Audio.setSourceResolver(async item => {
                const url = URLS[item.id];
                l(`resolve id=${item.id} -> ${url ? 'ok' : 'NO_URL'}`);
                return url ? { url } : null;
            }),
        ];
        Audio.setup({
            cacheEnabled: true,
            maxCacheBytes: 256 * 1024 * 1024,
            progressIntervalMs: 500,
        })
            .then(async () => {
                l('setup ok (cache ON), version=' + Audio.getVersion());
                // M6 EQ 能力探测（mumu 很可能不支持 → 降级返空，不崩）
                try {
                    const eb = await Audio.eqGetBands();
                    const ep = await Audio.eqGetPresets();
                    l(
                        `EQ bands=${eb.length} presets=${ep.length}` +
                            (eb.length
                                ? ` b0=${eb[0]!.centerFreq}Hz g=${
                                      eb[0]!.gain
                                  }[${eb[0]!.minGain},${eb[0]!.maxGain}]`
                                : ' (本机不支持/降级)'),
                    );
                    if (eb.length) {
                        // 写入生效验证：设 band0 增益 → 读回核对
                        await Audio.eqSetEnabled(true);
                        await Audio.eqSetBandGain(0, -1200);
                        const after = await Audio.eqGetBands();
                        l(
                            `EQ set b0=-1200 → readback g=${
                                after[0]?.gain ?? 'no-bands'
                            } (应=-1200)`,
                        );
                        if (ep.length > 1) {
                            await Audio.eqUsePreset(ep[1]!);
                            const afterP = await Audio.eqGetBands();
                            l(
                                `EQ usePreset '${ep[1]!}' → b0 g=${
                                    afterP[0]?.gain ?? 'no-bands'
                                } (随预设变)`,
                            );
                        }
                    }
                } catch (e) {
                    l('EQ probe FAIL ' + e);
                }
                // M8：播 song1(带封面)(+next song2) 保持播放，测远程 onRemote + 通知封面
                l('play song1 (+cover, +next song2) and stay');
                await Audio.setAudio(
                    {
                        ...track('song1', 'S1'),
                        artwork: 'https://picsum.photos/id/237/300/300',
                    },
                    true,
                    track('song2', 'S2'),
                );
            })
            .catch(err => l('setup/auto FAIL ' + err));
        return () => subs.forEach(s => s());
    }, []);

    const call =
        (name: string, fn: () => Promise<unknown> | unknown) => async () => {
            try {
                const r = await fn();
                log(
                    `${name} ok${
                        r !== undefined && typeof r !== 'object'
                            ? ' = ' + r
                            : ''
                    }`,
                );
            } catch (e) {
                log(`${name} FAIL ${e}`);
            }
        };

    const Btn = ({ t, on }: { t: string; on: () => void }) => (
        <TouchableOpacity style={styles.btn} onPress={on}>
            <Text style={styles.btnT}>{t}</Text>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.root}>
            <Text style={styles.title}>Audio SDK 冒烟</Text>
            <Text style={styles.stat}>state: {state}</Text>
            <Text style={styles.stat}>progress: {progress}</Text>
            <View style={styles.row}>
                <Btn
                    t="setAudio(1,→2)"
                    on={call('setAudio', () =>
                        Audio.setAudio(
                            track('song1', 'S1'),
                            true,
                            track('song2', 'S2'),
                        ),
                    )}
                />
                <Btn t="play" on={call('play', () => Audio.play())} />
                <Btn t="pause" on={call('pause', () => Audio.pause())} />
                <Btn t="stop" on={call('stop', () => Audio.stop())} />
                <Btn t="seek→30" on={call('seek', () => Audio.seekTo(30))} />
                <Btn
                    t="setNext(3)"
                    on={call('setNext', () =>
                        Audio.setNext(track('song3', 'S3')),
                    )}
                />
                <Btn
                    t="setNext(null)"
                    on={call('setNextNull', () => Audio.setNext(null))}
                />
                <Btn
                    t="→near end"
                    on={call('seekEnd', async () => {
                        const p = await Audio.getProgress();
                        return Audio.seekTo(Math.max(0, p.duration - 5));
                    })}
                />
                <Btn
                    t="getState"
                    on={call('getState', () => Audio.getState())}
                />
                <Btn
                    t="getProgress"
                    on={call('getProgress', async () => {
                        const p = await Audio.getProgress();
                        return `${p.position.toFixed(1)}/${p.duration.toFixed(
                            1,
                        )}`;
                    })}
                />
                <Btn
                    t="setRate1.5"
                    on={call('setRate', () => Audio.setRate(1.5))}
                />
                <Btn
                    t="vol .5"
                    on={call('setVolume', () => Audio.setVolume(0.5))}
                />
                <Btn t="reset" on={call('reset', () => Audio.reset())} />
                <Btn
                    t="meta✓(song1)"
                    on={call('metaOk', () =>
                        Audio.updateMeta(track('song1', 'META-OK')),
                    )}
                />
                <Btn
                    t="meta✗(bad)"
                    on={call('metaBad', () =>
                        Audio.updateMeta(track('nope', 'META-BAD')),
                    )}
                />
                <Btn
                    t="cacheSize"
                    on={call('cacheSize', async () => {
                        const b = await Audio.getCacheSize();
                        return (b / 1048576).toFixed(2) + 'MB';
                    })}
                />
                <Btn
                    t="clearCache"
                    on={call('clearCache', () => Audio.clearCache())}
                />
                <Btn
                    t="rmCache(1)"
                    on={call('removeCache', () =>
                        Audio.removeCache(track('song1', 'S1')),
                    )}
                />
                <Btn
                    t="eqBands"
                    on={call('eqBands', async () => {
                        const b = await Audio.eqGetBands();
                        return b.length
                            ? b.map(x => `${x.centerFreq}:${x.gain}`).join(' ')
                            : 'none';
                    })}
                />
                <Btn
                    t="eqPresets"
                    on={call('eqPresets', async () => {
                        const p = await Audio.eqGetPresets();
                        return p.join(',') || 'none';
                    })}
                />
                <Btn
                    t="eqOn"
                    on={call('eqOn', () => Audio.eqSetEnabled(true))}
                />
                <Btn
                    t="eqOff"
                    on={call('eqOff', () => Audio.eqSetEnabled(false))}
                />
                <Btn
                    t="eqB0+1500"
                    on={call('eqBand0', () => Audio.eqSetBandGain(0, 1500))}
                />
                <Btn
                    t="playHLS"
                    on={call('hls', () =>
                        Audio.setAudio(track('hls1', 'HLS', 'hls'), true, null),
                    )}
                />
                <Btn
                    t="playDASH"
                    on={call('dash', () =>
                        Audio.setAudio(
                            track('dash1', 'DASH', 'dash'),
                            true,
                            null,
                        ),
                    )}
                />
                <Btn t="clear log" on={() => setLogs([])} />
            </View>
            <ScrollView style={styles.logs}>
                {logs.map((l, i) => (
                    <Text key={i} style={styles.logT}>
                        {l}
                    </Text>
                ))}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#101014', paddingHorizontal: 12 },
    title: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 8 },
    stat: {
        color: '#9ad',
        fontSize: 13,
        marginTop: 4,
        fontVariant: ['tabular-nums'],
    },
    row: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
    btn: {
        backgroundColor: '#2a2a35',
        borderRadius: 8,
        paddingVertical: 8,
        paddingHorizontal: 10,
        margin: 3,
    },
    btnT: { color: '#fff', fontSize: 12 },
    logs: {
        flex: 1,
        marginTop: 10,
        backgroundColor: '#0a0a0e',
        borderRadius: 8,
        padding: 8,
    },
    logT: { color: '#b8c0b0', fontSize: 11, fontFamily: 'monospace' },
});
