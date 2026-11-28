/**
 * 本地音乐扫描器压测屏：__DEV__ 专用，直连 `@/native/mediaScanner` 裸测原生 TagLib 扫描
 * 用途：验扫描性能（全盘/增量耗时）、取消响应、字段正确性；内存/线程泄漏靠 adb dumpsys 旁证
 * core/localMusic 落地后此屏应删
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

import {
    checkStorageReadAccess,
    requestStorageReadAccess,
    type StorageAccessStatus,
} from '@/infra/permission';
import {
    cancelScan,
    isMediaScannerSupported,
    onScanComplete,
    onScanError,
    onScanProgress,
    startScan,
    type ScannedAudioFile,
} from '@/native/mediaScanner';

// 压测预设：全盘最狠（外部存储根递归全扫），Music 目录较快
const FULL_ROOT = '/storage/emulated/0';
const MUSIC_ROOT = '/storage/emulated/0/Music';
const EXTS = ['mp3', 'flac', 'm4a', 'aac', 'wav', 'ogg', 'ape', 'wma', 'opus'];
const BATCH_SIZE = 50;

type Stats = {
    found: number;
    processed: number;
    total: number;
    tagsRead: number;
    reused: number;
    removed: number;
    failed: number;
    elapsedMs: number;
};

const EMPTY_STATS: Stats = {
    found: 0,
    processed: 0,
    total: 0,
    tagsRead: 0,
    reused: 0,
    removed: 0,
    failed: 0,
    elapsedMs: 0,
};

// 模块级单调 scanId：跨屏挂载不重置，避免重进复用旧代次与原生残留扫描撞车
let scanIdCounter = 0;

export default function LocalMusicProbeScreen() {
    const [logs, setLogs] = useState<string[]>([]);
    const [status, setStatus] = useState('idle');
    const [granted, setGranted] = useState<StorageAccessStatus | null>(null);
    const [stats, setStats] = useState<Stats>(EMPTY_STATS);
    const [samples, setSamples] = useState<ScannedAudioFile[]>([]);

    const scanIdRef = useRef(0);
    const startTimeRef = useRef(0);
    const foundRef = useRef(0);
    // 累积指纹（path → "mtime:size"），供增量扫描当 knownFingerprints
    const fingerprintsRef = useRef<Record<string, string>>({});
    const logFnRef = useRef((_s: string) => {});

    const log = useCallback((s: string) => {
        console.log('[LM-PROBE]', s);
        setLogs(prev =>
            [`${new Date().toISOString().slice(11, 19)} ${s}`, ...prev].slice(
                0,
                80,
            ),
        );
    }, []);
    logFnRef.current = log;

    useEffect(() => {
        if (!isMediaScannerSupported) {
            logFnRef.current('MediaScanner 在此平台不可用');
            return;
        }
        const l = (s: string) => logFnRef.current(s);
        const subs = [
            onScanProgress(e => {
                if (e.scanId !== scanIdRef.current) return; // 丢迟到事件
                foundRef.current += e.batch.length;
                for (const f of e.batch) {
                    fingerprintsRef.current[
                        f.path
                    ] = `${f.mtimeMs}:${f.sizeBytes}`;
                }
                setStats(prev => ({
                    ...prev,
                    found: foundRef.current,
                    processed: e.processed,
                    total: e.total,
                }));
                setSamples(prev =>
                    prev.length >= 20
                        ? prev
                        : [...prev, ...e.batch].slice(0, 20),
                );
            }),
            onScanComplete(e => {
                if (e.scanId !== scanIdRef.current) return;
                const elapsedMs = Date.now() - startTimeRef.current;
                setStats(prev => ({
                    ...prev,
                    tagsRead: e.tagsRead,
                    reused: e.reused,
                    removed: e.removedPaths.length,
                    failed: e.failedPaths.length,
                    elapsedMs,
                }));
                setStatus('done');
                // 已删除的路径从指纹库剔除（否则每次增量都会重复算进 removedPaths）
                for (const p of e.removedPaths)
                    delete fingerprintsRef.current[p];
                l(
                    `完成 ${elapsedMs}ms | found=${foundRef.current} read=${
                        e.tagsRead
                    } reused=${e.reused} removed=${
                        e.removedPaths.length
                    } failed=${e.failedPaths.length} | 指纹库=${
                        Object.keys(fingerprintsRef.current).length
                    }`,
                );
                if (e.failedPaths.length) {
                    l(`失败明细: ${e.failedPaths.join(' | ')}`);
                }
            }),
            onScanError(e => {
                if (e.scanId !== scanIdRef.current) return;
                setStatus('failed');
                l(`出错 code=${e.code} msg=${e.message}`);
            }),
        ];
        return () => {
            subs.forEach(s => s.remove());
            cancelScan(scanIdRef.current); // 离屏取消在途扫描、别让它继续占 IO
        };
    }, []);

    const checkPermission = useCallback(async () => {
        const p = await checkStorageReadAccess();
        setGranted(p);
        logFnRef.current(`存储权限=${p}`);
        return p;
    }, []);

    useEffect(() => {
        checkPermission();
    }, [checkPermission]);

    const beginScan = useCallback((roots: string[], incremental: boolean) => {
        if (!isMediaScannerSupported) return;
        const scanId = ++scanIdCounter;
        scanIdRef.current = scanId;
        startTimeRef.current = Date.now();
        foundRef.current = 0;
        setStats(EMPTY_STATS);
        setSamples([]);
        setStatus('scanning');
        const known = incremental
            ? JSON.stringify(fingerprintsRef.current)
            : '';
        if (!incremental) fingerprintsRef.current = {};
        logFnRef.current(
            `启动 scanId=${scanId} roots=${roots.join()} ${
                incremental
                    ? `增量(指纹=${
                          Object.keys(JSON.parse(known || '{}')).length
                      })`
                    : '全量'
            }`,
        );
        startScan({
            scanId,
            roots,
            excludedDirs: [],
            extensions: EXTS,
            minDurationSec: 0,
            minSizeBytes: 0,
            knownFingerprintsJson: known,
            batchSize: BATCH_SIZE,
            // 探针固定用 GBK：这一屏就是用来看旧标签修复有没有生效的
            legacyTagCharset: 'GBK',
        });
    }, []);

    const doCancel = useCallback(() => {
        if (!isMediaScannerSupported) return;
        cancelScan(scanIdRef.current);
        setStatus('cancelled');
        logFnRef.current(`取消 scanId=${scanIdRef.current}`);
    }, []);

    return (
        <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
            <Text style={styles.title}>本地音乐扫描压测（dev）</Text>
            <Text style={styles.line}>
                支持={String(isMediaScannerSupported)} 存储权限=
                {granted ?? '?'}
            </Text>
            <Text style={styles.line}>
                状态={status} 耗时={stats.elapsedMs}ms
            </Text>
            <Text style={styles.line}>
                found={stats.found} processed={stats.processed}/{stats.total}
            </Text>
            <Text style={styles.line}>
                read={stats.tagsRead} reused={stats.reused} removed=
                {stats.removed} failed={stats.failed}
            </Text>

            <View style={styles.row}>
                <Btn label="检查权限" onPress={checkPermission} />
                <Btn
                    label="申请存储权限"
                    onPress={async () => {
                        const p = await requestStorageReadAccess();
                        setGranted(p);
                        logFnRef.current(`申请结果=${p}`);
                    }}
                />
            </View>
            <View style={styles.row}>
                <Btn
                    label="全盘扫描"
                    onPress={() => beginScan([FULL_ROOT], false)}
                />
                <Btn
                    label="Music 目录"
                    onPress={() => beginScan([MUSIC_ROOT], false)}
                />
            </View>
            <View style={styles.row}>
                <Btn
                    label="增量扫描（全盘）"
                    onPress={() => beginScan([FULL_ROOT], true)}
                />
                <Btn label="取消" onPress={doCancel} />
            </View>
            <View style={styles.row}>
                <Btn label="清空日志" onPress={() => setLogs([])} />
            </View>

            <Text style={styles.section}>样本（前 {samples.length}）</Text>
            <ScrollView style={styles.samples}>
                {samples.map(f => (
                    <Text key={f.id} style={styles.sample}>
                        {f.title} — {f.artist || '?'} · {f.album || '?'} ·{' '}
                        {(f.durationMs / 1000).toFixed(0)}s ·{' '}
                        {f.hasCoverArt ? '封' : '  '} · {f.extension} ·{' '}
                        {f.folderPath}
                    </Text>
                ))}
            </ScrollView>

            <Text style={styles.section}>日志</Text>
            <ScrollView style={styles.logs}>
                {logs.map((s, i) => (
                    <Text key={String(i)} style={styles.logLine}>
                        {s}
                    </Text>
                ))}
            </ScrollView>
        </SafeAreaView>
    );
}

function Btn({ label, onPress }: { label: string; onPress: () => void }) {
    return (
        <TouchableOpacity style={styles.btn} onPress={onPress}>
            <Text style={styles.btnText}>{label}</Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#111', padding: 10 },
    title: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 6 },
    line: { color: '#9cf', fontSize: 12, marginBottom: 2 },
    section: { color: '#fc9', fontSize: 12, marginTop: 8, marginBottom: 2 },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
    btn: {
        backgroundColor: '#2a2a2a',
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 6,
    },
    btnText: { color: '#fff', fontSize: 12 },
    samples: { maxHeight: 160, marginTop: 2 },
    sample: { color: '#8f8', fontSize: 10, marginBottom: 1 },
    logs: { flex: 1, marginTop: 2 },
    logLine: { color: '#ccc', fontSize: 10, marginBottom: 1 },
});
