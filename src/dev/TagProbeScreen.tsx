/**
 * 音频 tag 冒烟屏：__DEV__ 专用，经 `@/infra/audioTags` 冒烟
 * 把合成的最小 WAV 写到 app 私有目录（无需权限），走 writeTags → readTags 验证全链路
 * 正式调用方落地后此诊断屏应删除
 */
import { CachesDirectoryPath, writeFile } from '@dr.pogodin/react-native-fs';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
    AudioTagStatus,
    TagError,
    extractCover,
    readTags,
    writeTags,
} from '@/infra/audioTags';

/* eslint-disable no-bitwise -- 字节打包/base64 需要位运算 */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64FromBytes(bytes: Uint8Array): string {
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i] ?? 0;
        const b1 = bytes[i + 1] ?? 0;
        const b2 = bytes[i + 2] ?? 0;
        out += B64[b0 >> 2];
        out += B64[((b0 & 3) << 4) | (b1 >> 4)];
        out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '=';
        out += i + 2 < bytes.length ? B64[b2 & 63] : '=';
    }
    return out;
}

/** 合成最小合法 PCM WAV，返回 base64 */
function synthWavBase64(): string {
    const sampleRate = 44100;
    const channels = 1;
    const bits = 16;
    const dataSamples = 4410;
    const dataSize = dataSamples * channels * (bits / 8);
    const buf = new Uint8Array(44 + dataSize);
    const dv = new DataView(buf.buffer);
    let o = 0;
    const ascii = (s: string) => {
        for (let i = 0; i < s.length; i++) buf[o++] = s.charCodeAt(i);
    };
    ascii('RIFF');
    dv.setUint32(o, 36 + dataSize, true);
    o += 4;
    ascii('WAVE');
    ascii('fmt ');
    dv.setUint32(o, 16, true);
    o += 4;
    dv.setUint16(o, 1, true);
    o += 2;
    dv.setUint16(o, channels, true);
    o += 2;
    dv.setUint32(o, sampleRate, true);
    o += 4;
    dv.setUint32(o, sampleRate * channels * (bits / 8), true);
    o += 4;
    dv.setUint16(o, channels * (bits / 8), true);
    o += 2;
    dv.setUint16(o, bits, true);
    o += 2;
    ascii('data');
    dv.setUint32(o, dataSize, true);
    // data 全 0（静音）
    return base64FromBytes(buf);
}
/* eslint-enable no-bitwise */

export default function TagProbeScreen() {
    const [logs, setLogs] = useState<string[]>([]);
    const [running, setRunning] = useState(false);
    const busy = useRef(false);

    const log = useCallback((s: string) => {
        setLogs(prev =>
            [`${new Date().toISOString().slice(11, 19)} ${s}`, ...prev].slice(
                0,
                60,
            ),
        );
    }, []);

    const run = useCallback(async () => {
        if (busy.current) return; // 同步守卫：disabled 要等下次渲染才生效
        busy.current = true;
        setRunning(true);
        let failed = 0;
        const check = (ok: boolean, label: string) => {
            if (!ok) failed += 1;
            log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
        };
        try {
            const path = `${CachesDirectoryPath}/tagprobe.wav`;
            await writeFile(path, synthWavBase64(), 'base64');

            const w = await writeTags(path, {
                setFields: { TITLE: ['Probe 🎵 遇见'], ARTIST: ['MusicFree'] },
            });
            check(!w.fieldsRejected, `write ok (rejected=${w.fieldsRejected})`);

            const info = await readTags(path);
            check(
                info.fields.TITLE?.[0] === 'Probe 🎵 遇见',
                `TITLE=${info.fields.TITLE?.[0]}`,
            );
            check(
                info.fields.ARTIST?.[0] === 'MusicFree',
                `ARTIST=${info.fields.ARTIST?.[0]}`,
            );
            check(
                info.sampleRateHz === 44100 && info.channels === 1,
                `props ${info.sampleRateHz}Hz ${info.channels}ch`,
            );

            // 封面：写图片文件路径 → 提取回来
            const imgPath = `${CachesDirectoryPath}/tagprobe.jpg`;
            const jpeg = new Uint8Array([
                0xff, 0xd8, 0xff, 0xe0, 0x11, 0x22, 0xff, 0xd9,
            ]);
            await writeFile(imgPath, base64FromBytes(jpeg), 'base64');
            const wc = await writeTags(path, {
                cover: { op: 'replace', imagePath: imgPath },
            });
            check(wc.hasCoverArt, `write cover hasCover=${wc.hasCoverArt}`);

            const dest = `${CachesDirectoryPath}/tagprobe_out.jpg`;
            const cover = await extractCover(path, dest);
            check(
                cover !== null &&
                    cover.mime === 'image/jpeg' &&
                    cover.byteCount > 0,
                `extract mime=${cover?.mime} bytes=${cover?.byteCount}`,
            );

            // 非法：replace 指向不存在的图片 → TagError(InvalidArg)
            try {
                await writeTags(path, {
                    cover: {
                        op: 'replace',
                        imagePath: `${CachesDirectoryPath}/nope.jpg`,
                    },
                });
                check(false, 'expected TagError for bogus cover');
            } catch (e) {
                check(
                    e instanceof TagError &&
                        e.status === AudioTagStatus.InvalidArg,
                    `bogus cover → ${
                        e instanceof TagError ? e.status : String(e)
                    }`,
                );
            }

            // 不存在的文件 → TagError(NotFound)
            try {
                await readTags(`${CachesDirectoryPath}/does-not-exist.wav`);
                check(false, 'expected TagError for missing file');
            } catch (e) {
                check(
                    e instanceof TagError &&
                        e.status === AudioTagStatus.NotFound,
                    `missing → ${e instanceof TagError ? e.status : String(e)}`,
                );
            }

            log(failed === 0 ? '== ALL PASSED ==' : `== ${failed} FAILED ==`);
        } catch (e) {
            log(`ERROR ${String(e)}`);
        } finally {
            busy.current = false;
            setRunning(false);
        }
    }, [log]);

    return (
        <SafeAreaView style={styles.root}>
            <TouchableOpacity
                style={[styles.btn, running && styles.btnDisabled]}
                disabled={running}
                onPress={run}
            >
                <Text style={styles.btnText}>
                    {running ? 'Running…' : 'Run tag probe'}
                </Text>
            </TouchableOpacity>
            <ScrollView style={styles.logs}>
                {logs.map((l, i) => (
                    <Text key={i} style={styles.log}>
                        {l}
                    </Text>
                ))}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, padding: 16 },
    btn: {
        backgroundColor: '#2b6',
        padding: 14,
        borderRadius: 8,
        alignItems: 'center',
    },
    btnDisabled: { opacity: 0.5 },
    btnText: { color: '#fff', fontWeight: '600' },
    logs: { flex: 1, marginTop: 12 },
    log: { fontSize: 12, fontFamily: 'monospace', marginBottom: 2 },
});
