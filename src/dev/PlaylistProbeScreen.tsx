/**
 * Playlist 冒烟屏：仅 __DEV__ 使用，直接驱动 core/playlist（真实 playlist 与 hooks）
 * 覆盖升级验收路径：Local CRUD/排序、favorite、Starred、自定义封面（走 infra/documentPicker）
 * core/playlist 接入正式 UI 后删除此页面
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

import {
    FAVORITE_PLAYLIST_ID,
    PlaylistMusicSortMode,
    playlist,
    useIsFavorite,
    useLoadedPlaylistDetail,
    useLocalPlaylists,
    usePlaylistStatus,
    useStarredPlaylists,
} from '@/core/playlist';
import { pickFile } from '@/infra/documentPicker';

import type { MediaRef, MusicItem, PlaylistItemBase } from '@/types';

/** 带远程封面的示例曲目：用于验证自动封面（跟随首曲 artwork） */
function song(id: string, title: string): MusicItem {
    return {
        platform: 'probe',
        id,
        title,
        artist: 'Probe',
        album: '',
        artwork: `https://picsum.photos/seed/${id}/200`,
        duration: 0,
    };
}

/** 示例远程歌单：含插件私有字段，用于验证 Starred 深拷贝保留 */
function remotePlaylist(id: string, title: string): PlaylistItemBase {
    return {
        platform: 'probe-src',
        id,
        title,
        artwork: `https://picsum.photos/seed/pl-${id}/200`,
        pluginPrivate: { note: `secret-${id}` },
    };
}

/** 首次添加三首、其中第三首与第一首重复（验证批内去重） */
const ADD_BATCH = [song('m1', '曲一'), song('m2', '曲二'), song('m1', '曲一')];
const FAV_SAMPLE = song('m1', '曲一');
const STAR_SAMPLE = remotePlaylist('s1', '远程歌单一');
/** 数字 id 远程歌单：验证 star 时数字 id 归一为字符串 */
const STAR_NUMERIC = {
    platform: 'probe-src',
    id: 42,
    title: '数字id歌单',
    pluginPrivate: { note: 'num' },
} as unknown as PlaylistItemBase;
const SORT_MODES = Object.values(PlaylistMusicSortMode);
/** 曲目预览上限：防万首大歌单拼接卡住 JS 线程 */
const MUSIC_PREVIEW = 8;

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

