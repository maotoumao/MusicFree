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
 */

"use strict";

const axios = require("axios");

const BASE_API = "https://music-api.gdstudio.xyz/api.php";
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
    return axios.get(BASE_API, {
        params: Object.assign({ btwaf: "99801110" }, params),
        timeout: timeout || 10000,
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

module.exports = {
    platform: "网易云音乐（GD 源）",
    version: "1.0.0",
    srcUrl:
        "https://raw.githubusercontent.com/data-cd-sky/MusicFree/ios/port/ios/plugins/netease-gd.plugin.js",
    description:
        "网易云音乐搜索/播放/歌词，播放地址由 GD 接口返回 https 版本，避免 iOS ATS 拦截 http CDN。不含 VIP/付费破解。",
    supportedSearchType: ["music", "album", "artist"],
    search,
    getMediaSource,
    getLyric,
    getMusicInfo,
    getAlbumInfo,
    getArtistWorks,
};
