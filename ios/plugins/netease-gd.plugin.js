/**
 * 网易云音乐（GD 源）
 *
 * 为什么需要这个插件：
 * 官方网易云接口返回的播放地址是 http://m701.music.126.net/...，
 * iOS 的 ATS 只允许 https，播放器会直接报错。GD 的取流接口
 * (music-api.gdstudio.xyz，source=netease) 返回的是同一个网易云
 * CDN 的 https 地址，因此这里把 GD 的取流逻辑适配成独立的网易云插件。
 *
 * 搜索、歌词、封面也走 GD 的网易云镜像；不包含 VIP/付费破解逻辑，
 * 不能播放的歌曲就是接口没有返回地址。
 *
 * 安装地址（push 后可用）：
 * https://raw.githubusercontent.com/data-cd-sky/MusicFree/ios/port/ios/plugins/netease-gd.plugin.js
 * jsDelivr 分支缓存可能滞后，仅作备用：
 * https://cdn.jsdelivr.net/gh/data-cd-sky/MusicFree@ios/port/ios/plugins/netease-gd.plugin.js
 */

"use strict";

const axios = require("axios");

const BASE_API = "https://music-api.gdstudio.xyz/api.php";
const NETEASE_PLAYLIST_API = "https://music.163.com/api/v6/playlist/detail";
const NETEASE_SONG_API = "https://music.163.com/api/song/detail";
const SOURCE = "netease";
const SEARCH_PAGE_SIZE = 20;
const DEFAULT_ARTWORK =
    "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iIzQyYTVmNSIvPjx0ZXh0IHg9IjUwIiB5PSI1MCIgZm9udC1zaXplPSIyNCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5HRDwvdGV4dD48L3N2Zz4=";

const QUALITY_TO_BR = {
    low: "128",
    standard: "320",
    high: "740",
    super: "999",
};

function request(params, timeout) {
    const options = {
        params: Object.assign({ btwaf: "99801110" }, params),
        timeout: timeout || 10000,
    };
    // GD 接口偶尔会返回 503/429（短时限流），重试两次通常可以恢复。
    return new Promise(function (resolve, reject) {
        let attempt = 0;
        function run() {
            axios.get(BASE_API, options).then(resolve).catch(function (e) {
                const status = e && e.response && e.response.status;
                const retryable =
                    !status || status === 429 || status >= 500;
                if (attempt < 2 && retryable) {
                    attempt += 1;
                    setTimeout(run, attempt * 700);
                } else {
                    reject(e);
                }
            });
        }
        run();
    });
}