export default function PlaylistProbeScreen() {
    const status = usePlaylistStatus();
    const locals = useLocalPlaylists();
    const starred = useStarredPlaylists();
    const favSample = useIsFavorite(FAV_SAMPLE);
    const [selectedId, setSelectedId] = useState<string>(FAVORITE_PLAYLIST_ID);
    const detail = useLoadedPlaylistDetail(selectedId);
    const [err, setErr] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);

    /** 统一执行异步命令：显式暴露 reject（成功/失败便于诊断） */
    const run = useCallback((action: () => Promise<unknown>) => {
        setErr(null);
        action().catch((e: unknown) => setErr(String(e)));
    }, []);

    /** 选中并加载某歌单详情（详情读模型懒加载） */
    const select = useCallback(
        (id: string) => {
            setSelectedId(id);
            run(() => playlist.loadLocalPlaylist(id));
        },
        [run],
    );

    const userIds = useMemo(
        () => locals.filter(p => p.kind === 'user').map(p => p.id),
        [locals],
    );

    return (
        <SafeAreaView style={styles.root}>
            <ScrollView contentContainerStyle={styles.body}>
                <Text style={styles.h}>Playlist 冒烟</Text>
                <Text style={styles.mono}>status: {status}</Text>
                <Text style={styles.mono}>
                    favorite 含「曲一」: {favSample ? '是' : '否'}
                </Text>
                {err ? <Text style={styles.err}>err: {err}</Text> : null}
                {info ? <Text style={styles.mono}>info: {info}</Text> : null}

                <Text style={styles.sub}>Local 歌单（点选加载详情）</Text>
                {locals.map(p => (
                    <TouchableOpacity key={p.id} onPress={() => select(p.id)}>
                        <Text
                            style={
                                p.id === selectedId ? styles.pick : styles.mono
                            }
                        >
                            [{p.kind}] {p.title || '(未命名)'} · {p.musicCount}{' '}
                            首{p.hasCustomArtwork ? ' · 自定义封面' : ''}
                            {p.artwork ? ' · 有图' : ''}
                        </Text>
                    </TouchableOpacity>
                ))}

                <Text style={styles.sub}>
                    选中详情: {detail?.title || '(未命名)'} · sort=
                    {detail?.sortMode ?? '-'}
                </Text>
                <Text style={styles.mono}>
                    曲目({detail?.musicList.length ?? 0}):{' '}
                    {(detail?.musicList ?? [])
                        .slice(0, MUSIC_PREVIEW)
                        .map(m => `${m.platform}:${m.id}「${m.title}」`)
                        .join(', ') || '-'}
                    {(detail?.musicList.length ?? 0) > MUSIC_PREVIEW
                        ? ' …'
                        : ''}
                </Text>
                <Text style={styles.mono}>
                    封面: {detail?.artwork ?? '-'}
                    {detail?.hasCustomArtwork ? '（自定义）' : ''}
                </Text>

                <Text style={styles.sub}>操作 · 歌单</Text>
                <Row>
                    <Btn
                        label="建歌单"
                        onPress={() =>
                            run(() =>
                                playlist.createLocalPlaylist({
                                    title: `新歌单 ${Date.now()
                                        .toString()
                                        .slice(-4)}`,
                                }),
                            )
                        }
                    />
                    <Btn
                        label="改名(选中)"
                        onPress={() =>
                            run(() =>
                                playlist.updateLocalPlaylist(selectedId, {
                                    title: `改名 ${Date.now()
                                        .toString()
                                        .slice(-4)}`,
                                }),
                            )
                        }
                    />
                    <Btn
                        label="删(选中)"
                        onPress={() =>
                            run(async () => {
                                await playlist.removeLocalPlaylists([
                                    selectedId,
                                ]);
                                setSelectedId(FAVORITE_PLAYLIST_ID);
                            })
                        }
                    />
                    <Btn
                        label="反转歌单序"
                        onPress={() =>
                            run(() =>
                                playlist.reorderLocalPlaylists(
                                    [...userIds].reverse(),
                                ),
                            )
                        }
                    />
                </Row>

                <Text style={styles.sub}>操作 · 选中歌单的曲目</Text>
                <Row>
                    <Btn
                        label="加3首(含重复)"
                        onPress={() =>
                            run(async () => {
                                const r =
                                    await playlist.addMusicToLocalPlaylist(
                                        selectedId,
                                        ADD_BATCH,
                                    );
                                setInfo(`add ${JSON.stringify(r)}`);
                            })
                        }
                    />
                    <Btn
                        label="删首曲"
                        onPress={() =>
                            run(async () => {
                                const d = await playlist.loadLocalPlaylist(
                                    selectedId,
                                );
                                const first = d?.musicList[0];
                                if (!first) {
                                    return;
                                }
                                await playlist.removeMusicFromLocalPlaylist(
                                    selectedId,
                                    { platform: first.platform, id: first.id },
                                );
                            })
                        }
                    />
                    <Btn
                        label="清空"
                        onPress={() =>
                            run(() =>
                                playlist.clearLocalPlaylistMusic(selectedId),
                            )
                        }
                    />
                </Row>
                <Row>
                    <Btn
                        label="反转曲序"
                        onPress={() =>
                            run(async () => {
                                const d = await playlist.loadLocalPlaylist(
                                    selectedId,
                                );
                                if (!d) {
                                    return;
                                }
                                const order: MediaRef[] = d.musicList
                                    .map(m => ({
                                        platform: m.platform,
                                        id: m.id,
                                    }))
                                    .reverse();
                                await playlist.reorderLocalPlaylistMusic(
                                    selectedId,
                                    order,
                                );
                            })
                        }
                    />
                    <Btn
                        label="切排序"
                        onPress={() =>
                            run(async () => {
                                const d = await playlist.loadLocalPlaylist(
                                    selectedId,
                                );
                                const cur =
                                    d?.sortMode ?? PlaylistMusicSortMode.Manual;
                                const next =
                                    SORT_MODES[
                                        (SORT_MODES.indexOf(cur) + 1) %
                                            SORT_MODES.length
                                    ]!;
                                await playlist.setLocalPlaylistMusicSortMode(
                                    selectedId,
                                    next,
                                );
                            })
                        }
                    />
                </Row>

                <Text style={styles.sub}>操作 · favorite / 封面</Text>
                <Row>
                    <Btn
                        label={favSample ? '取消收藏曲一' : '收藏曲一'}
                        onPress={() =>
                            run(() => playlist.toggleFavorite(FAV_SAMPLE))
                        }
                    />
                    <Btn
                        label="选图设封面(选中)"
                        onPress={() =>
                            run(async () => {
                                const picked = await pickFile({
                                    types: ['image/*'],
                                });
                                if (picked) {
                                    await playlist.setLocalPlaylistArtwork(
                                        selectedId,
                                        picked.uri,
                                    );
                                }
                            })
                        }
                    />
                    <Btn
                        label="重置封面(选中)"
                        onPress={() =>
                            run(() =>
                                playlist.setLocalPlaylistArtwork(
                                    selectedId,
                                    null,
                                ),
                            )
                        }
                    />
                </Row>

                <Text style={styles.sub}>Starred（收藏远程歌单）</Text>
                {starred.map(p => (
                    <Text key={`${p.platform}:${p.id}`} style={styles.mono}>
                        {p.platform}:{p.id}「{p.title ?? '-'}」
                        {p.pluginPrivate
                            ? ` · ${JSON.stringify(p.pluginPrivate)}`
                            : ''}
                    </Text>
                ))}
                <Row>
                    <Btn
                        label="收藏示例远程歌单"
                        onPress={() =>
                            run(() => playlist.starPlaylist(STAR_SAMPLE))
                        }
                    />
                    <Btn
                        label="收藏数字id歌单"
                        onPress={() =>
                            run(() => playlist.starPlaylist(STAR_NUMERIC))
                        }
                    />
                    <Btn
                        label="取消收藏"
                        onPress={() =>
                            run(() =>
                                playlist.unstarPlaylist({
                                    platform: STAR_SAMPLE.platform,
                                    id: STAR_SAMPLE.id,
                                }),
                            )
                        }
                    />
                    <Btn
                        label="反转收藏序"
                        onPress={() =>
                            run(() => {
                                const order: MediaRef[] = [...starred]
                                    .reverse()
                                    .map(p => ({
                                        platform: p.platform,
                                        id: p.id,
                                    }));
                                return playlist.reorderStarredPlaylists(order);
                            })
                        }
                    />
                </Row>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#111' },
    body: { padding: 16, gap: 6 },
    h: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
    sub: { color: '#fc8', fontSize: 14, fontWeight: 'bold', marginTop: 12 },
    mono: { color: '#9fe', fontSize: 13 },
    pick: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
    err: { color: '#f99', fontSize: 13 },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
    btn: {
        backgroundColor: '#2a2a2a',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 8,
    },
    btnText: { color: '#fff', fontSize: 13 },
});