function normalizeUrl(url) {
    if (typeof url !== "string") {
        return url;
    }
    // 网易云 CDN 同时支持 https；统一升级，避免 iOS ATS 拦截。
    return url.replace(/^http:\/\//i, "https://");
}

function getNumericId(musicItem) {
    const raw = musicItem && musicItem._rawData;
    if (raw && (raw.url_id || raw.id)) {
        return String(raw.url_id || raw.id).replace(/^netease_/i, "");
    }
    return String((musicItem && musicItem.id) || "").replace(/^netease_/i, "");
}

/** 读取用户变量里的 MUSIC_U（可选，仅用于访问自己账号可见的私有歌单）。 */
function getCookie() {
    try {
        const vars =
            typeof env !== "undefined" && env.getUserVariables
                ? env.getUserVariables()
                : {};
        let cookie = (vars && vars.neteaseCookie) || "";
        cookie = String(cookie).trim();
        if (!cookie) {
            return "";
        }
        return cookie.indexOf("=") >= 0 ? cookie : "MUSIC_U=" + cookie;
    } catch (e) {
        return "";
    }
}

/** 支持 music.163.com/playlist?id=、y.music.163.com/m/playlist?id=、纯数字 ID。 */
function extractPlaylistId(input) {
    const text = String(input || "").trim();
    if (/^\d+$/.test(text)) {
        return text;
    }
    let matched = text.match(/playlist\/(\d+)/i);
    if (matched) {
        return matched[1];
    }
    matched = text.match(/[?&#]id=(\d+)/i);
    if (matched) {
        return matched[1];
    }
    return null;
}

function getPicId(album) {
    if (!album) {
        return undefined;
    }
    if (album.pic_str) {
        return String(album.pic_str);
    }
    if (album.pic) {
        return String(album.pic);
    }
    const matched = String(album.picUrl || "").match(/\/(\d+)\.jpg/i);
    return matched ? matched[1] : undefined;
}

function getQualityEntry(quality) {
    return quality
        ? {
              size: quality.size || null,
              bitrate: quality.br || undefined,
          }
        : { size: null };
}

function formatPlaylistTrack(track) {
    const album = track.al || track.album || {};
    const artists = track.ar || track.artists || [];
    const vipTag =
        track.fee === 1 ? "（VIP）" : track.fee === 4 ? "（付费）" : "";
    return {
        id: String(track.id || ""),
        title: (track.name || "") + vipTag,
        artist: artists
            .map(function (artist) {
                return artist && artist.name;
            })
            .filter(Boolean)
            .join("/"),
        album: album.name || "",
        artwork: normalizeUrl(album.picUrl || "") || DEFAULT_ARTWORK,
        duration: Math.round(
            ((track.dt || track.duration || 0) * 1) / 1000,
        ),
        qualities: {
            low: getQualityEntry(track.l),
            standard: getQualityEntry(track.m),
            high: getQualityEntry(track.h),
            super: getQualityEntry(track.sq),
        },
        source: SOURCE,
        _rawData: Object.assign({}, track, {
            url_id: String(track.id || ""),
            lyric_id: String(track.id || ""),
            pic_id: getPicId(album),
            fee: track.fee,
            _vip: track.fee === 1 || track.fee === 4,
        }),
    };
}

function parsePlaylistResponse(data) {
    const playlist = data && data.playlist;
    if (!playlist) {
        return null;
    }
    const tracks = Array.isArray(playlist.tracks) ? playlist.tracks : [];
    return {
        id: String(playlist.id || ""),
        title: playlist.name || "",
        artwork: normalizeUrl(playlist.coverImgUrl || "") || DEFAULT_ARTWORK,
        description: playlist.description || "",
        items: tracks
            .map(formatPlaylistTrack)
            .filter(function (item) {
                return !!item.id;
            }),
        trackIds: (playlist.trackIds || [])
            .map(function (item) {
                return String(item.id || "");
            })
            .filter(Boolean),
    };
}

async function fetchSongsByIds(ids) {
    const result = {};
    const cookie = getCookie();
    for (let start = 0; start < ids.length; start += 500) {
        const chunk = ids.slice(start, start + 500);
        try {
            const headers = {
                "User-Agent":
                    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
                Referer: "https://music.163.com/",
            };
            if (cookie) {
                headers.Cookie = cookie;
            }
            const response = await axios.get(NETEASE_SONG_API, {
                params: {
                    ids: JSON.stringify(chunk),
                },
                headers,
                timeout: 15000,
            });
            let data = response.data;
            if (typeof data === "string") {
                try {
                    data = JSON.parse(data);
                } catch (e) {}
            }
            (data && data.songs ? data.songs : []).forEach(function (song) {
                result[String(song.id)] = formatPlaylistTrack(song);
            });
        } catch (e) {
            console.error("[netease-gd] fetch playlist songs error:", e && e.message);
        }
    }
    return result;
}

async function fetchPlaylistDetail(id) {
    try {
        const headers = {
            "User-Agent":
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
            Referer: "https://music.163.com/",
        };
        const cookie = getCookie();
        if (cookie) {
            headers.Cookie = cookie;
        }
        const response = await axios.get(NETEASE_PLAYLIST_API, {
            params: {
                id,
                n: 1000,
                s: 0,
            },
            headers,
            timeout: 15000,
        });
        let data = response.data;
        if (typeof data === "string") {
            try {
                data = JSON.parse(data);
            } catch (e) {}
        }
        const parsed = parsePlaylistResponse(data);
        if (!parsed) {
            return null;
        }
        if (parsed.trackIds.length > parsed.items.length) {
            const existing = {};
            parsed.items.forEach(function (item) {
                existing[item.id] = item;
            });
            const missingIds = parsed.trackIds.filter(function (trackId) {
                return !existing[trackId];
            });
            const fetched = await fetchSongsByIds(missingIds);
            parsed.items = parsed.trackIds
                .map(function (trackId) {
                    return existing[trackId] || fetched[trackId];
                })
                .filter(Boolean);
        }
        return parsed;
    } catch (e) {
        console.error("[netease-gd] fetch playlist error:", e && e.message);
        return null;
    }
}

function formatMusicItem(item) {
    const artist = Array.isArray(item.artist)
        ? item.artist.join("/")
        : item.artist || "";
    return {
        id: String(item.id || item.url_id || ""),
        title: item.name || "",
        artist,
        album: item.album || "",
        artwork: DEFAULT_ARTWORK,
        qualities: {
            low: { size: null },
            standard: { size: null },
            high: { size: null },
            super: { size: null },
        },
        source: SOURCE,
        _rawData: item,
    };
}

function formatAlbumItem(item) {
    const artist = Array.isArray(item.artist)
        ? item.artist.join("/")
        : item.artist || "";
    return {
        id: String(item.id || ""),
        title: item.name || "",
        artist,
        artwork: DEFAULT_ARTWORK,
        description: "",
        source: SOURCE,
        _rawData: item,
    };
}

function formatArtistItem(item) {
    return {
        id: String(item.id || ""),
        name: item.name || "",
        avatar: DEFAULT_ARTWORK,
        description: "",
        source: SOURCE,
        _rawData: item,
    };
}

async function search(query, page, type) {
    let searchSource = SOURCE;
    let formatter = formatMusicItem;
    let pageSize = SEARCH_PAGE_SIZE;

    if (type === "album") {
        searchSource = SOURCE + "_album";
        formatter = formatAlbumItem;
    } else if (type === "artist") {
        searchSource = SOURCE + "_artist";
        formatter = formatArtistItem;
    } else if (type !== "music") {
        return { isEnd: true, data: [] };
    }

    try {
        const response = await request({
            types: "search",
            source: searchSource,
            name: query,
            count: pageSize,
            pages: page || 1,
        });
        const data = response.data;
        if (!Array.isArray(data)) {
            return { isEnd: true, data: [] };
        }
        return {
            isEnd: data.length < pageSize,
            data: data.map(formatter),
        };
    } catch (e) {
        console.error("[netease-gd] search error:", e && e.message);
        return { isEnd: true, data: [] };
    }
}

async function getMediaSource(musicItem, quality) {
    const id = getNumericId(musicItem);
    if (!id) {
        return null;
    }
    const br = QUALITY_TO_BR[quality] || QUALITY_TO_BR.standard;
    try {
        const response = await request({
            types: "url",
            source: SOURCE,
            id,
            br,
        });
        const data = response.data;
        if (data && data.url) {
            return { url: normalizeUrl(data.url) };
        }
        return null;
    } catch (e) {
        console.error("[netease-gd] getMediaSource error:", e && e.message);
        return null;
    }
}

async function getLyric(musicItem) {
    const raw = musicItem && musicItem._rawData;
    const id = String(
        (raw && (raw.lyric_id || raw.url_id || raw.id)) ||
            (musicItem && musicItem.id) ||
            "",
    ).replace(/^netease_/i, "");
    if (!id) {
        return null;
    }
    try {
        const response = await request({
            types: "lyric",
            source: SOURCE,
            id,
        });
        const data = response.data;
        if (!data) {
            return null;
        }
        let rawLrc = data.lyric || "";
        if (data.tlyric) {
            rawLrc += "\n" + data.tlyric;
        }
        return rawLrc.trim() ? { rawLrc } : null;
    } catch (e) {
        console.error("[netease-gd] getLyric error:", e && e.message);
        return null;
    }
}

async function getMusicInfo(musicItem) {
    const raw = musicItem && musicItem._rawData;
    const picId = raw && raw.pic_id;
    if (!picId) {
        return { artwork: DEFAULT_ARTWORK };
    }
    try {
        const response = await request({
            types: "pic",
            source: SOURCE,
            id: picId,
            size: 500,
        });
        return {
            artwork: (response.data && response.data.url) || DEFAULT_ARTWORK,
        };
    } catch (e) {
        return { artwork: DEFAULT_ARTWORK };
    }
}

async function getAlbumInfo(albumItem, page) {
    const name = albumItem.title || albumItem.name || "";
    try {
        const response = await request({
            types: "search",
            source: SOURCE + "_album",
            name,
            count: 50,
            pages: page || 1,
        });
        const data = response.data;
        if (!Array.isArray(data)) {
            return { isEnd: true, musicList: [] };
        }
        return {
            isEnd: data.length < 50,
            musicList: data.map(formatMusicItem),
        };
    } catch (e) {
        return { isEnd: true, musicList: [] };
    }
}

async function getArtistWorks(artistItem, page, type) {
    const name = artistItem.name || artistItem.title || "";
    const isAlbum = type === "album";
    try {
        const response = await request({
            types: "search",
            source: isAlbum ? SOURCE + "_album" : SOURCE,
            name,
            count: isAlbum ? 30 : 50,
            pages: page || 1,
        });
        const data = response.data;
        if (!Array.isArray(data)) {
            return { isEnd: true, data: [] };
        }
        return {
            isEnd: data.length < (isAlbum ? 30 : 50),
            data: data.map(isAlbum ? formatAlbumItem : formatMusicItem),
        };
    } catch (e) {
        return { isEnd: true, data: [] };
    }
}

async function getMusicSheetInfo(sheetItem, page) {
    if (page && page > 1) {
        return { isEnd: true, musicList: [] };
    }
    const id = extractPlaylistId(
        String((sheetItem && (sheetItem.id || sheetItem.url)) || ""),
    );
    if (!id) {
        return null;
    }
    const detail = await fetchPlaylistDetail(id);
    if (!detail) {
        return null;
    }
    return {
        sheetItem: {
            id: detail.id,
            title: detail.title,
            artwork: detail.artwork,
            description: detail.description,
        },
        isEnd: true,
        musicList: detail.items,
    };
}

async function importMusicSheet(urlLike) {
    const id = extractPlaylistId(urlLike);
    if (!id) {
        return [];
    }
    const detail = await fetchPlaylistDetail(id);
    return detail ? detail.items : [];
}

module.exports = {
    platform: "网易云音乐（GD 源）",
    version: "1.1.0",
    srcUrl:
        "https://raw.githubusercontent.com/data-cd-sky/MusicFree/ios/port/ios/plugins/netease-gd.plugin.js",
    description:
        "网易云音乐搜索/播放/歌词/歌单导入，播放地址由 GD 接口返回 https 版本，避免 iOS ATS 拦截 http CDN。不含 VIP/付费破解。",
    supportedSearchType: ["music", "album", "artist"],
    userVariables: [
        {
            key: "neteaseCookie",
            name: "网易云 Cookie（可选，仅私有歌单）",
            hint: "只用于读取自己账号可见的私有歌单，格式 MUSIC_U=...；公开歌单无需填写。不要填他人 Cookie，不要用于 VIP/付费绕过。",
        },
    ],
    hints: {
        importMusicSheet: [
            "粘贴 https://music.163.com/playlist?id=... 或 https://y.music.163.com/m/playlist?id=...",
            "也可以直接输入歌单数字 ID",
            "私有歌单需要在用户变量里填自己账号的 MUSIC_U",
        ],
    },
    search,
    getMediaSource,
    getLyric,
    getMusicInfo,
    getAlbumInfo,
    getArtistWorks,
    getMusicSheetInfo,
    importMusicSheet,
};
