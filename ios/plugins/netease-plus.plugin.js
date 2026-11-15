/* eslint-disable */
/* global env */

/**
 * musicfree-netease-plugin-plus
 * ---------------------------------------------------------------
 * MusicFree 的网易云音乐插件（社区增强版）
 *
 * 作者：qingniaoheyu
 * 仓库：https://github.com/qingniaoheyu/musicfree-netease-plugin-plus
 * 协议参考：https://musicfree.catcat.work/plugin/protocol.html
 *
 * 支持：
 *   - 搜索：单曲 / 专辑 / 歌手 / 歌单
 *   - 播放：多档音质（128 / 192 / 320 / 无损），无版权/会员歌曲自动报错降级
 *   - 每日推荐（填 Cookie 后为账号真实个性化推荐，与手机 App 的 v3 接口一致）
 *   - 歌单：歌单广场（分类标签 / 精选）、歌单详情（大歌单不截断）
 *   - 我的歌单（登录后，含「我喜欢的音乐」）
 *   - 一键导入：单个歌单 / 全部歌单合并（输入 all）
 *   - 排行榜（官方榜 / 更多榜单）
 *   - 专辑详情、歌手作品（单曲 / 专辑）、歌词（含翻译）、歌曲评论
 *   - 导入歌单 / 导入单曲（粘贴网易云链接、歌单 ID 或歌单名）
 *
 * 本版本相对上游社区的增强：
 *   1. Cookie 不被覆盖（配合修复版 MusicFree APK 使用）
 *   2. 每日推荐使用 v3 接口，与手机 App 列表一致
 *   3. 支持一键导入全部歌单（合并去重）
 *   4. VIP/付费歌曲的 B 站回退做了性能优化（并行探活，1 秒内出源）
 *
 * 声明：
 *   本插件只做「接口搬运」，网易云不提供的会员/付费歌曲依然无法直接从网易云播放，
 *   此时会尝试 B 站公开音频作为回退。不提供任何破解、不绕过付费墙。
 *   请仅用于个人学习研究，音乐版权归原作者及平台所有。
 */

/*
 * 本仓库分支（data-cd-sky/MusicFree, ios/port）基于上游 0.7.0 修改：
 *   - 扫码登录成功后自动写入插件用户变量，App 重启后仍有效；
 *   - 更新插件说明里已过时的「iOS 会覆盖 Cookie 头」提示；
 *   - 版本号 0.7.1，便于和上游区分。
 * 上游作者：qingniaoheyu，协议：AGPL-3.0。
 */

const axios = require("axios");
const CryptoJs = require("crypto-js");
const bigInt = require("big-integer");

//#region 常量

const BASE_URL = "https://music.163.com";

/**
 * 构建版本标识。
 * 每次修改插件都更新这里，用户打开「?」就能确认装的是哪一版、有没有替换成功。
 */
const BUILD_STAMP = "v0.7.1 · 2026-11-15 · iOS 适配";

/** 本次构建包含的改动（显示在插件说明顶部） */
const CHANGELOG = [
  "iOS：扫码登录成功后自动写入用户变量，重启 App 后仍有效",
  "iOS：更新已过时的 Cookie 头覆盖提示（本仓库 App 已修复）",
  "新增：导入单曲输入 `test` 会跑「全组合探测」，列出 6 种请求形态各自的账号 ID",
  "新增：三条通道各自查到的「账号 ID」分别显示",
  "Cookie 解析：同名 MUSIC_U 按域名优选 `music.163.com` 那份",
  "Cookie 解析：无法判断哪份时明确告警",
  "登录凭证：移除扫码残留覆盖逻辑",
  "eapi 通道：补齐 NMTID、UA 改为 NeteaseMusic App",
];

/**
 * UA 与开源实现保持一致。
 * 参考 NeteaseCloudMusicApi 的 util/request.js：
 *   userAgentMap.weapi.pc = 'Macintosh ... Chrome/124 ... Edg/124'
 */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0";

/**
 * 备用 UA：网易云对 (路径 + UA + Cookie) 组合分别计数风控，
 * 实测 PC 端 UA 被 -462 时，移动端 UA 往往还能用，因此做一个轮换。
 */
const UA_MOBILE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

/** 搜索结果每页条数 */
const SEARCH_PAGE_SIZE = 30;
/** 歌单广场每页条数 */
const SHEET_PAGE_SIZE = 30;
/** 歌单 / 榜单详情每页条数 */
const TRACK_PAGE_SIZE = 100;
/** 批量取歌曲详情时每批条数 */
const SONG_DETAIL_BATCH = 200;
/** 歌手作品每页条数 */
const ARTIST_PAGE_SIZE = 50;
/** 歌手专辑每页条数 */
const ARTIST_ALBUM_PAGE_SIZE = 24;
/** 评论每页条数 */
const COMMENT_PAGE_SIZE = 20;

/** 插件音质档位 → 网易云接口档位 */
const QUALITY_LEVEL_MAP = {
  low: "standard",
  standard: "higher",
  high: "exhigh",
  super: "lossless",
};
/** 由低到高的档位顺序，用于获取失败时逐级降级 */
const QUALITY_LEVEL_ORDER = ["standard", "higher", "exhigh", "lossless"];

/** 「每日推荐」伪榜单 id */
const DAILY_ID = "__daily__";
/** 「每日推荐」在歌单广场中的伪标签 id */
const DAILY_TAG_ID = "__daily_tag__";
/** 「我的歌单」在歌单广场中的伪标签 id —— 让账号下所有歌单独立成列表，每个都能一键导入 */
const MY_SHEETS_TAG_ID = "__my_sheets_tag__";
/** 「我的歌单」伪歌单 id 前缀 */
const PLAYLIST_ID_PREFIX = "__playlist__";
/** 「精选歌单」标签 id 前缀 */
const HIGH_QUALITY_PREFIX = "hq:";

/** 「扫码登录」伪榜单 id —— 放在榜单列表里，点进去就能拿到二维码 */
const QRLOGIN_ID = "__qrlogin__";
/** 扫码登录的轮询状态（800 过期 / 801 待扫 / 802 已扫待确认 / 803 成功） */
const QR_STATUS = {
  EXPIRED: 800,
  WAITING: 801,
  SCANNED: 802,
  SUCCESS: 803,
};
/**
 * 生成二维码图片地址（插件说明里用 Markdown 图片展示）。
 *
 * 用 quickchart.io：实测能在 MusicFree 的说明弹窗（WebView）里正常渲染，
 * 且对较长的登录链接生成的二维码密度足够、可扫。
 */
function buildQrImage(loginUrl) {
  return (
    "https://quickchart.io/qr?size=400&margin=2&text=" + encodeURIComponent(loginUrl)
  );
}

//#region B 站回退相关常量

/** B 站接口请求头 */
const BILI_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * B 站 API 请求头（用于 nav / search / view / playurl 等 JSON 接口）。
 *
 * ⚠️ 这里**不能**加 `accept-encoding: gzip, deflate, br`：
 * Node/RN 的 adapter 不会自动解压，加了会拿到压缩后的二进制，
 * 导致 JSON 解析失败（表现为「WBI key 获取失败」这类莫名其妙的问题）。
 */
const BILI_API_HEADERS = {
  "user-agent": BILI_UA,
  referer: "https://www.bilibili.com/",
  accept: "application/json",
};

/**
 * B 站音频流请求头（只用于把 URL 交给播放器时附加）。
 *
 * 这几点是实测 + 对齐官方 bilibili 插件得出的，缺一个都可能 403 / Source error：
 * 1. 键名统一用**小写**。官方插件也是小写，而 React Native 的桥接层
 *    对 header 大小写处理不一致，小写最稳。
 * 2. `referer` 是**必需**的（实测不带就是 403，带哪个 bilibili 域名都行）。
 * 3. `host` 由调用方按实际地址补上（部分 CDN 节点对 host 敏感）。
 */
const BILI_MEDIA_HEADERS = {
  "user-agent": BILI_UA,
  referer: "https://www.bilibili.com/",
  accept: "*/*",
  connection: "keep-alive",
};
/** 匹配搜索结果时，标题相似度的「硬门槛」低于此值直接判定为没找到（0~1） */
const BILI_MATCH_THRESHOLD = 0.5;
/** 时长偏差容忍（秒），超过就降低匹配分 */
const BILI_DURATION_TOLERANCE = 25;

/**
 * 降权词：这些标题多半不是原曲（伴奏 / 翻唱 / 教程 / 现场串烧），
 * 即使标题相似度很高也排到后面，否则会出现「能播但是伴奏」的情况。
 */
const BILI_PENALTY_WORDS = [
  "伴奏",
  "纯音乐",
  "翻唱",
  "cover",
  "ktv",
  "教学",
  "琴谱",
  "光遇",
  "吉他",
  "钢琴版",
  "dj版",
  "remix",
  "串烧",
  "合集",
  "歌单",
  "反应",
  "reaction",
  "解说",
];
/** 已解析过的 B 站音源缓存：musicId -> { url, expireAt, headers } */
const biliSourceCache = new Map();
/** B 站音频地址通常 ~2 小时有效，这里保守缓存 30 分钟 */
const BILI_SOURCE_TTL = 30 * 60 * 1000;
/** 搜索结果匹配缓存：key -> bvid */
const biliMatchCache = new Map();

//#endregion

const IV = "0102030405060708";
const PRESET_KEY = "0CoJUm6Qyw8W8jud";
const BASE62 = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const PUB_KEY = "010001";
const MODULUS =
  "00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7";

//#endregion

//#region 基础工具

/** 安全读取用户变量（本地 Node 环境没有 env） */
function getUserVariables() {
  try {
    if (typeof env !== "undefined" && env && typeof env.getUserVariables === "function") {
      return env.getUserVariables() || {};
    }
  } catch (error) {
    // ignore
  }
  return {};
}

/**
 * 取「最终生效的登录 Cookie」（不含 os/appver 这类固定参数）。
 *
 * 优先级（重要）：
 *   1. **扫码登录得到的 Cookie —— 最高优先级**
 *      （用户主动扫码 = 明确的「我要换这个账号」意图，应当覆盖旧配置）
 *   2. 用户在「用户变量」里填的 Cookie —— 没扫码时使用
 *
 * 两者会按字段合并：扫码结果里的字段覆盖同名项，其余字段保留，
 * 最终得到一份完整 Cookie（这就是要写回「网易云 Cookie」的那份）。
 */
/**
 * 把用户粘贴的内容解析成标准 Cookie 字符串。
 *
 * 真实世界里用户可能粘进来的格式五花八门，全部要兼容：
 *
 *   ① 标准：        MUSIC_U=xxx; __csrf=yyy
 *   ② 带前缀：      Cookie: MUSIC_U=xxx; __csrf=yyy
 *   ③ DevTools 表格（全选复制得到的是**制表符分隔**）：
 *                   MUSIC_U <TAB> xxx <TAB> .music.163.com <TAB> /
 *   ④ 一行一个：    MUSIC_U=xxx
 *                   __csrf=yyy
 *   ⑤ 空格分隔：    MUSIC_U xxx
 *   ⑥ 带引号：      "MUSIC_U=xxx"
 *
 * 之前只支持 ①，所以从 DevTools 表格全选复制的内容会被当成非法，
 * 解析出 0 个字段 → 服务器自然判定未登录。这是本次修复的重点。
 */
function normalizeCookie(raw) {
  let text = String(raw || "").trim();
  if (!text) {
    return "";
  }
  // 去掉 "Cookie:" 前缀与包裹引号
  text = text.replace(/^cookie\s*:\s*/i, "");
  text = text.replace(/^["']+|["']+$/g, "");

  const out = [];
  /**
   * 记录每个名字出现过的所有值及其「所属域」，用于：
   *   1. 诊断「同名重复」（DevTools 里 .163.com 与 music.163.com 是两个域分组）
   *   2. 挑选正确的那一份：
   *        a. 优先 music.163.com 域（真正的登录会话域）
   *        b. 其次取最长（被截断的那份一定更短）
   *        c. 最后取第一个
   */
  const allValues = {};
  const order = [];

  const push = function (name, value, domain) {
    const n = String(name || "").trim();
    let v = String(value == null ? "" : value).trim();
    if (!n || !v) {
      return;
    }
    // Cookie 名只能是这些字符
    if (!/^[A-Za-z0-9_.\-]+$/.test(n)) {
      return;
    }
    // 去掉值两端多余的引号
    v = v.replace(/^["']+|["']+$/g, "");
    if (!allValues[n]) {
      allValues[n] = [];
      order.push(n);
    }
    allValues[n].push({ value: v, domain: String(domain || "") });
  };

  const lines = text.split(/[\r\n]+/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      continue;
    }

    // ③ DevTools 表格：制表符分隔，列顺序 name / value / domain / path
    if (line.indexOf("\t") >= 0) {
      const cols = line.split("\t");
      // 跳过表头行（Name / 名称 / 值 等）
      if (/^(name|名称)$/i.test(String(cols[0] || "").trim())) {
        continue;
      }
      if (cols.length >= 2) {
        push(cols[0], cols[1], cols[2]);
      }
      continue;
    }

    // ② / ① / ④ 含等号：按分号切成多个 name=value
    if (line.indexOf("=") >= 0) {
      const segs = line.split(";");
      for (let s = 0; s < segs.length; s++) {
        const seg = segs[s].trim();
        const eq = seg.indexOf("=");
        if (eq > 0) {
          push(seg.slice(0, eq), seg.slice(eq + 1));
        }
      }
      continue;
    }

    // ⑤ 空格分隔：name value
    const m = line.match(/^([A-Za-z0-9_.\-]+)\s+(\S+)/);
    if (m) {
      push(m[1], m[2]);
    }
  }

  // 同名重复统计（供诊断显示）
  let duplicateNames = [];
  let musicUDupCount = 0;
  let musicUHasDomainInfo = false;
  for (let i = 0; i < order.length; i++) {
    const n = order[i];
    const vals = allValues[n];
    if (vals.length > 1) {
      if (n === "MUSIC_U" || n === "MUSIC_A") {
        musicUDupCount = vals.length;
        // 有域名信息才能可靠判断用哪一份
        for (let k = 0; k < vals.length; k++) {
          if (vals[k].domain) {
            musicUHasDomainInfo = true;
          }
        }
      } else {
        duplicateNames.push(n + "×" + vals.length);
      }
    }
  }
  lastCookieParseInfo = {
    duplicateNames: duplicateNames,
    musicUDupCount: musicUDupCount,
    // true = 有重复但缺少域名信息，无法可靠判断该用哪一份
    musicUAmbiguous: musicUDupCount > 1 && !musicUHasDomainInfo,
  };

  for (let i = 0; i < order.length; i++) {
    const n = order[i];
    const vals = allValues[n];
    let chosen = vals[0];
    if (vals.length > 1) {
      // 优先「music.163.com」域那份；同域再取最长；再不行按原顺序
      const rank = function (item) {
        let score = 0;
        if (/music\.163\.com/i.test(item.domain)) {
          score += 1000; // 真正的登录会话域，最可信
        } else if (/^\.?163\.com$/i.test(item.domain)) {
          score += 100; // 父域，可能是旧会话
        }
        return score + Math.min(item.value.length, 900); // 长度作为次级判据
      };
      for (let k = 1; k < vals.length; k++) {
        if (rank(vals[k]) > rank(chosen)) {
          chosen = vals[k];
        }
      }
    }
    out.push(n + "=" + chosen.value);
  }

  return out.join("; ");
}

/**
 * 读取用户粘贴的原始 Cookie 输入（支持拆成 3 段）。
 *
 * 为什么支持拆分：`MUSIC_U` 有 800+ 字符，完整 Cookie 2000+。
 * 某些环境的输入框/存储有长度上限，长字符串会被静默截断，
 * 截断后的 MUSIC_U 会被服务器判为未登录（现象和「Cookie 失效」一样）。
 * 拆成几段填就不会被截断。
 */
function getRawCookieInput() {
  const variables = getUserVariables();
  return String(variables.cookie || "").trim();
}

function getEffectiveLoginCookie() {
  /**
   * 登录凭证来源优先级：
   *   1. 扫码登录刚拿到的 `qrLoginCookie`（最新、且是本机产生的，最可能被服务端接受）
   *   2. 用户变量里粘贴的 Cookie
   *
   * ⚠️ 但必须防止「老的扫码残留覆盖用户新粘贴的内容」这个历史坑：
   * 只有当用户**自扫码之后没有再改动粘贴内容**时，才采用扫码凭证。
   */
  const combined = getRawCookieInput();
  const userCookie = normalizeCookie(combined);

  // 用户改过粘贴内容 → 扫码凭证视为过期，优先用户粘贴的那份
  if (qrLoginCookie && qrLoginBaseRaw !== combined) {
    qrLoginCookie = null;
    qrLoginBaseRaw = "";
    qrLoginPersisted = false;
  }

  // 用户换了 Cookie（粘贴了新内容）→ 之前判断的「已失效」必须作废，
  // 否则换了新 Cookie 也仍然被当成未登录，永远恢复不了。
  if (lastSeenUserCookie !== userCookie) {
    lastSeenUserCookie = userCookie;
    if (userCookieExpired) {
      userCookieExpired = false;
    }
    accountCache = null;
    loginVerified = null;
    accountRiskBlocked = false;
    lastAccountCheck = null;
    dailyCache = null;
    // 换了 Cookie → 之前那次全组合探测的结果作废，下次重新探测
    lastProbeResults = null;
    // 换了 Cookie 就重新试验组合（新 Cookie 可能有不同的可用形态）
    cookieMode = 0;
  }

  const effective = qrLoginCookie || userCookie;
  return {
    cookie: effective,
    source: qrLoginCookie ? "qr" : userCookie ? "user" : "none",
  };
}

/**
 * Cookie 组合模式：
 *   0 = 基础参数 + 完整 Cookie（默认，最像浏览器）
 *   1 = 只用完整 Cookie
 *   2 = 只用登录必需字段（MUSIC_U / MUSIC_A / __csrf）
 *
 * 网易云对「客户端标识 + Cookie」的组合有不同处理，
 * 可能存在「带 os=pc 前缀就认不出登录」的情况。
 * 插件会用 /api 通道自动试出可用的那种，然后全局沿用。
 */
let cookieMode = 0;

/** 只保留登录必需字段的「最小 Cookie」 */
function buildMinimalCookie() {
  const parts = [];
  const u = getCookieValue("MUSIC_U");
  const a = getCookieValue("MUSIC_A");
  const csrf = getCookieValue("__csrf");
  if (u) {
    parts.push("MUSIC_U=" + u);
  }
  if (a) {
    parts.push("MUSIC_A=" + a);
  }
  if (csrf) {
    parts.push("__csrf=" + csrf);
  }
  return parts.join("; ");
}

function buildCookie(anonymous) {
  const base = "os=pc; appver=3.1.17.204416; osver=Microsoft-Windows-10-Professional-build-19045-64bit; channel=netease;";
  if (anonymous) {
    return base;
  }
  const effective = getEffectiveLoginCookie();
  if (!effective.cookie) {
    return base;
  }
  if (cookieMode === 2) {
    return buildMinimalCookie() || base;
  }
  if (cookieMode === 1) {
    return enrichCookie(effective.cookie);
  }
  return base + " " + enrichCookie(effective.cookie);
}

/**
 * 按开源实现的做法补齐 Cookie 里的「设备标识」字段。
 *
 * 参考 NeteaseCloudMusicApi 的 util/request.js → processCookieObject()，
 * 它会主动补上 __remember_me / ntes_kaola_ad / _ntes_nuid / _ntes_nnid /
 * WNMCID / WEVNSM 等字段。缺这些字段时，网易云有时会把请求当成「非常规客户端」。
 */
function enrichCookie(cookieStr) {
  if (!cookieStr) {
    return cookieStr;
  }
  const present = {};
  cookieStr.split(";").forEach(function (pair) {
    const eq = pair.indexOf("=");
    if (eq > 0) {
      present[pair.slice(0, eq).trim()] = true;
    }
  });

  const additions = [];
  const nuid = getStableDeviceId();
  if (!present["_ntes_nuid"]) {
    additions.push("_ntes_nuid=" + nuid);
  }
  if (!present["_ntes_nnid"]) {
    additions.push("_ntes_nnid=" + nuid + "," + Date.now());
  }
  if (!present["__remember_me"]) {
    additions.push("__remember_me=true");
  }
  if (!present["ntes_kaola_ad"]) {
    additions.push("ntes_kaola_ad=1");
  }
  if (!present["WEVNSM"]) {
    additions.push("WEVNSM=1.0.0");
  }
  if (!present["WNMCID"]) {
    additions.push("WNMCID=musicfree." + Date.now() + ".01.0");
  }

  return additions.length ? cookieStr + "; " + additions.join("; ") : cookieStr;
}

/**
 * 粗判「用户是否填了带登录凭证的 Cookie」。
 *
 * 网易云的登录凭证名字不稳定：
 *   MUSIC_U —— 老版网页登录
 *   MUSIC_A —— 新版网页登录
 * 且不同时期/不同入口可能换名字。所以这里放宽成：
 *   只要 Cookie 里有 MUSIC_ 开头、或看起来像 JWT 的长值，就先当作「可能登录」。
 *
 * ⚠️ 这只是**本地快速判断**，最终以服务端为准（见 requestAccount）。
 */
function hasLoginCookie() {
  const cookie = buildCookie();
  if (/MUSIC_[A-Z]=/i.test(cookie)) {
    return true;
  }
  // 兜底：有些环境会把登录凭证放在别的名字里，用「超长无空格值」粗略识别
  const jwtLike = cookie.match(/[A-Za-z0-9_]+=[A-Za-z0-9%._\-]{80,}/);
  return !!jwtLike;
}

/** 从 Cookie 里取某个字段的值 */
function getCookieValue(name) {
  const cookie = buildCookie();
  const match = cookie.match(new RegExp("(?:^|;\\s*)" + name + "=([^;\\s]+)", "i"));
  return match ? match[1] : "";
}

/**
 * 从用户 Cookie 里取 __csrf 值。
 * 网易云的登录态接口要求 params 里的 csrf_token 与 Cookie 中的 __csrf 一致，
 * 否则会被当作未登录（表现为「返回空数据」而不是报错，很容易误判）。
 */
function getCsrfToken() {
  return getCookieValue("__csrf");
}

/** Cookie 里是否带了 CSRF 字段 */
function hasCsrfCookie() {
  return getCsrfToken().length > 0;
}

/**
 * 读取插件设置。
 * MusicFree 的 userVariables 只能存字符串，所以用 "1" / "0" 当开关。
 */
function getPluginSettings() {
  const variables = getUserVariables();
  const raw = String(variables.bilibiliFallback === undefined
    ? "1"
    : variables.bilibiliFallback).trim().toLowerCase();
  const mp4 = String(variables.bilibiliMp4 === undefined
    ? "0"
    : variables.bilibiliMp4).trim().toLowerCase();
  return {
    // 默认开启：拿不到网易云音源时自动用 B 站
    useBilibili: raw !== "0" && raw !== "false" && raw !== "off" && raw !== "no",
    /**
     * B 站回退时是否优先用 mp4（视频容器）。
     *
     * 默认 **false**（优先纯音频 dash）：
     *   ・纯音频流体积小、解码稳定，播放器「自动下一曲」不会卡在视频轨上；
     *   ・mp4 含视频轨，某些播放器把时长/位置按视频计算，
     *      会出现「播完不切下一曲」甚至直接报 Source error。
     * 只有在纯音频解析失败时才自动回退 mp4（见 getBiliMediaSource）。
     * 用户可显式传 1/true/on 强制 mp4 优先。
     */
    useMp4: mp4 === "1" || mp4 === "true" || mp4 === "on" || mp4 === "yes",
  };
}

/**
 * 用户 Cookie 失效标记：
 * 网易云在携带过期 MUSIC_U 时，会把本来可以匿名访问的接口也变成 301，
 * 因此检测到失效后就退回纯匿名请求，避免整个插件不可用。
 *
 * ⚠️ 这个标记必须「可恢复」：
 *   1. 只有真正的 301/403（服务端说未登录）才允许置位，
 *      **-462 是风控，与 Cookie 是否有效无关，绝不能当失效处理**
 *   2. 用户一改 Cookie 就立刻复位（见 getEffectiveLoginCookie）
 */
let userCookieExpired = false;

/** 上一次看到的用户 Cookie 内容，用于「换 Cookie 就复位标记」 */
let lastSeenUserCookie = null;

/** 最近一次 Cookie 解析的附加信息（同名重复等），供诊断显示 */
let lastCookieParseInfo = null;

/** 最近一次「全组合探测」的结果（各请求形态查到的账号 ID） */
let lastProbeResults = null;

/** 最近一次「Cookie 请求头回显检测」的结果 */
let lastEchoResult = null;

/**
 * 每日推荐结果缓存（榜单页与详情页共用，避免重复请求）
 * 注意：这里提前声明，因为 getEffectiveLoginCookie（更靠前的代码）会清它。
 */
let dailyCache = null;

function markUserCookieExpired() {
  userCookieExpired = true;
  // 登录态变了，缓存的推荐结果作废
  dailyCache = null;
}

function padStart(text, length, char) {
  let str = String(text);
  while (str.length < length) {
    str = (char || "0") + str;
  }
  return str;
}

/** 字符串转十六进制（不依赖 Buffer，兼容 React Native） */
function strToHex(str) {
  let hex = "";
  for (let i = 0; i < str.length; i++) {
    hex += padStart(str.charCodeAt(i).toString(16), 2, "0");
  }
  return hex;
}

function randomKey(length) {
  let key = "";
  for (let i = 0; i < length; i++) {
    key += BASE62.charAt(Math.floor(Math.random() * BASE62.length));
  }
  return key;
}

/** AES-128-CBC 加密，返回 base64 */
function aesEncrypt(text, key) {
  const encrypted = CryptoJs.AES.encrypt(text, CryptoJs.enc.Utf8.parse(key), {
    iv: CryptoJs.enc.Utf8.parse(IV),
    mode: CryptoJs.mode.CBC,
    padding: CryptoJs.pad.Pkcs7,
  });
  return encrypted.toString();
}

/** 网易云使用的「无填充 RSA」：文本倒序 → 十六进制 → 模幂 */
function rsaEncrypt(text) {
  const reversed = text.split("").reverse().join("");
  const hex = strToHex(reversed);
  const result = bigInt(hex, 16)
    .modPow(bigInt(PUB_KEY, 16), bigInt(MODULUS, 16))
    .toString(16);
  return padStart(result, 256, "0");
}

/** weapi 参数加密 */
function encryptWeapi(data) {
  const text = JSON.stringify(data || {});
  const secretKey = randomKey(16);
  return {
    params: aesEncrypt(aesEncrypt(text, PRESET_KEY), secretKey),
    encSecKey: rsaEncrypt(secretKey),
  };
}

function formatDate(timestamp) {
  if (!timestamp) {
    return "";
  }
  const date = new Date(timestamp);
  return (
    date.getFullYear() +
    "-" +
    padStart(date.getMonth() + 1, 2, "0") +
    "-" +
    padStart(date.getDate(), 2, "0")
  );
}

/** 毫秒 → 秒 */
function toSeconds(milliseconds) {
  return Math.floor((Number(milliseconds) || 0) / 1000);
}

function createError(message) {
  return new Error(message);
}

//#endregion

//#region 网络请求

/**
 * 调用 weapi 接口
 * @param {string} path 形如 /weapi/v3/discovery/recommend/songs
 * @param {object} data 业务参数
 * @param {object} [options]
 * @param {boolean} [options.requireLogin] 是否必须带用户 Cookie
 */
/**
 * ============ eapi 通道（关键兜底） ============
 *
 * 背景：部分运行环境（尤其是 Android 上的 RN 网络层）可能会忽略我们手写的
 * `Cookie` 请求头，导致服务器始终把我们当匿名 → 任何需要登录的接口都失败，
 * 而现象与「Cookie 失效」一模一样。
 *
 * 参考 NeteaseCloudMusicApi 的 util/request.js，eapi 通道会把 MUSIC_U / MUSIC_A
 * 放进 **加密体内部的 header 字段**（同时也放 Cookie 头）。
 * 也就是说：即使 Cookie 头被丢掉，MUSIC_U 依然能送达服务端。
 *
 * 实测：不带 Cookie 头时 eapi 仍返回 code=200，说明服务端确实从 body 里读。
 */
const EAPI_KEY = "e82ckenh8dichen8";
const EAPI_DOMAIN = "https://interfacepc.music.163.com";
const EAPI_UA = "NeteaseMusic 9.0.90/5038 (iPhone; iOS 16.2; zh_CN)";

/** 是否已经确认「只能用 eapi 才能带上登录态」 */
let preferEapi = false;

function eapiEncrypt(uri, data) {
  const text = JSON.stringify(data);
  const message = "nobody" + uri + "use" + text + "md5forencrypt";
  const digest = CryptoJs.MD5(message).toString();
  const payload = uri + "-36cd479b6b5-" + text + "-36cd479b6b5-" + digest;
  const enc = CryptoJs.AES.encrypt(payload, CryptoJs.enc.Utf8.parse(EAPI_KEY), {
    mode: CryptoJs.mode.ECB,
    padding: CryptoJs.pad.Pkcs7,
  });
  return enc.ciphertext.toString().toUpperCase();
}

/** 构造 eapi 的 header（含登录凭证） */
function buildEapiHeader(opts) {
  const musicU = getCookieValue("MUSIC_U");
  /**
   * ⚠️ 匿名设备凭证（MUSIC_A）会盖过用户凭证：
   * 实测手机上一旦注册过匿名设备，服务端就按「设备匿名账号」解析，
   * 用户给的 MUSIC_U 完全失效。所以**只要用户填了 Cookie，就绝不再掺入
   * 匿名设备的 MUSIC_A**。
   */
  const hasUserCookie = !!getRawCookieInput();
  const musicA = getCookieValue("MUSIC_A") || (!hasUserCookie && anonDevice && anonDevice.musicA) || "";
  const csrf = getCookieValue("__csrf") || (anonDevice && anonDevice.csrf) || "";
  /**
   * 参考项目 util/request.js 的 eapi 分支：
   *   if (crypto === 'eapi' && cookie.NMTID) header['NMTID'] = cookie.NMTID
   * NMTID 是设备会话标识，缺了它服务端可能按「设备匿名会话」识别，
   * 从而返回设备对应的匿名账号（而不是 MUSIC_U 对应的账号）。
   */
  const nmtid = getCookieValue("NMTID");
  /**
   * os / appver / osver / channel 必须与参考项目一致（PC 端）：
   *   versioncode=140、mobilename=''、buildver=时间戳前10位、resolution=1920x1080。
   */
  const header = {
    osver: "Microsoft-Windows-10-Professional-build-19045-64bit",
    deviceId: getStableDeviceId(),
    os: "pc",
    appver: "3.1.17.204416",
    versioncode: "140",
    mobilename: "",
    buildver: String(Date.now()).slice(0, 10),
    resolution: "1920x1080",
    __csrf: csrf,
    channel: "netease",
    requestId:
      Date.now() + "_" + String(Math.floor(Math.random() * 1000)).padStart(4, "0"),
  };
  /**
   * mobile：手机 App 形态。
   * 每日推荐 v1 接口在移动端形态下返回与手机 App 一致的列表
   * （PC 形态返回的是网页版列表，两者内容不同）。
   */
  if (opts && opts.mobile) {
    header.os = "ios";
    header.osver = "16.2";
    header.appver = "9.0.90";
    header.resolution = "1170x2532";
  }
  if (musicU) {
    header.MUSIC_U = musicU;
  }
  if (musicA) {
    header.MUSIC_A = musicA;
  }
  if (nmtid) {
    header.NMTID = nmtid;
  }
  return header;
}

/**
 * 走 eapi 通道请求。
 * apiPath 用 `/api/...` 形式（和开源实现一致），内部会自动转成 `/eapi/...`。
 * opts.mobile = true 时用手机 App 形态的 header（每日推荐 v1 用）。
 */
async function eapiRequest(apiPath, data, opts) {
  const result = await eapiRawRequest(apiPath, data, opts);
  return result.data;
}

/** eapi 请求，额外返回 Set-Cookie（扫码登录要靠它拿凭证） */
async function eapiRawRequest(apiPath, data, opts) {
  const header = buildEapiHeader(opts);
  const payload = Object.assign({}, data || {}, { header: header });
  const params = eapiEncrypt(apiPath, payload);
  const url = EAPI_DOMAIN + "/eapi/" + String(apiPath).slice(5);

  // Cookie 头也带上（有些环境会正常发送，属于加分项）
  const cookieParts = Object.keys(header).map(function (k) {
    return encodeURIComponent(k) + "=" + encodeURIComponent(header[k]);
  });

  const response = await axios.post(url, "params=" + encodeURIComponent(params), {
    headers: {
      "User-Agent": EAPI_UA,
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieParts.join("; "),
    },
    timeout: 12000,
  });
  return {
    data: (response && response.data) || {},
    setCookie: response && response.headers && response.headers["set-cookie"],
  };
}

async function weapiRequest(path, data, options) {
  const opts = options || {};
  /**
   * forceCookie：强制带上用户 Cookie，忽略「已失效」降级标记。
   * 登录态检查必须用这个 —— 否则一旦被误判失效，后续检查永远走匿名，
   * 就再也没机会发现自己其实已经恢复了（死循环）。
   */
  const useUserCookie = opts.forceCookie
    ? hasAnyCookie()
    : !opts.anonymous && !userCookieExpired;
  return requestOnce(path, data, useUserCookie, opts.requireLogin, UA);
}

async function requestOnce(path, data, useUserCookie, requireLogin, userAgent) {
  /**
   * 登录态接口（如 v1 每日推荐）需要带上真实的 __csrf 值，
   * 否则服务端会当成未登录处理。这里从用户 Cookie 里解析。
   */
  const payload = Object.assign(
    { csrf_token: useUserCookie ? getCsrfToken() : "" },
    data || {}
  );
  const encrypted = encryptWeapi(payload);
  const body =
    "params=" +
    encodeURIComponent(encrypted.params) +
    "&encSecKey=" +
    encodeURIComponent(encrypted.encSecKey);

  let response;
  try {
    response = await axios.post(BASE_URL + path, body, {
      headers: {
        "User-Agent": userAgent || UA,
        Referer: BASE_URL + "/",
        Origin: BASE_URL,
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: buildCookie(!useUserCookie),
      },
      timeout: 12000,
    });
  } catch (error) {
    const status = error && error.response && error.response.status;
    if (status === 403) {
      throw createError("网易云接口返回 403，请稍后重试或更换网络环境");
    }
    if (status === 429) {
      throw createError("网易云接口请求过于频繁，请稍后再试");
    }
    throw createError("网易云请求失败：" + ((error && error.message) || "网络异常"));
  }

  const result = response && response.data;
  if (!result || typeof result.code !== "number") {
    throw createError("网易云接口返回数据异常");
  }
  if (result.code === 200 || result.code === 201) {
    return result;
  }
  if (result.code === 301) {
    // 带了用户 Cookie 却被判定未登录：先尝试匿名重试，
    // 匿名能成功才说明是 Cookie 失效（而不是该接口本身需要登录）
    if (useUserCookie && !requireLogin) {
      try {
        const anonResult = await requestOnce(path, data, false, requireLogin, userAgent);
        markUserCookieExpired();
        return anonResult;
      } catch (retryError) {
        throw createError("该功能需要登录网易云账号，请在插件设置里填写有效的 Cookie");
      }
    }
    throw createError("该功能需要登录网易云账号，请在插件设置里填写有效的 Cookie");
  }
  if (result.code === -462) {
    /**
     * 网易云风控：短时间内请求过多会要求人机验证，与插件逻辑无关。
     *
     * ⚠️ 提示必须区分「有没有填 Cookie」：
     * 游客模式下提示「重新复制 Cookie」会让用户困惑（他根本没有 Cookie），
     * 所以这里按登录状态给不同的建议。
     */
    const hasCookieNow = hasAnyCookie();
    if (hasCookieNow) {
      throw createError(
        "网易云风控（-462 请完成验证）。可依次尝试：\n" +
          "① 重新复制一份 Cookie（过期的 Cookie 会让所有通道都被判异常）\n" +
          "② 切换网络（Wi-Fi ↔ 手机流量）\n" +
          "③ 等几分钟再重试"
      );
    }
    throw createError(
      "网易云风控（-462 请完成验证），当前是**未登录**状态，匿名请求额度被限流了。\n" +
        "可依次尝试：\n" +
        "① 等几分钟再重试\n" +
        "② 切换网络（Wi-Fi ↔ 手机流量）\n" +
        "③ 填入网易云 Cookie（登录后请求额度更高，也更稳定）"
    );
  }
  const message = result.message || result.msg || "";
  throw createError("网易云接口错误（" + result.code + "）" + (message ? "：" + message : ""));
}

/**
 * 通用 GET 请求（老版 /api 接口，作为 weapi 被封时的备用通道）。
 *
 * ⚠️ 这里必须和 weapi 一样处理「Cookie 失效」：
 * 带着过期 Cookie 请求 /api 接口，网易云会返回 301，
 * 如果不做匿名重试，备用通道也会失效——最终表现就是
 * 「weapi 被 -462 + /api 被 301」→ 整个功能报风控。
 */
async function apiGet(path, params, userAgent) {
  const attempt = async function (useAnon) {
    let response;
    try {
      response = await axios.get(BASE_URL + path, {
        params: params,
        headers: {
          "User-Agent": userAgent || UA,
          Referer: BASE_URL + "/",
          Cookie: buildCookie(useAnon),
        },
        timeout: 12000,
      });
    } catch (error) {
      const status = error && error.response && error.response.status;
      const e = createError("网易云请求失败（" + (status || "网络异常") + "）");
      e.__status = status;
      throw e;
    }
    const result = response && response.data;
    if (!result || typeof result.code !== "number") {
      throw createError("网易云接口返回数据异常");
    }
    if (result.code < 0) {
      const e = createError("网易云接口错误（" + result.code + "）");
      e.__code = result.code;
      throw e;
    }
    return result;
  };

  const usingUserCookie = !userCookieExpired && !!getEffectiveLoginCookie().cookie;
  try {
    return await attempt(!usingUserCookie);
  } catch (error) {
    // 带用户 Cookie 时被判 301 / 403：匿名重试一次
    //
    // ⚠️ 注意：这里**不能**把 -462 也算进来。
    // -462 是风控（要求人机验证），跟 Cookie 有没有过期毫无关系；
    // 之前把它当失效处理，会导致一个被风控的接口把整份 Cookie 废掉，
    // 之后所有请求都退化成匿名 → 表现就是「网页明明登录了，插件却说 Cookie 失效」。
    const looksUnauthorized = error.__status === 301 || error.__status === 403;
    if (usingUserCookie && looksUnauthorized) {
      try {
        const result = await attempt(true);
        // 匿名能成功 → 说明用户 Cookie 确实未登录，之后统一走匿名
        markUserCookieExpired();
        return result;
      } catch (anonError) {
        throw error;
      }
    }
    throw error;
  }
}

/**
 * 带备用通道的请求。
 * 网易云对「接口路径 + UA + Cookie」组合分别计数风控，实测常出现
 * 「PC UA 的 weapi 被 -462，但移动 UA 的老版 /api 还能用」，
 * 因此这里按 (UA, 通道) 做两级降级：
 *   1. weapi + PC UA
 *   2. /api  + PC UA
 *   3. /api  + 移动 UA
 */
async function requestWithFallback(weapiPath, data, getPath, getParams, options) {
  try {
    return await weapiRequest(weapiPath, data, options);
  } catch (error) {
    if (!getPath) {
      throw error;
    }
    try {
      return await apiGet(getPath, getParams, UA);
    } catch (pcError) {
      try {
        return await apiGet(getPath, getParams, UA_MOBILE);
      } catch (mobileError) {
        throw error;
      }
    }
  }
}

//#endregion

//#region 数据格式化

/** 歌单/榜单/每日推荐接口里的歌曲（ar / al / dt 风格） */
function formatMusicItem(song) {
  if (!song) {
    return null;
  }
  const artists = song.ar || song.artists || [];
  const album = song.al || song.album || {};
  return {
    id: String(song.id),
    title: song.name || "",
    artist: artists
      .map(function (item) {
        return (item && item.name) || "";
      })
      .filter(Boolean)
      .join("/"),
    album: album.name || "",
    artwork: album.picUrl || album.blurPicUrl || "",
    duration: toSeconds(song.dt || song.duration),
    // 扩展字段，便于后续方法复用
    fee: song.fee,
    albumId: album.id ? String(album.id) : undefined,
    publishTime: song.publishTime,
  };
}

/** 搜索接口里的歌曲（album / artists / duration 风格） */
function formatSearchMusicItem(song) {
  if (!song) {
    return null;
  }
  const artists = song.artists || song.ar || [];
  const album = song.album || song.al || {};
  return {
    id: String(song.id),
    title: song.name || "",
    artist: artists
      .map(function (item) {
        return (item && item.name) || "";
      })
      .filter(Boolean)
      .join("/"),
    album: album.name || "",
    artwork: album.picUrl || album.blurPicUrl || "",
    duration: toSeconds(song.duration || song.dt),
    fee: song.fee,
    albumId: album.id ? String(album.id) : undefined,
  };
}

function formatAlbumItem(album) {
  const artistNames = album.artist && album.artist.name
    ? album.artist.name
    : (album.artists || [])
        .map(function (item) {
          return item && item.name;
        })
        .filter(Boolean)
        .join("/");
  return {
    id: String(album.id),
    title: album.name || "",
    artist: artistNames,
    artwork: album.picUrl || album.blurPicUrl || "",
    description: album.description || album.briefDesc || "",
    worksNum: album.size || album.worksNum,
    createAt: album.publishTime,
  };
}

function formatArtistItem(artist) {
  return {
    id: String(artist.id),
    name: artist.name || "",
    avatar: artist.picUrl || artist.img1v1Url || "",
    description: artist.briefDesc || "",
    worksNum: artist.musicSize,
    albumSize: artist.albumSize,
    fans: artist.fansSize,
  };
}

function formatSheetItem(sheet) {
  return {
    id: String(sheet.id),
    title: sheet.name || "",
    artwork: sheet.coverImgUrl || sheet.picUrl || "",
    artist: (sheet.creator && sheet.creator.nickname) || "",
    description: sheet.description || "",
    playCount: sheet.playCount,
    worksNum: sheet.trackCount,
    createAt: sheet.createTime,
  };
}

//#endregion

//#region 缓存

/** 歌单详情缓存：详情页翻页时避免重复拉取整份歌单 */
const playlistCache = new Map();
const PLAYLIST_CACHE_TTL = 3 * 60 * 1000;

function getCachedPlaylist(id) {
  const cached = playlistCache.get(String(id));
  if (cached && Date.now() - cached.time < PLAYLIST_CACHE_TTL) {
    return cached.data;
  }
  playlistCache.delete(String(id));
  return null;
}

function setCachedPlaylist(id, data) {
  playlistCache.set(String(id), { time: Date.now(), data: data });
  if (playlistCache.size > 20) {
    const firstKey = playlistCache.keys().next().value;
    playlistCache.delete(firstKey);
  }
}

/** 当前登录账号缓存（false 表示未登录） */
let accountCache = null;

//#endregion

//#region 基础接口

/** 歌单详情（含完整 trackIds） */
async function requestPlaylistDetail(id) {
  const cached = getCachedPlaylist(id);
  if (cached) {
    return cached;
  }
  const result = await requestWithFallback(
    "/weapi/v6/playlist/detail",
    { id: id, n: 1000, s: 0 },
    "/api/playlist/detail",
    { id: id, updateTime: -1 }
  );
  // weapi 把歌单放在 playlist，老接口放在 result
  let playlist = result.playlist || result.result;
  if (!playlist) {
    throw createError("歌单不存在或已下架");
  }

  /**
   * 老版 /api/playlist/detail 的 tracks 常被截断（大歌单只给 10 条）且没有 trackIds。
   * 这时再试一次 /api/v6：它虽然同样截断 tracks，但会带上完整的 trackIds，
   * 有了 trackIds 就能按页批量补全，不会丢歌。
   */
  const trackIds = playlist.trackIds || [];
  const trackCount = playlist.trackCount || 0;
  if (!trackIds.length && trackCount > (playlist.tracks || []).length) {
    try {
      const detail = await apiGet("/api/v6/playlist/detail", { id: id, n: 1000, s: 0 }, UA);
      const candidate = detail.playlist;
      if (candidate && candidate.trackIds && candidate.trackIds.length) {
        playlist = candidate;
      }
    } catch (error) {
      // 拿不到就用已有的数据，最多只能看到截断后的部分
    }
  }

  setCachedPlaylist(id, playlist);
  return playlist;
}

/** 批量获取歌曲信息（按传入 id 顺序返回） */
async function requestSongDetails(ids) {
  const list = (ids || []).filter(function (id) {
    return id !== undefined && id !== null && id !== "";
  });
  if (!list.length) {
    return [];
  }
  const c = JSON.stringify(
    list.map(function (id) {
      return { id: id };
    })
  );
  const result = await requestWithFallback(
    "/weapi/v3/song/detail",
    { c: c },
    "/api/song/detail",
    {
      ids: "[" +
        list
          .map(function (id) {
            return JSON.stringify(id);
          })
          .join(",") +
        "]",
    }
  );
  const songs = result.songs || [];
  // 接口偶尔少返回，这里按请求顺序还原，避免错位
  const map = new Map();
  songs.forEach(function (song) {
    map.set(String(song.id), song);
  });
  const ordered = [];
  list.forEach(function (id) {
    const song = map.get(String(id));
    if (song) {
      ordered.push(song);
    }
  });
  return ordered;
}

/**
 * 获取账号信息（未登录返回 null）。
 *
 * 这里是**判断登录的唯一权威来源**：只要用户填了 Cookie，就真的问一次服务端，
 * 而不是靠猜 Cookie 里有没有某个字段名（网易云的凭证名一直在变，猜不准）。
 */
/** 是否配置了任何可用的登录凭证（手填 Cookie 或扫码得到） */
function hasAnyCookie() {
  return !!getRawCookieInput() || !!qrLoginCookie;
}

async function requestAccount() {
  /**
   * ⚠️ 必须先跑一次 getEffectiveLoginCookie()。
   *
   * 它会检测「用户是否换了 Cookie」，并在变化时清空 accountCache。
   * 如果直接返回缓存（下面那行），用户粘贴了新的 Cookie 也永远看不到更新，
   * 表现就是「明明换了 Cookie，账号 ID 一直不变」——必须重启 App 才会刷新。
   */
  getEffectiveLoginCookie();

  if (accountCache !== null) {
    return accountCache || null;
  }
  // 完全没有登录凭证：不必浪费请求
  if (!hasAnyCookie()) {
    accountCache = false;
    return null;
  }

  // 记录「这次实际会发出去什么」，供自检显示，便于发现解析或降级问题
  recordSendDebug();

  /**
   * 交叉验证两个通道：
   *   A. GET /api/nuser/account/get      —— 未加密通道，不受 -462 风控
   *   B. POST /weapi/nuser/account/get     —— 加密通道，可能被风控
   *
   * 为什么要两个都查：单看任何一个都可能误判——
   *   ・weapi 被 -462 → 看起来像未登录
   *   ・/api 接口行为不一致时 → 也像未登录
   * 只要**任意一个**返回了账号，就说明 Cookie 有效。
   * 只有两个通道都明确「没有账号」时才判定未登录。
   */
  let apiSaidNoAccount = false;
  let apiOk = false;
  let weapiSaidNoAccount = false;
  let weapiRiskBlocked = false;

  // A. 先走 /api 通道（快、且不受风控）
  try {
    const viaApi = await requestAccountViaApi();
    if (sendDebug) {
      sendDebug.channelApi = viaApi
        ? viaApi.account
          ? "有账号"
          : "无账号（HTTP " + (viaApi.httpStatus || "?") + " / code " + (viaApi.bodyCode == null ? "?" : viaApi.bodyCode) + "）"
        : "请求失败";
      if (viaApi && viaApi.errorMessage) {
        sendDebug.channelApi = "请求失败：" + viaApi.errorMessage;
      }
    }
    if (viaApi && viaApi.account) {
      if (sendDebug) {
        sendDebug.channelApi = "有账号";
        sendDebug.channelApiAccountId =
          (accountCache && accountCache.userId) || "";
      }
      return viaApi.account;
    }
    if (viaApi && viaApi.definitive) {
      apiSaidNoAccount = true;
      apiOk = true;
    }

    // A-2. 浏览器 UA 拿不到 → 换移动端 UA 再试（按 UA 限流时有效）
    try {
      const viaMobile = await requestAccountViaApiMobile();
      if (sendDebug) {
        if (viaMobile && viaMobile.account) {
          sendDebug.channelApi = "有账号（移动端UA）";
          sendDebug.channelApiAccountId =
            (accountCache && accountCache.userId) || "";
        } else if (viaMobile && viaMobile.definitive) {
          sendDebug.channelApi =
            "无账号（移动端UA，HTTP " +
            (viaMobile.httpStatus || "?") +
            " / code " +
            (viaMobile.bodyCode == null ? "?" : viaMobile.bodyCode) +
            "）";
        }
      }
      if (viaMobile && viaMobile.account) {
        return viaMobile.account;
      }
    } catch (error) {
      // 移动端 UA 也失败就继续走 weapi
    }

    // A-3. 换域名再试（绕开 music.163.com 上的设备残留会话）
    try {
      const viaAlt = await requestAccountViaApiAltHost();
      if (sendDebug) {
        if (viaAlt && viaAlt.account) {
          sendDebug.channelApi = "有账号（换域名 interface.music.163.com）";
          sendDebug.channelApiAccountId =
            (accountCache && accountCache.userId) || "";
        } else if (viaAlt && viaAlt.definitive) {
          sendDebug.channelApi =
            "无账号（换域名，HTTP " +
            (viaAlt.httpStatus || "?") +
            " / code " +
            (viaAlt.bodyCode == null ? "?" : viaAlt.bodyCode) +
            "）";
        }
      }
      if (viaAlt && viaAlt.account) {
        return viaAlt.account;
      }
    } catch (error) {
      // 换域名也失败就继续走 weapi
    }
  } catch (error) {
    if (sendDebug) {
      sendDebug.channelApi = "请求失败：" + ((error && error.message) || "未知");
    }
  }

  // B. 再走 weapi 通道
  //
  // 注意：网易云有两个「查账号」的 weapi 路径，风控策略不一样——
  //   /weapi/nuser/account/get    官方备份项目 user_account.js 用的，通常可用
  //   /weapi/w/nuser/account/get  login_status.js 用的，实测更容易被 -462 拦
  // 所以两个都试，哪个通就用哪个。
  const weapiPaths = ["/weapi/nuser/account/get", "/weapi/w/nuser/account/get"];
  const weapiDetails = [];
  for (let wi = 0; wi < weapiPaths.length; wi++) {
    const weapiPath = weapiPaths[wi];
    try {
      const result = await weapiRequest(weapiPath, {}, {
        requireLogin: true,
        // 强制带 Cookie：这是唯一能判断「到底登录没登录」的地方，
        // 不能被降级标记影响，否则会出现「越查越像未登录」的死循环
        forceCookie: true,
      });
      if (result && result.account && result.profile) {
        weapiDetails.push(weapiPath + " → 有账号");
        if (sendDebug) {
          sendDebug.weapiDetails = weapiDetails;
        }
        applyAccountResult(result, "ok");
        if (sendDebug) {
          sendDebug.channelWeapi = weapiPath + " → 有账号";
          sendDebug.channelWeapiAccountId =
            (accountCache && accountCache.userId) || "";
        }
        return accountCache || null;
      }
      weapiSaidNoAccount = true;
      weapiDetails.push(weapiPath + " → 无账号");
    } catch (error) {
      const msg = (error && error.message) || "";
      if (msg.indexOf("-462") >= 0 || msg.indexOf("风控") >= 0) {
        weapiRiskBlocked = true;
        weapiDetails.push(weapiPath + " → 被风控(-462)");
      } else {
        weapiDetails.push(weapiPath + " → 请求失败");
      }
    }
  }
  if (sendDebug) {
    sendDebug.weapiDetails = weapiDetails;
    sendDebug.channelWeapi = weapiDetails.join("；");
  }

  /**
   * C. eapi 通道：把 MUSIC_U 放进加密体内部。
   *
   * 这一步专治「客户端不发 Cookie 头」的情况——上面三个通道全部说无账号时，
   * 只要 eapi 能拿到账号，就说明 Cookie 本身有效、只是 Cookie 头没送达。
   * 此时打开 preferEapi，后续需要登录的请求（每日推荐、我的歌单）都改走 eapi。
   */
  let eapiSaidNoAccount = false;
  let eapiOk = false;
  try {
    const result = await eapiRequest("/api/nuser/account/get", {});
    if (sendDebug) {
      sendDebug.channelEapi = result && result.account ? "有账号" : "无账号";
      sendDebug.channelEapiCode = result && result.code;
      // 把原始字段记下来，便于确认 uid / 昵称到底在哪
      const acc = (result && result.account) || {};
      const prof = (result && result.profile) || null;
      sendDebug.accountKeys = Object.keys(acc).join(",");
      sendDebug.accountId = acc.id === undefined ? "" : String(acc.id);
      sendDebug.accountUserId = acc.userId === undefined ? "" : String(acc.userId);
      sendDebug.hasEapiProfile = !!prof;
      sendDebug.profileKeys = prof ? Object.keys(prof).join(",") : "";
      sendDebug.profileNickname = prof ? prof.nickname || "" : "";
      sendDebug.profileUserId = prof && prof.userId !== undefined ? String(prof.userId) : "";
      sendDebug.accountUserName = acc.userName || "";
      // 手机号（一般会被打码成 183****3956），用来确认「这个账号是不是我」
      sendDebug.accountPhone = acc.phone || acc.mobile || "";
      sendDebug.accountNickname = acc.nickname || acc.nickName || "";
      sendDebug.channelEapiAccountId =
        acc.id === undefined ? "" : String(acc.id);
      // 顶层字段也能说明问题（有些响应把 profile 放别处）
      sendDebug.topKeys = result ? Object.keys(result).join(",") : "";
    }
    // ⚠️ 只看 account，不要求 profile：eapi 响应可能没有 profile
    if (result && result.account) {
      preferEapi = true;
      applyAccountResult(result, "ok");
      // account/userName 往往是「1000_xxx」这类登录名占位符，不是真昵称。
      // 用 eapi 再查一次用户详情，拿真正的 nickname / 头像。
      await fillRealProfileViaEapi();
      return accountCache || null;
    }
    eapiOk = true;
    eapiSaidNoAccount = true;
  } catch (error) {
    if (sendDebug) {
      sendDebug.channelEapi =
        "请求失败：" + ((error && error.message) || "未知");
    }
  }

  // 汇总判断
  if (eapiOk && eapiSaidNoAccount) {
    // eapi 把凭证放在加密体内部，服务端一定收得到 → 它的结论最可信
    markLoginVerified(false);
    lastAccountCheck = "not-logged-in";
    accountRiskBlocked = false;
  } else if (apiOk && apiSaidNoAccount && weapiSaidNoAccount) {
    // 两个通道都说没有账号 → 确实未登录
    markLoginVerified(false);
    lastAccountCheck = "not-logged-in";
    accountRiskBlocked = false;
  } else if (apiOk && apiSaidNoAccount) {
    // /api 明确未登录，weapi 被风控 → 以 /api 为准
    markLoginVerified(false);
    lastAccountCheck = "not-logged-in";
    accountRiskBlocked = false;
  } else if (weapiRiskBlocked || !apiOk) {
    // 拿不到确定结论 → 归为风控，不能断言 Cookie 失效
    accountRiskBlocked = true;
  } else {
    markLoginVerified(false);
    lastAccountCheck = "not-logged-in";
  }

  return accountCache || null;
}

/**
 * 尽力补齐真实昵称/头像。
 *
 * 为什么需要：eapi 的 account/get 常常只返回 account（含 id、userName），
 * 而 `userName` 是「1000_xxxx」这类登录名占位符，不是显示昵称。
 * 这里依次尝试多个接口，哪个能给出真昵称就用哪个。
 */
async function fillRealProfileViaEapi() {
  if (!accountCache || !accountCache.userId) {
    return;
  }
  const uid = String(accountCache.userId);
  const attempts = [
    { path: "/api/user/detail/" + uid, data: {} },
    { path: "/api/v1/user/detail/" + uid, data: {} },
    { path: "/api/user/detail", data: { uid: uid } },
    { path: "/api/v1/user/detail", data: { uid: uid } },
  ];
  for (let i = 0; i < attempts.length; i++) {
    try {
      const detail = await eapiRequest(attempts[i].path, attempts[i].data);
      const profile =
        (detail && detail.profile) ||
        (detail && detail.data && detail.data.profile) ||
        (detail && detail.data) ||
        null;
      if (profile && profile.nickname) {
        accountCache.nickname = String(profile.nickname);
        if (profile.userId) {
          accountCache.userId = profile.userId; // 以 user/detail 的 userId 为准
        }
        if (profile.avatarUrl) {
          accountCache.avatarUrl = profile.avatarUrl;
        }
        if (sendDebug) {
          sendDebug.profileSource = attempts[i].path;
        }
        return;
      }
    } catch (error) {
      // 换下一个接口
    }
  }
}

/** 把 account/get 的返回结果写入缓存 */
function applyAccountResult(result, okState) {
  const previousLoginState = loginVerified;
  /**
   * ⚠️ 关键：不能要求必须有 profile。
   * eapi 通道的 account/get 有时只返回 account、没有 profile，
   * 之前用 `result.account && result.profile` 判断，会把「成功」误判成「未登录」。
   * 这里把 account / profile / data.* 各种结构都兼容上。
   */
  const root =
    result && result.data && (result.data.account || result.data.profile)
      ? result.data
      : result;
  if (root && root.account) {
    const acc = root.account || {};
    const prof = root.profile || {};
    /**
     * 昵称取值顺序：profile.nickname 最可靠。
     * account.userName 往往是「1000_<32位hex>」这种登录名占位符，不能当昵称显示，
     * 所以遇到占位符就当「昵称未知」（留空），后面再尝试补全。
     */
    const rawNick =
      prof.nickname ||
      acc.nickname ||
      prof.userName ||
      acc.userName ||
      "";
    const isPlaceholder = /^\d{3,}_[0-9A-Fa-f]{16,}$/.test(String(rawNick));
    /**
     * 匿名设备账号识别。
     *
     * 网易云在「没有任何被接受的有效凭证」时，会给当前设备分配一个匿名账号，
     * 其 userName 形如 `1000_<32位十六进制>`。这种账号：
     *   - 不是用户登录的账号（没有昵称、没有真实歌单）
     *   - 但 account 字段是完整的，容易被误判成「已登录」
     * 所以必须单独识别出来，否则说明里会显示一个假的「已登录」。
     */
    if (isPlaceholder) {
      accountCache = false;
      markLoginVerified(false);
      lastAccountCheck = "anonymous-device";
      if (previousLoginState !== loginVerified) {
        dailyCache = null;
      }
      return;
    }
    accountCache = {
      // 真正的 UID 是 profile.userId；account.id 通常也一致，作为兜底
      userId: prof.userId || acc.id || acc.userId || prof.id || "",
      nickname: isPlaceholder ? "" : rawNick,
      avatarUrl: prof.avatarUrl || acc.avatarUrl || "",
    };
    // 服务端确认登录成功 → 解除「已失效」降级
    userCookieExpired = false;
    markLoginVerified(true);
    lastAccountCheck = "ok";
    accountRiskBlocked = false;
  } else {
    markLoginVerified(false);
    // 200 但没有 account：服务端明确表示「这个 Cookie 不是登录态」
    lastAccountCheck = "not-logged-in";
  }
  // 登录状态发生变化 → 之前缓存的每日推荐不再可信，必须作废
  if (previousLoginState !== loginVerified) {
    dailyCache = null;
  }
}

let autoCleanupState = null;

/**
 * 启动自动清理：账号读不到时，退出设备残留会话再重新核验一次。
 *
 * 背景：手机上 MusicFree 的原生网络层会残留「设备匿名会话」，
 * 导致用户 Cookie 的 MUSIC_U 被无视（表现：账号变成设备匿名号，重启后复发）。
 * 这里用 /weapi/logout **不带用户 Cookie** 请求退出（buildCookie(true) 是匿名形态，
 * 不会把用户的 MUSIC_U 发出去，所以不会误退用户的账号），然后重新核验。
 */
async function tryAutoCleanup() {
  if (autoCleanupState) {
    return autoCleanupState;
  }
  let note = "";
  try {
    await weapiRequest("/weapi/logout", {}, { anonymous: true, requireLogin: false });
    note = "已请求退出设备残留会话";
  } catch (e) {
    note = "退出请求失败（" + ((e && e.message) || "未知") + "）";
  }
  await new Promise(function (resolve) {
    setTimeout(resolve, 1500);
  });
  // 强制重新核验
  accountCache = null;
  loginVerified = null;
  lastAccountCheck = null;
  try {
    const acc = await requestAccount();
    autoCleanupState = {
      note: note,
      accountId: acc && acc.userId ? String(acc.userId) : "",
      nickname: acc && acc.nickname ? acc.nickname : "",
    };
  } catch (e) {
    autoCleanupState = { note: note, accountId: "", nickname: "" };
  }
  return autoCleanupState;
}

/**
 * 检测「Cookie 请求头到底有没有被发出去」。
 *
 * 做法：往一个回显服务发一个带标记的 Cookie，看响应里有没有原样返回。
 * 安卓 RN 的网络层有已知行为会丢弃手写的 Cookie 头，
 * 一旦如此，无论 Cookie 多正确，服务端都把我们当匿名。
 */
async function probeCookieHeaderEcho() {
  const marker = "MFTEST" + Date.now();
  try {
    const r = await axios.get("https://httpbin.org/headers", {
      headers: {
        "user-agent": UA,
        Cookie: "MUSIC_U=" + marker,
        cookie: "MUSIC_U=" + marker,
      },
      timeout: 12000,
    });
    const text = JSON.stringify((r && r.data) || {});
    lastEchoResult = { marker: marker, echoed: text.indexOf(marker) >= 0, note: "" };
  } catch (e) {
    lastEchoResult = {
      marker: marker,
      echoed: false,
      note: (e && e.message) || "请求失败",
    };
  }
  return lastEchoResult;
}

/**
 * 全组合探测：把「Cookie 组合 × 通道」都试一遍，
 * 记录每条组合各自查到的账号 ID。
 *
 * 用途：当「同一份 Cookie，浏览器是一个账号、插件是另一个账号」时，
 * 用它就能看出是哪一种请求形态导致服务端认错人。
 */
async function runFullAccountProbe() {
  const results = [];
  const effective = getEffectiveLoginCookie();
  const userCookie = effective.cookie || "";
  if (!userCookie) {
    return [{ label: "（未填写 Cookie）", accountId: "", note: "无 Cookie" }];
  }

  const musicU = getCookieValue("MUSIC_U");
  const musicA = getCookieValue("MUSIC_A");
  const csrf = getCookieValue("__csrf");
  const minimalParts = [];
  if (musicU) minimalParts.push("MUSIC_U=" + musicU);
  if (musicA) minimalParts.push("MUSIC_A=" + musicA);
  if (csrf) minimalParts.push("__csrf=" + csrf);
  const minimal = minimalParts.join("; ");

  const variants = [
    ["base+完整", "os=pc; appver=3.1.17.204416; osver=Microsoft-Windows-10-Professional-build-19045-64bit; channel=netease; " + userCookie],
    ["仅完整", userCookie],
    ["仅登录字段", minimal],
  ];

  // ① 明文 GET，每种 Cookie 组合都试
  for (let i = 0; i < variants.length; i++) {
    const label = "GET /api + " + variants[i][0];
    try {
      const r = await axios.get(BASE_URL + "/api/nuser/account/get", {
        headers: {
          "user-agent": EAPI_UA,
          referer: BASE_URL + "/",
          origin: BASE_URL,
          accept: "*/*",
          Cookie: variants[i][1],
          cookie: variants[i][1],
        },
        timeout: 12000,
      });
      const d = (r && r.data) || {};
      const acc = d.account || {};
      results.push({
        label: label,
        accountId: acc.id === undefined ? "" : String(acc.id),
        nickname: (d.profile && d.profile.nickname) || "",
        code: d.code,
        note: d.code === 200 ? "" : "code=" + d.code,
      });
    } catch (e) {
      results.push({ label: label, accountId: "", note: "请求失败：" + (e.message || "") });
    }
  }

  // ② 明文 GET，换成浏览器 UA 再试一次「仅完整」
  try {
    const r = await axios.get(BASE_URL + "/api/nuser/account/get", {
      headers: {
        "user-agent": UA,
        referer: BASE_URL + "/",
        origin: BASE_URL,
        accept: "*/*",
        Cookie: userCookie,
        cookie: userCookie,
      },
      timeout: 12000,
    });
    const d = (r && r.data) || {};
    const acc = d.account || {};
    results.push({
      label: "GET /api + 仅完整（浏览器UA）",
      accountId: acc.id === undefined ? "" : String(acc.id),
      nickname: (d.profile && d.profile.nickname) || "",
      code: d.code,
    });
  } catch (e) {
    results.push({ label: "GET /api + 仅完整（浏览器UA）", accountId: "", note: "失败：" + (e.message || "") });
  }

  /**
   * ③ 对照组：发一个明显无效的 MUSIC_U。
   *
   * 判断标准：
   *   ・如果返回的账号 ID 和真 Cookie 一样 → 说明我们的 Cookie 头根本没被采用，
   *     服务端是按 IP/设备解析的（RN 的 cookie jar 覆盖了我们的头）
   *   ・如果返回「无账号」→ 说明 Cookie 头是被采用的，之前的结果就是服务端按 IP 认错人
   */
  try {
    const invalid = "MUSIC_U=INVALID_" + Date.now() + "_TESTONLY";
    const r = await axios.get(BASE_URL + "/api/nuser/account/get", {
      headers: {
        "user-agent": UA,
        referer: BASE_URL + "/",
        origin: BASE_URL,
        accept: "*/*",
        Cookie: invalid,
        cookie: invalid,
      },
      timeout: 12000,
    });
    const d = (r && r.data) || {};
    const acc = d.account || {};
    results.push({
      label: "对照组：无效 MUSIC_U",
      accountId: acc.id === undefined ? "" : String(acc.id),
      nickname: (d.profile && d.profile.nickname) || "",
      code: d.code,
    });
  } catch (e) {
    results.push({ label: "对照组：无效 MUSIC_U", accountId: "", note: "失败：" + (e.message || "") });
  }

  /**
   * ③-2 换域名：绕开 music.163.com 上的 cookie jar。
   *
   * 如果 cookie jar 覆盖了我们手写的 Cookie 头，换一个「jar 作用域不同」的域名
   * 就可能恢复正常。这也是最容易落地的修复方向。
   */
  const altHosts = [
    "https://interface.music.163.com",
    "https://interfacepc.music.163.com",
  ];
  for (let hi = 0; hi < altHosts.length; hi++) {
    const host = altHosts[hi];
    const lbl = "换域名 " + host.replace("https://", "");
    try {
      const r = await axios.get(host + "/api/nuser/account/get", {
        headers: {
          "user-agent": UA,
          referer: BASE_URL + "/",
          origin: BASE_URL,
          accept: "*/*",
          Cookie: userCookie,
          cookie: userCookie,
        },
        timeout: 12000,
      });
      const d = (r && r.data) || {};
      const acc = d.account || {};
      results.push({
        label: lbl,
        accountId: acc.id === undefined ? "" : String(acc.id),
        nickname: (d.profile && d.profile.nickname) || "",
        code: d.code,
        note: d.code === 200 ? "" : "code=" + d.code,
      });
    } catch (e) {
      results.push({ label: lbl, accountId: "", note: "失败：" + (e.message || "") });
    }
  }

  /**
   * ③-3 清理残留设备会话后再验。
   *
   * 手机上一旦注册过匿名设备（MUSIC_A），服务端就优先按「设备匿名账号」解析，
   * 用户 Cookie 里的 MUSIC_U 被无视。logout 可能让服务端清掉这份设备会话，
   * 之后 MUSIC_U 才有机会被采用。
   */
  try {
    let logoutNote = "";
    try {
      await weapiRequest(
        "/weapi/logout",
        {},
        { anonymous: true, requireLogin: false }
      );
      logoutNote = "已请求 /weapi/logout";
    } catch (e1) {
      try {
        await eapiRequest("/api/logout", {});
        logoutNote = "已请求 eapi /api/logout";
      } catch (e2) {
        logoutNote = "logout 失败";
      }
    }
    // 等 1.5 秒让服务端会话变更生效
    await new Promise(function (resolve) {
      setTimeout(resolve, 1500);
    });
    const r = await axios.get(BASE_URL + "/api/nuser/account/get", {
      headers: {
        "user-agent": UA,
        referer: BASE_URL + "/",
        origin: BASE_URL,
        accept: "*/*",
        Cookie: userCookie,
        cookie: userCookie,
      },
      timeout: 12000,
    });
    const d = (r && r.data) || {};
    const acc = d.account || {};
    results.push({
      label: "清理残留会话后 + 真实 Cookie",
      accountId: acc.id === undefined ? "" : String(acc.id),
      nickname: (d.profile && d.profile.nickname) || "",
      code: d.code,
      note: logoutNote,
    });
  } catch (e) {
    results.push({
      label: "清理残留会话后 + 真实 Cookie",
      accountId: "",
      note: "失败：" + (e.message || ""),
    });
  }

  // ④ weapi
  try {
    const r = await weapiRequest("/weapi/nuser/account/get", {}, {
      requireLogin: true,
      forceCookie: true,
    });
    results.push({
      label: "weapi（加密）",
      accountId: r && r.account && r.account.id !== undefined ? String(r.account.id) : "",
      nickname: (r && r.profile && r.profile.nickname) || "",
      code: r && r.code,
    });
  } catch (e) {
    results.push({ label: "weapi（加密）", accountId: "", note: "失败：" + (e.message || "") });
  }

  // ④ eapi
  try {
    const r = await eapiRequest("/api/nuser/account/get", {});
    const acc = (r && r.account) || {};
    results.push({
      label: "eapi（凭证在加密体）",
      accountId: acc.id === undefined ? "" : String(acc.id),
      nickname: (r && r.profile && r.profile.nickname) || "",
      code: r && r.code,
    });
  } catch (e) {
    results.push({ label: "eapi（凭证在加密体）", accountId: "", note: "失败：" + (e.message || "") });
  }

  return results;
}

/**
 * 用未加密的 `/api` 通道查账号。
 * 网易云对 weapi 的登录类接口做人机验证（-462），但这几个 /api 接口不受影响，
 * 因此可以在被风控时兜底拿到账号信息（昵称、uid），进而恢复「我的歌单」。
 */
/**
 * 明文 GET /api/ 请求（社区插件同款，不被 -462 风控）。
 * 自动带上用户 Cookie 与浏览器 UA / Referer。
 */
async function plainApiGet(path, extraHeaders) {
  const effective = getEffectiveLoginCookie();
  const cookie = effective.cookie || "";
  const headers = {
    "user-agent": UA,
    referer: BASE_URL + "/",
    origin: BASE_URL,
  };
  if (cookie) {
    // 用大写 Cookie：部分 RN 网络层对 header 名大小写敏感，小写可能被丢掉
    headers.Cookie = cookie;
    headers.cookie = cookie;
  }
  if (extraHeaders) {
    for (const k in extraHeaders) {
      headers[k] = extraHeaders[k];
    }
  }
  // 若换域名方案已生效，后续明文请求都走该域名
  const base = preferredPlainHost || BASE_URL;
  const response = await axios.get(base + path, {
    headers: headers,
    timeout: 12000,
  });
  return (response && response.data) || {};
}

/** 是否已经提示过「MusicFree 手机端 Cookie 覆盖」这个平台缺陷 */
let platformCookieWarned = false;

/**
 * 判断当前环境是不是「插件设置的 Cookie 会被原生存储覆盖」的 MusicFree 手机端。
 *
 * 已知缺陷（官方 issue #670 / #655）：
 *   src/core/pluginManager/plugin.ts 里 packages 白名单中的
 *   `"@react-native-cookies/cookies"` 被替换成了 deprecatedCookieManager，
 *   其 get/set/flush 全是 notImplementedFunction —— 插件**无法清理原生 Cookie 存储**。
 *   而 RN 的网络层在原生 Cookie 存储非空时，会用存储里的 Cookie 覆盖插件显式设置的
 *   Cookie 头。于是：首次请求还能透传 → 服务端返回 Set-Cookie 被存进原生存储 →
 *   之后所有请求的 Cookie 头都被换掉 → 依赖 Cookie 鉴权的插件全部失效。
 *
 * 判断方法：请求一个会回显请求头的服务，看我们发的 Cookie 是否被原样收到。
 * （httpbin.org 是第三方域名，不会污染网易云的 Cookie 存储。）
 */
async function detectPlatformCookieOverride() {
  const marker = "MFPROBE" + Date.now();
  let echoed = false;
  try {
    const r = await axios.get("https://httpbin.org/headers", {
      headers: { "user-agent": UA, Cookie: "MUSIC_U=" + marker, cookie: "MUSIC_U=" + marker },
      timeout: 12000,
    });
    echoed = JSON.stringify((r && r.data) || {}).indexOf(marker) >= 0;
  } catch (e) {
    return null;
  }
  // 第一次是通的（原生存储为空），所以这里只能记录「通」，
  // 真正的判定靠调用方结合「有 Cookie 但查不到账号」来下结论。
  if (echoed) {
    platformCookieWarned = true;
  }
  return echoed;
}

async function requestAccountViaApi() {
  const effective = getEffectiveLoginCookie();
  const userCookie = effective.cookie || "";
  const musicU = getCookieValue("MUSIC_U");
  const musicA = getCookieValue("MUSIC_A");
  const csrf = getCookieValue("__csrf");

  // 只保留登录必需的字段，构造一份「最小 Cookie」
  const minimalParts = [];
  if (musicU) {
    minimalParts.push("MUSIC_U=" + musicU);
  }
  if (musicA) {
    minimalParts.push("MUSIC_A=" + musicA);
  }
  if (csrf) {
    minimalParts.push("__csrf=" + csrf);
  }
  const minimal = minimalParts.join("; ");

  /**
   * 依次尝试几种 Cookie 组合。
   *
   * 为什么要这样：网易云对 Cookie 的处理跟「客户端标识」有关，
   * 某些组合下（比如带上 os=pc / appver 前缀）可能被当成旧客户端而忽略 MUSIC_U。
   *
   * ⚠️ 顺序很重要：**最接近浏览器的组合放第一位**。
   * 「仅完整」= 只发用户粘贴的原样 Cookie（浏览器就是这么发的）；
   * 带 `os=pc; appver=...` 前缀反而可能让服务端按「PC 设备会话」识别，
   * 返回设备账号而不是 MUSIC_U 对应的账号。
   */
  const variants = [
    ["仅完整（与浏览器一致）", userCookie],
    ["仅登录字段", minimal],
    ["base+完整", "os=pc; appver=3.1.17.204416; osver=Microsoft-Windows-10-Professional-build-19045-64bit; channel=netease; " + userCookie],
  ];

  let lastError = null;
  /** 是否至少有一次请求成功返回（返回「无账号」也算成功，说明接口可判定） */
  let sawResponse = false;
  let lastHttpStatus = 0;
  let lastBodyCode = null;

  for (let i = 0; i < variants.length; i++) {
    const label = variants[i][0];
    const cookieHeader = variants[i][1];
    if (!cookieHeader) {
      continue;
    }
    try {
      const response = await axios.get(BASE_URL + "/api/nuser/account/get", {
        headers: {
          /**
           * 用浏览器 UA：你的浏览器就是用它拿到正确账号的。
           * （参考项目对 /api 用 App UA，但那适用于服务器环境；
           *   本插件要尽量贴近「浏览器同一个请求」，才不会被识别成别的客户端。）
           */
          "user-agent": UA,
          referer: BASE_URL + "/",
          origin: BASE_URL,
          accept: "*/*",
          "accept-language": "zh-CN,zh;q=0.9",
          // 大小写都带上，兼容对 header 名敏感的 RN 网络层
          Cookie: cookieHeader,
          cookie: cookieHeader,
        },
        timeout: 12000,
      });
      const result = response.data || {};
      const httpStatus = (response && response.status) || 0;
      const bodyCode = result && result.code;

      if (result.account) {
        applyAccountResult(result, "ok");
        // 记下哪种组合能用，之后所有请求都沿用（包括每日推荐、我的歌单）
        cookieMode = i;
        if (sendDebug) {
          sendDebug.cookieVariant = label;
        }
        return {
          definitive: true,
          account: accountCache || null,
          httpStatus: httpStatus,
          bodyCode: bodyCode,
        };
      }
      // 这一种组合没账号，继续试下一种
      sawResponse = true;
      lastHttpStatus = httpStatus;
      lastBodyCode = bodyCode;
    } catch (error) {
      lastError =
        ((error && error.message) || "未知") +
        (error && error.response && error.response.status
          ? "（HTTP " + error.response.status + "）"
          : "");
    }
  }

  // 只要有一次成功响应且都没账号 → 可以确定「未登录」
  if (sawResponse) {
    return {
      definitive: true,
      account: null,
      httpStatus: lastHttpStatus,
      bodyCode: lastBodyCode,
    };
  }
  return { definitive: false, account: null, errorMessage: lastError || "全部尝试失败" };
}

/**
 * 换移动端 UA 再试一次账号接口。
 * 浏览器 UA 可能被网易云按「UA + IP」维度限流（表现为明明有 Cookie 却一直无账号），
 * 移动端 UA 走的是另一套计数，往往不受影响。
 */
async function requestAccountViaApiMobile() {
  const effective = getEffectiveLoginCookie();
  const userCookie = effective.cookie || "";
  if (!userCookie) {
    return { definitive: false, account: null, errorMessage: "无 Cookie" };
  }
  const response = await axios.get(BASE_URL + "/api/nuser/account/get", {
    headers: {
      "user-agent": UA_MOBILE,
      referer: BASE_URL + "/",
      origin: BASE_URL,
      accept: "*/*",
      "accept-language": "zh-CN,zh;q=0.9",
      Cookie: userCookie,
      cookie: userCookie,
    },
    timeout: 12000,
  });
  const result = response.data || {};
  if (result.account) {
    applyAccountResult(result, "ok");
    if (sendDebug) {
      sendDebug.cookieVariant = "仅完整（移动端UA）";
    }
    return {
      definitive: true,
      account: accountCache || null,
      httpStatus: (response && response.status) || 0,
      bodyCode: result.code,
    };
  }
  return {
    definitive: true,
    account: null,
    httpStatus: (response && response.status) || 0,
    bodyCode: result.code,
  };
}

/**
 * 换域名再试一次账号接口（最后一张牌）。
 *
 * 手机上 MusicFree 的原生网络层可能挂着 music.163.com 的设备残留会话，
 * 覆盖我们手写的 Cookie。interface.music.163.com 是另一个主机名，
 * 若残留会话是「仅限 music.163.com」作用域，换这个域名就能绕过去。
 */
let preferredPlainHost = "";

async function requestAccountViaApiAltHost() {
  const effective = getEffectiveLoginCookie();
  const userCookie = effective.cookie || "";
  if (!userCookie) {
    return { definitive: false, account: null, errorMessage: "无 Cookie" };
  }
  const host = "https://interface.music.163.com";
  const response = await axios.get(host + "/api/nuser/account/get", {
    headers: {
      "user-agent": UA,
      referer: BASE_URL + "/",
      origin: BASE_URL,
      accept: "*/*",
      "accept-language": "zh-CN,zh;q=0.9",
      Cookie: userCookie,
      cookie: userCookie,
    },
    timeout: 12000,
  });
  const result = response.data || {};
  if (result.account) {
    applyAccountResult(result, "ok");
    // 之后所有明文请求都走这个域名，绕开残留会话
    preferredPlainHost = host;
    if (sendDebug) {
      sendDebug.cookieVariant = "仅完整（换域名 interface.music.163.com）";
    }
    return {
      definitive: true,
      account: accountCache || null,
      httpStatus: (response && response.status) || 0,
      bodyCode: result.code,
    };
  }
  return {
    definitive: true,
    account: null,
    httpStatus: (response && response.status) || 0,
    bodyCode: result.code,
  };
}

/** account/get 是否被风控拦住（此时无法判断登录态，但 Cookie 可能仍然有效） */
let accountRiskBlocked = false;

/** 最近一次登录态核验的结果，用于给用户可读的诊断 */
let lastAccountCheck = null;

/** 最近一次请求账号接口时「实际发出的 Cookie」诊断信息 */
let sendDebug = null;

/**
 * 记录实际发送的 Cookie 头，便于把「解析对不对」和「发得对不对」分开看。
 * 只保留长度与首尾片段，避免把完整凭证暴露在界面上。
 */
function recordSendDebug() {
  try {
    const base = "os=pc; appver=3.1.17.204416; osver=Microsoft-Windows-10-Professional-build-19045-64bit; channel=netease;";
    const effective = getEffectiveLoginCookie();
    const header = effective.cookie ? base + " " + effective.cookie : base;
    const mu = getCookieValue("MUSIC_U") || getCookieValue("MUSIC_A");
    const nmtid = getCookieValue("NMTID");
    const fields = effective.cookie ? effective.cookie.split("; ").filter(Boolean) : [];
    sendDebug = {
      headerLength: header.length,
      fieldCount: fields.length,
      hasMusicU: !!mu,
      musicULength: mu.length,
      musicUHead: mu.slice(0, 16),
      musicUTail: mu.slice(-8),
      /** 完整值，供用户和浏览器逐字对比 */
      musicUFull: mu,
      nmtidLength: nmtid.length,
      nmtidHead: nmtid.slice(0, 6),
      degraded: userCookieExpired,
      source: effective.source,
      /** 各通道的核验结果，便于精确定位问题 */
      channelApi: null,
      channelWeapi: null,
    };
  } catch (error) {
    sendDebug = null;
  }
}

/**
 * 诊断「粘贴的 Cookie 到底哪里有问题」。
 *
 * 常见坑（按出现频率）：
 *   1. 只复制了一半（MUSIC_U 很长，容易被输入框/剪贴板截断）
 *   2. 根本没登录就复制（只有 NMTID 这类匿名 cookie）
 *   3. Cookie 已过期 / 在别处退出登录
 */
function describeCookieDiagnostics() {
  const raw = getRawCookieInput();
  if (!raw) {
    return null;
  }
  const lines = [];

  // 先按容错规则解析（兼容 DevTools 表格、多行、空格分隔等格式）
  const parsed = normalizeCookie(raw);
  const fields = parsed ? parsed.split("; ").filter(Boolean) : [];
  const hasMusicU = /MUSIC_[UA]=/i.test(parsed);
  const hasCsrf = /__csrf=/i.test(parsed);
  const musicU = getCookieValue("MUSIC_U") || getCookieValue("MUSIC_A");

  lines.push("### 🔍 Cookie 自检");
  lines.push("");
  lines.push("- 粘贴内容长度：**" + raw.length + "** 字符");
  lines.push(
    "- 成功解析出 **" +
      fields.length +
      "** 个字段" +
      (fields.length ? "：" + fields.map(function (f) { return f.split("=")[0]; }).join(", ") : "")
  );
  lines.push(
    "- 登录凭证（MUSIC_U / MUSIC_A）：" + (hasMusicU ? "✅ 有，长度 " + musicU.length : "❌ **没有**")
  );
  lines.push("- __csrf：" + (hasCsrf ? "✅ 有" : "⚠️ 没有（部分接口需要）"));
  // 粘贴原文的首尾，用来确认「粘进来的到底是不是我以为的那段文本」
  lines.push(
    "- 粘贴内容首尾：`" +
      raw.slice(0, 40).replace(/[\r\n\t]/g, "⏎") +
      "` … `" +
      raw.slice(-40).replace(/[\r\n\t]/g, "⏎") +
      "`"
  );

  /**
   * 混合导出检测。
   * `.163.com` 域专属 Cookie（iuqxldmzr / JSESSIONID-WYYY / WM_NI 等）
   * 一旦出现在粘贴内容里，说明导出的是「全域名合并」那一份。
   * 这种情况下 MUSIC_U 可能是 `.163.com`（网易邮箱账号）的，而不是 `music.163.com` 的。
   */
  const MIXED_MARKERS = ["iuqxldmzr", "JSESSIONID-WYYY", "WM_NI=", "WM_NIKE="];
  const mixedHits = MIXED_MARKERS.filter(function (m) {
    return raw.indexOf(m) >= 0;
  });
  if (mixedHits.length) {
    lines.push("");
    lines.push(
      "> 🚨 **检测到「全域名合并导出」**（含 `" +
        mixedHits.join("`、`") +
        "` 这些 `.163.com` 专属字段）。"
    );
    lines.push(
      "> 这类导出里 `MUSIC_U` 可能属于 **`.163.com`（网易邮箱账号）**，而不是 `music.163.com` 的账号。"
    );
    lines.push(
      "> **请只导出 `music.163.com` 这个域下的 Cookie**（或只手动拼 `MUSIC_U=…; __csrf=…` 两项）。"
    );
  }

  /**
   * 同名重复检测。
   * DevTools 里 `.163.com` 和 `music.163.com` 两个域分组各有一份同名 Cookie，
   * 全选复制时会一起带进来。登录凭证重复 = 可能用错了账号的那一份。
   */
  if (lastCookieParseInfo && lastCookieParseInfo.musicUDupCount > 1) {
    if (lastCookieParseInfo.musicUAmbiguous) {
      lines.push(
        "- 🚨 **MUSIC_U 出现了 " +
          lastCookieParseInfo.musicUDupCount +
          " 次，且没有域名信息，无法判断哪一份是你的账号！**"
      );
      lines.push(
        "  → 请**只粘贴 `music.163.com` 分组里的 `MUSIC_U` 和 `__csrf` 两个字段**，格式：" +
          " `MUSIC_U=完整值; __csrf=完整值`"
      );
    } else {
      lines.push(
        "- ✅ MUSIC_U 出现 " +
          lastCookieParseInfo.musicUDupCount +
          " 次，已按域名选中 **`music.163.com`** 那一份。"
      );
    }
  }
  if (lastCookieParseInfo && lastCookieParseInfo.duplicateNames.length) {
    lines.push(
      "- 同名重复字段：" + lastCookieParseInfo.duplicateNames.join("、")
    );
  }

  /**
   * 把完整的 MUSIC_U 打出来，供用户和浏览器逐字对比。
   * 扫码凭证已经自动保存到用户变量时不再显示完整值，避免整段登录凭证
   * 长时间停留在说明页；需要备份时去「用户变量」里复制。
   */
  if (sendDebug && sendDebug.musicUFull && !qrLoginPersisted) {
    lines.push("");
    lines.push("**插件手里这份 MUSIC_U 的完整值**（请和浏览器逐字对比）：");
    lines.push("");
    lines.push("```");
    lines.push(sendDebug.musicUFull);
    lines.push("```");
    lines.push("");
    lines.push(
      "对比方法：浏览器 F12 → Application → Cookies → `music.163.com` → `MUSIC_U` → 双击值 → Ctrl+A/Ctrl+C → " +
        "粘到记事本里，和上面这段并排看。**只要有一个字符不同，就是两份不同的凭证**。"
    );
    lines.push("");
    lines.push(
      "> ⚠️ 上面若显示的是 `1000_<32位十六进制>` 这种**设备匿名账号**，说明这份 MUSIC_U 服务端不认（已失效或复制损坏）。"
    );
  } else if (sendDebug && sendDebug.musicUFull && qrLoginPersisted) {
    lines.push("");
    lines.push(
      "**扫码凭证已自动保存到「用户变量 → 网易云 Cookie」**：MUSIC_U 长度 " +
        sendDebug.musicULength +
        "，`" +
        sendDebug.musicUHead +
        "…" +
        sendDebug.musicUTail +
        "`。说明页不再显示完整值。"
    );
  }

  // 把「实际发出去的 Cookie」也列出来，便于区分解析问题还是发送问题
  if (sendDebug) {
    lines.push("");
    lines.push("**实际发出的请求**");
    lines.push("");
    lines.push("- Cookie 头长度：**" + sendDebug.headerLength + "** 字符");
    lines.push("- 携带字段数：**" + sendDebug.fieldCount + "**");
    if (sendDebug.hasMusicU) {
      lines.push(
        "- MUSIC_U：长度 " +
          sendDebug.musicULength +
          "，`" +
          sendDebug.musicUHead +
          "…" +
          sendDebug.musicUTail +
          "`"
      );
    } else {
      lines.push("- MUSIC_U：❌ 未带上");
    }
    if (sendDebug.degraded) {
      lines.push("");
      lines.push(
        "⚠️ **注意：当前处于「匿名降级」状态** —— 插件认为 Cookie 已失效，" +
          "所以请求里根本没有带你的 Cookie。重新粘贴一次 Cookie 即可解除。"
      );
    }
    lines.push("");
    lines.push("> 可以把 MUSIC_U 的首尾片段和浏览器里看到的对比，确认是否被截断或改坏。");

    // 两个通道各自的核验结果
    if (sendDebug.channelApi || sendDebug.channelWeapi) {
      lines.push("");
      lines.push("**各通道核验结果**");
      lines.push("");
      lines.push("同一份 Cookie，三条通道各自查到的账号 ID：");
      lines.push("");
      lines.push(
        "- `GET /api/nuser/account/get`（未加密）：**" +
          (sendDebug.channelApi || "未查询") +
          "**" +
          (sendDebug.channelApiAccountId
            ? " · 账号 ID `" + sendDebug.channelApiAccountId + "`"
            : "")
      );
      lines.push(
        "- `POST /weapi/nuser/account/get`（加密）：**" +
          (sendDebug.channelWeapi || "未查询") +
          "**" +
          (sendDebug.channelWeapiAccountId
            ? " · 账号 ID `" + sendDebug.channelWeapiAccountId + "`"
            : "")
      );
      if (sendDebug.channelEapi) {
        lines.push(
          "- `eapi`（凭证放在加密体内部，无关 Cookie 头）：**" +
            sendDebug.channelEapi +
            "**" +
            (sendDebug.channelEapiAccountId
              ? " · 账号 ID `" + sendDebug.channelEapiAccountId + "`"
              : "")
        );
        // 昵称来源排查：把 eapi 返回的原始字段列出来
        if (sendDebug.accountKeys) {
          lines.push("  - 顶层字段：" + (sendDebug.topKeys || "(无)"));
          lines.push("  - account 字段：" + sendDebug.accountKeys);
          lines.push(
            "  - account.id：" +
              (sendDebug.accountId || "(空)") +
              " · account.userId：" +
              (sendDebug.accountUserId || "(空)")
          );
          lines.push(
            "  - 带 profile：" +
              (sendDebug.hasEapiProfile ? "是" : "否") +
              (sendDebug.profileNickname
                ? "（昵称：" + sendDebug.profileNickname + "，userId：" + (sendDebug.profileUserId || "?") + "）"
                : sendDebug.profileKeys
                ? "（profile 字段：" + sendDebug.profileKeys + "）"
                : "")
          );
          if (sendDebug.accountUserName) {
            lines.push("  - account.userName：" + sendDebug.accountUserName);
          }
          if (sendDebug.accountPhone) {
            lines.push("  - account.phone（确认是不是你的号）：" + sendDebug.accountPhone);
          }
          if (sendDebug.accountNickname) {
            lines.push("  - account.nickname：" + sendDebug.accountNickname);
          }
          if (sendDebug.profileSource) {
            lines.push("  - 昵称补全来源：" + sendDebug.profileSource);
          }
        }
      }
      if (preferEapi) {
        lines.push("");
        lines.push(
          "> ✅ 已确认当前环境**只有 eapi 能带上登录态**（Cookie 请求头没被发送），" +
            "后续请求已自动走 eapi。"
        );
      }

      /**
       * 匿名设备账号检测。
       * 服务端在不接受 MUSIC_U 时，会回退成「设备匿名账号」，
       * 其特征是 userName 形如 `1000_<32位十六进制>`。
       */
      const looksAnonymous = /^\d{3,}_[0-9A-Fa-f]{16,}$/.test(
        String(sendDebug.accountUserName || "")
      );
      if (looksAnonymous) {
        lines.push("");
        lines.push(
          "> 🚨 **当前查到的是一个「设备匿名账号」**（userName 形如 `1000_<32位十六进制>`），" +
            "不是你登录的账号。说明**这份 MUSIC_U 没有被服务端接受**（已失效，或复制时损坏）。" +
            "每日推荐/我的歌单都会是错的。请重新登录后复制一份新的 Cookie。"
        );
      }

      // 全组合探测结果：6 种请求形态各自查到的账号
      if (lastProbeResults && lastProbeResults.length) {
        lines.push("");
        lines.push("**全组合探测（各请求形态查到的账号）**");
        lines.push("");
        for (let i = 0; i < lastProbeResults.length; i++) {
          const p = lastProbeResults[i];
          lines.push(
            "- " +
              p.label +
              " → " +
              (p.accountId ? "`" + p.accountId + "`" : "无账号") +
              (p.nickname ? "（" + p.nickname + "）" : "") +
              (p.note ? " · " + p.note : "")
          );
        }
        lines.push("");
        /**
         * 关键判定：如果「无效 MUSIC_U」对照组返回的账号和真 Cookie 一样，
         * 说明服务端压根没采用我们发的 Cookie，而是按设备/IP 给了个匿名账号。
         */
        const ctrl = null;
        let ctrlRow = null;
        let realRow = null;
        for (let i = 0; i < lastProbeResults.length; i++) {
          const p = lastProbeResults[i];
          if (p.label.indexOf("对照组") >= 0) ctrlRow = p;
          if (p.label.indexOf("仅完整（浏览器UA）") >= 0) realRow = p;
        }
        if (ctrlRow && realRow && ctrlRow.accountId && ctrlRow.accountId === realRow.accountId) {
          lines.push(
            "> 🚨 **判定结果：服务端没有采用我们发的 Cookie。**" +
              "发一个无效的 `MUSIC_U` 也返回同一个账号 `" +
              ctrlRow.accountId +
              "`，说明这个账号是**设备维度的匿名账号**（手机网络层残留的匿名会话），和你的 Cookie 无关。"
          );
          lines.push(
            "> 换 Cookie、换请求头、换域名都不会有用——**残留会话在 MusicFree 的原生 Cookie 存储里**。"
          );
          lines.push("");
          lines.push("**解决办法（推荐按顺序）：**");
          lines.push("");
          lines.push(
            "1. **清除 MusicFree 应用数据**：系统设置 → 应用 → MusicFree → 存储 → 清除数据"
          );
          lines.push(
            "2. 重新安装本插件（v0.5.2 起不会再主动注册匿名设备）"
          );
          lines.push(
            "3. 粘贴你的 Cookie → 保存 → 打开本页"
          );
          lines.push(
            "4. 若仍不行：**卸载 MusicFree 重装**（本地数据/歌单先导出备份）"
          );
        } else {
          lines.push(
            "👉 如果上面出现**多个不同的账号 ID**，说明是请求形态导致服务端认错人；" +
              "如果全是同一个 ID，且对照组也是同一个，说明 Cookie 没被采用。"
          );
        }
      }

      // Cookie 请求头回显检测
      if (lastEchoResult) {
        lines.push("");
        lines.push("**Cookie 请求头是否真的发出去了**");
        lines.push("");
        if (lastEchoResult.echoed) {
          lines.push(
            "- ✅ 回显服务收到了我们发的 `Cookie` 请求头（标记 `" +
              lastEchoResult.marker +
              "`）→ 网络层没丢掉它"
          );
        } else {
          lines.push(
            "- 🚨 回显服务**没有**收到 `Cookie` 请求头（标记 `" +
              lastEchoResult.marker +
              "` 未返回）" +
              (lastEchoResult.note ? " · " + lastEchoResult.note : "")
          );
          lines.push(
            "  → 这就是根因：当前环境把 Cookie 头丢掉了，服务端只能把我们当匿名设备。"
          );
          lines.push(
            "  → 这种情况下无论 Cookie 多正确都没用，只能走「凭证放加密体内部」的 eapi 通道。"
          );
        }
      }

      lines.push("");
      const apiSaysNo =
        !!sendDebug.channelApi && sendDebug.channelApi.indexOf("无账号") === 0;
      const weapiSaysNo =
        !!sendDebug.channelWeapi && sendDebug.channelWeapi.indexOf("无账号") >= 0;
      const eapiSaysYes =
        !!sendDebug.channelEapi && sendDebug.channelEapi.indexOf("有账号") >= 0;
      // eapi 是权威通道（凭证在加密体内部）：它说有账号就不算未登录
      if (apiSaysNo && weapiSaysNo && !eapiSaysYes) {
        lines.push("两个通道都说没有账号。");

        // 常见原因一：超大 Cookie 在输入框/存储里被截断
        if (raw.length > 1200) {
          lines.push("");
          lines.push(
            "⚠️ **你粘贴的 Cookie 有 " +
              raw.length +
              " 字符，比较长。** 可能被输入框或存储截断了，" +
              "导致 `MUSIC_U` 只剩半截——这样服务器就会当成未登录。"
          );
          lines.push("");
          lines.push(
            "**建议试一次「精简 Cookie」**：只需要两个字段，长度约 900 字符，几乎不可能被截断："
          );
          lines.push("");
          lines.push("```");
          lines.push("MUSIC_U=完整值; __csrf=完整值");
          lines.push("```");
          lines.push("");
          lines.push(
            "可以用附带的 `cookie-parser.html` 生成——粘贴原始内容后它会直接给出这一行。"
          );
        }

        // 常见原因二：API 凭证可能是 MUSIC_A
        if (!getCookieValue("MUSIC_A")) {
          lines.push("");
          lines.push(
            "⚠️ **你的 Cookie 里只有 `MUSIC_U`，没有 `MUSIC_A`。**" +
              "部分账号的接口凭证是 `MUSIC_A`。"
          );
          lines.push("");
          lines.push(
            "请回到 F12 → Application → Cookies，**逐项检查有没有 `MUSIC_A`**" +
              "（注意可能有 `.163.com` 和 `music.163.com` 两个域名分组，都要看）。有的话一起复制过来。"
          );
        }

        lines.push("");
        lines.push(
          "另外，`/api/nuser/account/get` 的 GET 版本可能已对所有人返回 null，" +
            "所以更可靠的验证是在浏览器打开下面这个地址："
        );
        lines.push("");
        lines.push("`https://music.163.com/api/discovery/recommend/songs`");
        lines.push("");
        lines.push(
          "如果能返回带歌曲的 JSON（而不是 301 / 未登录），说明 Cookie 对接口有效，那就是插件的问题；" +
            "如果同样提示未登录，说明这份 Cookie 确实不能用于接口。"
        );
        lines.push("");
        lines.push("---");
        lines.push("");
        lines.push("### 最可能的原因：网页上的「已登录」是缓存的");
        lines.push("");
        lines.push(
          "网易云网页会把头像昵称缓存在浏览器里。**Cookie 早已失效时，页面看上去仍是登录状态**，" +
            "但所有接口都返回未登录 —— 这和你的现象完全一致。"
        );
        lines.push("");
        lines.push("请按这个顺序重来一次：");
        lines.push("");
        lines.push("1. 网页右上角点头像 → **退出登录**（一定要真的退出）");
        lines.push("2. `Ctrl + F5` 强制刷新，确认页面显示「登录」");
        lines.push("3. 重新扫码或输密码登录");
        lines.push("4. 登录完成后 **立刻** 打开 `https://music.163.com/api/nuser/account/get`");
        lines.push("   - 返回里有 `\"account\":{...}` → 这份 Cookie 可用，马上去复制");
        lines.push("   - 仍是 `\"account\":null` → 说明该接口已废弃，改用上面的 recommend 地址验证");
        lines.push("5. 复制 Cookie → 粘进插件 → 用 `test` 验证");
      }
    }
  }

  // 解析出 0 个字段：几乎都是粘贴格式问题
  if (!fields.length) {
    lines.push("");
    lines.push("**问题定位**：这段内容里解析不出任何 Cookie 字段。");
    lines.push("");
    lines.push(
      "常见原因是粘贴格式不对——比如直接从「网络」面板复制了请求头，或者复制成了表格。"
    );
    lines.push("");
    lines.push(
      "请用这个格式（分号分隔）：`MUSIC_U=xxx; __csrf=yyy`，" +
        "或在 DevTools 的 Application → Cookies 里**全选复制整张表格**（插件也支持表格格式）。"
    );
    return lines.join("\n");
  }

  if (!hasMusicU) {
    lines.push("");
    lines.push("**问题定位**：粘贴的内容里没有 `MUSIC_U`。");
    lines.push("");
    lines.push(
      "说明复制的那个浏览器状态**没有真正登录**，或者复制时被截断了。" +
        "请在已登录的浏览器里按 F12 → Application → Cookies → 全选复制。"
    );
    return lines.join("\n");
  }

  if (musicU.length < 200) {
    lines.push("");
    lines.push(
      "**问题定位**：`MUSIC_U` 只有 " + musicU.length + " 个字符，明显被截断了。"
    );
    lines.push("");
    lines.push("正常的 `MUSIC_U` 通常有 **800 个字符左右**，请粘贴完整值。");
    return lines.join("\n");
  }

  lines.push("");
  if (accountRiskBlocked) {
    lines.push("**服务器返回**：`-462` 风控，无法核验登录态（不代表 Cookie 无效）。");
  } else if (lastAccountCheck === "not-logged-in") {
    lines.push("**服务器返回**：HTTP 200 但没有账号信息 = **Cookie 已失效**。");
    lines.push("");
    lines.push(
      "`MUSIC_U` 格式看起来正常（" +
        musicU.length +
        " 字符），但网易云不认它。可能原因：在别处退过登录、改过密码，或复制的是个已失效的旧会话。"
    );
    lines.push("");
    lines.push("建议：在浏览器重新登录一次，再复制新的 Cookie。");
  } else {
    lines.push("**服务器返回**：尚未核验。");
  }

  return lines.join("\n");
}

/**
 * 登录态核验结果缓存：
 *   null  = 还没核验过
 *   true  = 服务端确认已登录
 *   false = 服务端确认未登录
 */
let loginVerified = null;

function markLoginVerified(value) {
  loginVerified = value;
}

/**
 * 是否需要走「账号专属」的接口（如 v1 每日推荐）。
 * 优先用服务端核验结果；还没核验过就先核验一次。
 */
/**
 * 是否应该走「需要账号的接口」（如 v1 每日推荐）。
 *
 * ⚠️ 这里**不能**用 account/get 的结果做门禁：
 * 网易云对 account/get 这类接口有人机验证风控（-462），
 * 一旦被拦，会误判成「未登录」，于是每日推荐退回公共数据——
 * 表现就是「明明填了 Cookie，推荐还是公共的」。
 *
 * 正确做法：只要用户提供了 Cookie，就乐观地直接试账号接口；
 * 失败自然会退回公共接口（见 requestDailySongs 的 catch）。
 */
async function shouldUseAccountApi() {
  return hasAnyCookie();
}

//#endregion

//#region 搜索

async function searchMusic(query, page) {
  const offset = (page - 1) * SEARCH_PAGE_SIZE;

  /**
   * 搜索优先走 weapi（信息最全：专辑/时长/封面都有）。
   *
   * ⚠️ 但不能只有这一条路：
   * 游客模式下 weapi 常被 -462 风控整体拦住（实测连续失败），
   * 此时退回**明文 GET /api/search/get**（走另一套计数，通常还能用）。
   * 虽然明文字段少一些，但「能搜到」比「字段全」重要。
   */
  try {
    const result = await weapiRequest("/weapi/cloudsearch/pc", {
      s: query,
      type: 1,
      limit: SEARCH_PAGE_SIZE,
      offset: offset,
      total: true,
    });
    const data = (result.result && result.result.songs) || [];
    const total = (result.result && result.result.songCount) || 0;
    return {
      isEnd: offset + data.length >= total || !data.length,
      data: data.map(formatSearchMusicItem).filter(Boolean),
    };
  } catch (weapiError) {
    const msg = String((weapiError && weapiError.message) || "");
    // 只有「风控 / 网络」这类整体性失败才值得换通道；
    // 业务性错误（比如参数问题）换了也没用。
    const worthRetry =
      msg.indexOf("-462") >= 0 ||
      msg.indexOf("风控") >= 0 ||
      msg.indexOf("403") >= 0 ||
      msg.indexOf("429") >= 0;
    if (!worthRetry) {
      throw weapiError;
    }

    // 明文回退
    const plain = await plainApiGet(
      "/api/search/get?s=" +
        encodeURIComponent(query) +
        "&type=1&limit=" +
        SEARCH_PAGE_SIZE +
        "&offset=" +
        offset
    );
    if (plain && plain.code === 200 && plain.result) {
      const songs = plain.result.songs || [];
      const total = plain.result.songCount || 0;
      return {
        isEnd: offset + songs.length >= total || !songs.length,
        // 明文接口字段是 album/artists/duration 风格，用对应格式化函数
        data: songs
          .map(function (s) {
            return formatSearchMusicItem({
              id: s.id,
              name: s.name,
              artists: s.artists || s.ar || [],
              album: s.album || s.al || {},
              duration: s.duration ? s.duration / 1000 : s.dt ? s.dt / 1000 : 0,
              fee: s.fee,
            });
          })
          .filter(Boolean),
      };
    }
    // 明文也不通，把原始错误抛出去（带上风控说明）
    throw weapiError;
  }
}

async function searchAlbum(query, page) {
  const offset = (page - 1) * SEARCH_PAGE_SIZE;
  const result = await weapiRequest("/weapi/cloudsearch/pc", {
    s: query,
    type: 10,
    limit: SEARCH_PAGE_SIZE,
    offset: offset,
    total: true,
  });
  const data = (result.result && result.result.albums) || [];
  const total = (result.result && result.result.albumCount) || 0;
  return {
    isEnd: offset + data.length >= total || !data.length,
    data: data.map(formatAlbumItem),
  };
}

async function searchArtist(query, page) {
  const offset = (page - 1) * SEARCH_PAGE_SIZE;
  const result = await weapiRequest("/weapi/cloudsearch/pc", {
    s: query,
    type: 100,
    limit: SEARCH_PAGE_SIZE,
    offset: offset,
    total: true,
  });
  const data = (result.result && result.result.artists) || [];
  const total = (result.result && result.result.artistCount) || 0;
  return {
    isEnd: offset + data.length >= total || !data.length,
    data: data.map(formatArtistItem),
  };
}

async function searchSheet(query, page) {
  const offset = (page - 1) * SEARCH_PAGE_SIZE;
  const result = await weapiRequest("/weapi/cloudsearch/pc", {
    s: query,
    type: 1000,
    limit: SEARCH_PAGE_SIZE,
    offset: offset,
    total: true,
  });
  const data = (result.result && result.result.playlists) || [];
  const total = (result.result && result.result.playlistCount) || 0;
  return {
    isEnd: offset + data.length >= total || !data.length,
    data: data.map(formatSheetItem),
  };
}

//#endregion

//#region 播放 / 歌词 / 详情 / 评论

async function requestSongUrl(id, level) {
  const result = await requestWithFallback(
    "/weapi/song/enhance/player/url/v1",
    { ids: JSON.stringify([id]), level: level, encodeType: "flac" },
    "/api/song/enhance/player/url",
    { ids: "[" + JSON.stringify(id) + "]", br: 320000 }
  );
  return (result.data || [])[0] || null;
}

/**
 * 获取播放链接：
 *   1. 先走网易云官方音源（从请求档位开始逐级降级，只返回完整音源）；
 *   2. 网易云拿不到时（VIP/无版权/风控），按设置回退到 B 站音频。
 *
 * 性能考量：每条链路都可能有多级重试，手机上串行请求太多会让播放器等不及而跳歌。
 * 所以这里加了「熔断」——一旦确认是网络层/风控层的整体性失败（而不是某首歌没版权），
 * 就不再逐级重试，直接进入 B 站兜底。
 */
async function getMediaSource(musicItem, quality) {
  const targetLevel = QUALITY_LEVEL_MAP[quality] || "exhigh";
  const startIndex = Math.max(QUALITY_LEVEL_ORDER.indexOf(targetLevel), 0);

  let hasTrialOnly = false;
  let neteaseError = null;

  /**
   * 会员/付费歌曲的快速判定。
   *
   * 背景：账号非会员（vipType=0）时，fee=1（VIP）/fee=4（付费专辑）的歌
   * 从网易云必然拿不到音源，只能走 B 站回退 —— 这是插件的核心功能，必须保留。
   *
   * 但「逐级降档重试」对这类歌毫无意义（4 个档位必然全空，白等 ~800ms），
   * 所以付费歌只试最高档一次，迅速转入 B 站回退。
   */
  const fee = Number(musicItem && musicItem.fee);
  const isPaidOnly = fee === 1 || fee === 4;

  // 熔断中：网易云音源刚被确认整体不可用，直接走 B 站，省掉一次必然失败的请求
  if (!isNeteaseSourceBlocked()) {
    /**
     * 付费歌只试一次（不降级）；非付费歌保持原有逐级降级。
     */
    const levels = isPaidOnly
      ? [QUALITY_LEVEL_ORDER[Math.min(startIndex, QUALITY_LEVEL_ORDER.length - 1)]]
      : (function () {
          const arr = [];
          for (let i = startIndex; i >= 0; i--) {
            arr.push(QUALITY_LEVEL_ORDER[i]);
          }
          return arr;
        })();

    for (let i = 0; i < levels.length; i++) {
      try {
        const item = await requestSongUrl(musicItem.id, levels[i]);
        if (item && item.url) {
          if (item.freeTrialInfo && item.freeTrialInfo.end) {
            // 只是试听片段
            hasTrialOnly = true;
          } else {
            markNeteaseSourceSuccess();
            return {
              url: item.url,
              headers: {
                "User-Agent": UA,
                Referer: BASE_URL + "/",
              },
            };
          }
        }
      } catch (error) {
        neteaseError = error;
        markNeteaseSourceFailure(error);
        if (isGlobalFailure(error)) {
          break;
        }
      }
    }
  }

  // ---- 以下为网易云失败后的 B 站兜底（核心功能，VIP 歌靠它播放）----
  const settings = getPluginSettings();

  /**
   * 只有用户显式关掉 B 站回退（bilibiliFallback=0）时才跳过。
   * VIP 歌默认**照常走 B 站**——这是插件的主要价值。
   */
  if (settings.useBilibili) {
    try {
      return await getBiliMediaSource(musicItem, quality);
    } catch (biliError) {
      // B 站也失败，继续往下抛更具体的原因
      const neteaseReason = hasTrialOnly
        ? "网易云仅有试听片段"
        : neteaseError
        ? neteaseError.message
        : isPaidOnly
        ? "会员歌曲（当前账号非会员）"
        : "网易云无可用音源";
      throw createError(
        neteaseReason + "；B 站回退也失败：" + biliError.message
      );
    }
  }

  if (hasTrialOnly) {
    throw createError("该歌曲仅提供试听片段，请配置网易云 Cookie 或开启 B 站回退");
  }
  if (isPaidOnly) {
    throw createError(
      "《" +
        (musicItem.title || "该歌曲") +
        "》是会员/付费歌曲，当前账号非会员；且已关闭 B 站回退（bilibiliFallback=0）"
    );
  }
  if (neteaseError) {
    throw neteaseError;
  }
  throw createError("无法获取该歌曲的音源（可能已下架或无版权）");
}

/** 判断是不是「整体性失败」（风控 / 网络），这种不值得逐级重试 */
function isGlobalFailure(error) {
  const message = String((error && error.message) || "");
  return (
    message.indexOf("风控") >= 0 ||
    message.indexOf("403") >= 0 ||
    message.indexOf("频繁") >= 0 ||
    message.indexOf("请求失败") >= 0 ||
    message.indexOf("网络") >= 0
  );
}

/**
 * 网易云音源熔断器。
 * 如果整张歌单里每首歌都要先试网易云、失败、再转 B 站，手机上会明显卡顿（甚至被跳过）。
 * 一旦连续 N 次确认网易云音源整体不可用，就在接下来的一段时间内直接走 B 站。
 */
let neteaseUrlFailCount = 0;
let neteaseUrlBlockedUntil = 0;
const NETEASE_BLOCK_THRESHOLD = 2;
const NETEASE_BLOCK_DURATION = 5 * 60 * 1000;

function isNeteaseSourceBlocked() {
  return Date.now() < neteaseUrlBlockedUntil;
}

function markNeteaseSourceFailure(error) {
  if (!isGlobalFailure(error)) {
    return;
  }
  neteaseUrlFailCount++;
  if (neteaseUrlFailCount >= NETEASE_BLOCK_THRESHOLD) {
    neteaseUrlBlockedUntil = Date.now() + NETEASE_BLOCK_DURATION;
    neteaseUrlFailCount = 0;
  }
}

function markNeteaseSourceSuccess() {
  neteaseUrlFailCount = 0;
  neteaseUrlBlockedUntil = 0;
}

//#endregion

//#region B 站音源回退

/**
 * B 站 WBI 签名。2023 年后 B 站搜索接口必须携带 w_rid + wts，
 * 否则返回 -403。这里用 nav 接口下发的 img_key/sub_key 现算。
 */
const WBI_MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
  26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
  20, 34, 44, 52,
];

let wbiKeysCache = null;
let wbiKeysTime = 0;

function getMixinKey(raw) {
  const arr = [];
  WBI_MIXIN_KEY_ENC_TAB.forEach(function (index) {
    const char = raw.charAt(index);
    if (char) {
      arr.push(char);
    }
  });
  return arr.join("").slice(0, 32);
}

async function getWbiKeys() {
  // B 站的 key 每天轮换，缓存 30 分钟足够
  if (wbiKeysCache && Date.now() - wbiKeysTime < 30 * 60 * 1000) {
    return wbiKeysCache;
  }
  const response = await axios.get(
    "https://api.bilibili.com/x/web-interface/nav",
    { headers: BILI_API_HEADERS, timeout: 12000 }
  );
  const wbi = response.data && response.data.data && response.data.data.wbi_img;
  if (!wbi || !wbi.img_url || !wbi.sub_url) {
    throw createError("B 站 WBI key 获取失败");
  }
  const img = wbi.img_url.slice(
    wbi.img_url.lastIndexOf("/") + 1,
    wbi.img_url.lastIndexOf(".")
  );
  const sub = wbi.sub_url.slice(
    wbi.sub_url.lastIndexOf("/") + 1,
    wbi.sub_url.lastIndexOf(".")
  );
  wbiKeysCache = { img: img, sub: sub };
  wbiKeysTime = Date.now();
  return wbiKeysCache;
}

/** 给参数加上 w_rid / wts */
async function signWbi(params) {
  const keys = await getWbiKeys();
  const mixinKey = getMixinKey(keys.img + keys.sub);
  const signed = Object.assign({}, params);
  signed.wts = Math.floor(Date.now() / 1000);
  const query = Object.keys(signed)
    .sort()
    .map(function (key) {
      let value = signed[key];
      if (typeof value === "string") {
        value = value.replace(/[!'()*]/g, "");
      }
      return encodeURIComponent(key) + "=" + encodeURIComponent(value);
    })
    .join("&");
  signed.w_rid = CryptoJs.MD5(query + mixinKey).toString();
  signed.wts = params.wts || Math.floor(Date.now() / 1000);
  // 重新算一次（因为上面改了 wts）
  const finalQuery = Object.keys(signed)
    .sort()
    .map(function (key) {
      let value = signed[key];
      if (typeof value === "string") {
        value = value.replace(/[!'()*]/g, "");
      }
      return encodeURIComponent(key) + "=" + encodeURIComponent(value);
    })
    .join("&");
  signed.w_rid = CryptoJs.MD5(finalQuery + mixinKey).toString();
  return signed;
}

/** 去掉标题里的花括号特效字、括号说明、方括号标签等噪音 */
function normalizeTitle(text) {
  if (!text) {
    return "";
  }
  let str = String(text);
  // 反选上 B 站 up 主常用的装饰性全角字符
  str = str.replace(/[【】\[\]（）()《》「」『』"'’‘“”]/g, " ");
  // 去掉常见的画质/音质标注
  str = str.replace(/(4K|8K|1080P|720P|Hi-?Res|无损|音质|高音质|修复版|MV|官方|完整版|高清)/gi, " ");
  // 去掉花括号里的特效字符
  str = str.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]+/g, " ");
  return str.replace(/\s+/g, " ").trim().toLowerCase();
}

/** 计算两个标题的相似度（0~1），基于字符二元组重合度 */
function titleSimilarity(a, b) {
  const left = normalizeTitle(a);
  const right = normalizeTitle(b);
  if (!left || !right) {
    return 0;
  }
  if (left === right) {
    return 1;
  }
  if (left.indexOf(right) >= 0 || right.indexOf(left) >= 0) {
    return 0.9;
  }
  const grams = function (text) {
    const set = new Set();
    for (let i = 0; i < text.length - 1; i++) {
      set.add(text.slice(i, i + 2));
    }
    if (!set.size) {
      set.add(text);
    }
    return set;
  };
  const ga = grams(left);
  const gb = grams(right);
  let hit = 0;
  ga.forEach(function (item) {
    if (gb.has(item)) {
      hit++;
    }
  });
  return (2 * hit) / (ga.size + gb.size);
}

/** 把 "4:30" / "1:02:03" / 270 统一成秒 */
function parseBiliDuration(duration) {
  if (typeof duration === "number") {
    return duration;
  }
  const text = String(duration || "");
  const parts = text.split(":").map(function (item) {
    return parseInt(item, 10) || 0;
  });
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] || 0;
}

/** 在 B 站搜索并用标题 + 时长挑选最匹配的视频 */
async function searchBiliVideo(musicItem) {
  const keyword = [musicItem.title, musicItem.artist]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (!keyword) {
    return null;
  }
  const params = await signWbi({
    keyword: keyword,
    search_type: "video",
    page: 1,
  });
  const response = await axios.get(
    "https://api.bilibili.com/x/web-interface/wbi/search/type",
    {
      headers: Object.assign({}, BILI_API_HEADERS, {
        referer: "https://search.bilibili.com/",
        origin: "https://search.bilibili.com",
      }),
      params: Object.assign({}, params, { __refresh__: true, page_size: 30 }),
      timeout: 12000,
    }
  );
  const body = response.data;
  if (!body || body.code !== 0) {
    throw createError("B 站搜索失败（" + ((body && body.code) || "unknown") + "）");
  }
  const list = (body.data && body.data.result) || [];

  const targetDuration = Number(musicItem.duration) || 0;
  const candidates = [];

  list.forEach(function (item) {
    if (!item || !item.bvid) {
      return;
    }
    const cleanTitle = String(item.title || "").replace(/<[^>]+>/g, "");

    // 第 1 步：标题相似度是「硬门槛」，不达标直接淘汰。
    // 否则时长/播放量的加分会把风马牛不相及的视频顶上来（实测垃圾关键词也能被捞到）。
    const baseSimilarity = titleSimilarity(cleanTitle, musicItem.title);
    if (baseSimilarity < BILI_MATCH_THRESHOLD) {
      return;
    }

    let score = baseSimilarity;

    // 第 2 步：作者名出现在标题里，说明大概率是原唱版本
    if (musicItem.artist && cleanTitle.indexOf(musicItem.artist.split("/")[0]) >= 0) {
      score += 0.25;
    }

    // 第 3 步：时长越接近越可信
    const biliDuration = parseBiliDuration(item.duration);
    if (targetDuration > 0 && biliDuration > 0) {
      const diff = Math.abs(biliDuration - targetDuration);
      if (diff <= 3) {
        score += 0.3;
      } else if (diff <= BILI_DURATION_TOLERANCE) {
        score += 0.15;
      } else if (diff > 90) {
        score -= 0.25;
      }
    }

    // 第 4 步：伴奏 / 翻唱 / 教程等降权，避免「能播但放的是伴奏」
    const lowerTitle = cleanTitle.toLowerCase();
    const penalized = BILI_PENALTY_WORDS.some(function (word) {
      return lowerTitle.indexOf(word) >= 0;
    });
    if (penalized) {
      score -= 0.45;
    }

      // 第 5 步：播放量高的更可信（作为平手时的参考，权重很小）
    if (item.play > 100000) {
      score += 0.05;
    }

    candidates.push({
      bvid: item.bvid,
      aid: item.aid,
      title: cleanTitle,
      duration: biliDuration,
      author: item.author,
      score: score,
      baseSimilarity: baseSimilarity,
    });
  });

  candidates.sort(function (a, b) {
    return b.score - a.score;
  });
  // 多留几个候选：有些视频取不到 dash 音频流，需要往下试
  return candidates.slice(0, 3);
}

/**
 * 从 playurl 响应里挑音频流地址。
 * 返回「一条主地址 + 若干备选」，调用方可以按顺序重试。
 *
 * 注意：B 站返回的 baseUrl 经常是 mcdn.bilivideo.cn:8082 这类 P2P CDN，
 * 在手机蜂窝网络下经常连不通（表现为「能拿到地址但一直缓冲/失败」）。
 * 而 backupUrl 里通常会有 upos-*.bilivideo.com 的稳定源，所以要做优先级排序。
 */
function isStableHost(url) {
  const host = String(url || "")
    .replace(/^https?:\/\//, "")
    .split("/")[0];
  // P2P / 边缘节点：移动网络下不稳定
  if (/mcdn\.bilivideo\.cn|mountaintoys|szbdyd|dash\d*\.bilivideo/.test(host)) {
    return false;
  }
  // 这些是 B 站官方 CDN，稳定
  return /bilivideo\.(com|cn)/.test(host);
}

function pickAudioUrls(play, quality) {
  const dash = play && play.data && play.data.dash;
  if (!dash || !dash.audio || !dash.audio.length) {
    return [];
  }
  const audios = dash.audio.slice().sort(function (a, b) {
    return a.bandwidth - b.bandwidth;
  });
  let index = audios.length - 1;
  if (quality === "low") {
    index = 0;
  } else if (quality === "standard") {
    index = Math.min(1, audios.length - 1);
  } else if (quality === "high") {
    index = Math.max(audios.length - 2, 0);
  }
  const audio = audios[Math.max(index, 0)];
  if (!audio) {
    return [];
  }
  const all = []
    .concat(audio.baseUrl || audio.base_url || [])
    .concat(audio.backupUrl || audio.backup_url || [])
    .filter(Boolean);
  // 稳定源排前面，P2P 节点放后面兜底
  const stable = all.filter(isStableHost);
  const unstable = all.filter(function (url) {
    return !isStableHost(url);
  });
  return stable.concat(unstable);
}

/** 根据 bvid 取音频流地址（只接受 dash 音频流，不接受含视频轨的 durl） */
async function requestBiliAudio(bvid, quality) {
  const viewResponse = await axios.get(
    "https://api.bilibili.com/x/web-interface/view",
    {
      headers: BILI_API_HEADERS,
      params: { bvid: bvid },
      timeout: 12000,
    }
  );
  const view = viewResponse.data && viewResponse.data.data;
  if (!view || !view.cid) {
    throw createError("B 站视频信息获取失败（可能已失效）");
  }

  /**
   * 拿音频流地址。
   *
   * 性能：超时收紧到 6s（原来是 12s）。
   * 播放器等不了太久，宁可让这一首快速失败被跳过，
   * 也不要让它卡住整个队列 12 秒。
   */
  const playResponse = await axios.get(
    "https://api.bilibili.com/x/player/playurl",
    {
      headers: Object.assign({}, BILI_API_HEADERS, {
        referer: "https://www.bilibili.com/video/" + bvid,
      }),
      params: { bvid: bvid, cid: view.cid, fnval: 16, fourk: 1 },
      timeout: 6000,
    }
  );
  const play = playResponse.data;
  if (!play || play.code !== 0 || !play.data) {
    throw createError("B 站音频流获取失败（" + ((play && play.code) || "unknown") + "）");
  }

  const urls = pickAudioUrls(play, quality);
  if (!urls.length) {
    /**
     * 没有 dash 音频流时不再退回 durl：
     * durl 是「视频+音频」的整段 mp4，交给播放器当音频播会出现解码问题
     * （这也正是「能拿到地址但放不出来」的常见原因），直接换下一个候选。
     */
    throw createError("B 站该视频没有独立的音频流");
  }

  /**
   * 主动探活：确认地址在当前网络下真的能取到数据。
   *
   * 性能关键（直接影响「会不会跳歌」）：
   *   ・**并行**探测所有候选，而不是串行 —— 串行 3 条各 6s 超时就是 18s，
   *     播放器早就放弃跳歌了；
   *   ・稳定源（upos-*.bilivideo.com）直接采信，跳过探活省一次往返；
   *   ・探活仅作「优选」不作「准入」：全都不通时仍交第一候选给播放器试。
   */
  let finalUrl = urls[0];
  if (!isStableHost(urls[0])) {
    const probeResults = await Promise.all(
      urls.map(function (u) {
        return probeBiliUrl(u).catch(function () {
          return false;
        });
      })
    );
    for (let i = 0; i < probeResults.length; i++) {
      if (probeResults[i]) {
        finalUrl = urls[i];
        break;
      }
    }
  }

  return {
    url: finalUrl,
    headers: Object.assign({}, BILI_MEDIA_HEADERS, {
      // 显式声明 host，与官方插件一致（部分 CDN 节点对 host 敏感）
      host: finalUrl.replace(/^https?:\/\//, "").split("/")[0],
    }),
    cid: view.cid,
  };
}

/** 探测 B 站音频地址是否可用 */
async function probeBiliUrl(url) {
  try {
    const response = await axios.get(url, {
      headers: Object.assign({}, BILI_MEDIA_HEADERS, { Range: "bytes=0-1023" }),
      // 探活是并行发的，单条 2s 足够判断连通性；
      // 太长会让整首取源时间被最慢那条拖住，进而触发播放器跳歌。
      timeout: 2000,
      transformResponse: [
        function (data) {
          return data;
        },
      ],
    });
    return response.status === 200 || response.status === 206;
  } catch (error) {
    return false;
  }
}

/**
 * 取 mp4 整段音频（durl）。
 *
 * 背景：B 站的 dash 音频是 `.m4s` 分片容器，部分播放器（尤其 Android ExoPlayer
 * 在某些版本/机型上）嗅探容器会失败，直接报 `Source error`。
 * 而 `durl` 返回的是标准 `.mp4`，兼容性最好。
 *
 * 代价：durl 是「视频+音频」的整段文件，体积大、且需要播放器只取音轨。
 * 因此作为**备选**：默认先用 dash（省流量），失败时用户可切到这个。
 */
async function requestBiliMp4(bvid, quality) {
  const viewResponse = await axios.get(
    "https://api.bilibili.com/x/web-interface/view",
    {
      headers: BILI_API_HEADERS,
      params: { bvid: bvid },
      timeout: 12000,
    }
  );
  const view = viewResponse.data && viewResponse.data.data;
  if (!view || !view.cid) {
    throw createError("B 站视频信息获取失败");
  }
  const playResponse = await axios.get(
    "https://api.bilibili.com/x/player/playurl",
    {
      headers: Object.assign({}, BILI_MEDIA_HEADERS, {
        referer: "https://www.bilibili.com/video/" + bvid,
      }),
      // fnval: 0 -> 只要 durl（标准 mp4）
      params: { bvid: bvid, cid: view.cid, fnval: 0, fourk: 1 },
      timeout: 12000,
    }
  );
  const play = playResponse.data;
  if (!play || play.code !== 0 || !play.data) {
    throw createError("B 站 mp4 音频获取失败");
  }
  const durl = play.data.durl;
  if (!durl || !durl.length) {
    return null;
  }
  const url = durl[0].url || durl[0].baseUrl;
  if (!url) {
    return null;
  }
  return {
    url: url,
    headers: Object.assign({}, BILI_MEDIA_HEADERS, {
      host: url.replace(/^https?:\/\//, "").split("/")[0],
    }),
    cid: view.cid,
  };
}

/**
 * 用 B 站作为兜底音源：
 * 先按「歌名 + 歌手」搜索并按标题/时长排序，再依次尝试候选视频，
 * 直到拿到一条真正的 dash 音频流。结果会缓存，避免同一首歌反复搜索。
 */
async function getBiliMediaSource(musicItem, quality) {
  const cacheKey = String(musicItem.id || musicItem.title) + "|" + (musicItem.artist || "");
  const cached = biliSourceCache.get(cacheKey);
  if (cached && cached.expireAt > Date.now()) {
    return cached.result;
  }

  // 候选列表也缓存，换音质时不用重新搜索
  let candidates = biliMatchCache.get(cacheKey);
  if (!candidates) {
    candidates = await searchBiliVideo(musicItem);
    if (!candidates.length) {
      throw createError("B 站没有找到匹配的音频");
    }
    biliMatchCache.set(cacheKey, candidates);
    if (biliMatchCache.size > 100) {
      const firstKey = biliMatchCache.keys().next().value;
      biliMatchCache.delete(firstKey);
    }
  }

  let lastError = null;
  const preferMp4 = getPluginSettings().useMp4;

  for (let i = 0; i < candidates.length; i++) {
    const bvid = candidates[i].bvid;

    /**
     * 优先纯音频（dash）：体积小、无视频轨，
     * 播放器能正确按音频时长推进到下一曲。
     */
    if (!preferMp4) {
      try {
        const audio = await requestBiliAudio(bvid, quality);
        if (audio && audio.url) {
          const audioResult = {
            url: audio.url,
            headers: audio.headers,
            _source: "bilibili-audio",
            _bvid: bvid,
            _cid: audio.cid,
          };
          candidates[i].cid = audio.cid;
          biliSourceCache.set(cacheKey, {
            expireAt: Date.now() + BILI_SOURCE_TTL,
            result: audioResult,
          });
          return audioResult;
        }
      } catch (error) {
        lastError = error;
      }
    }

    // mp4 兜底（或用户显式要求 mp4）
    if (preferMp4) {
      try {
        const mp4 = await requestBiliMp4(bvid, quality);
        if (mp4) {
          const mp4Result = {
            url: mp4.url,
            headers: mp4.headers,
            _source: "bilibili-mp4",
            _bvid: bvid,
            _cid: mp4.cid,
          };
          candidates[i].cid = mp4.cid;
          biliSourceCache.set(cacheKey, {
            expireAt: Date.now() + BILI_SOURCE_TTL,
            result: mp4Result,
          });
          return mp4Result;
        }
      } catch (error) {
        lastError = error;
      }
    }

    /**
     * 兜底纯音频：mp4 优先模式下若 mp4 失败，再试纯音频，尽量给出可播流。
     */
    if (preferMp4) {
      try {
        const audio = await requestBiliAudio(bvid, quality);
        if (audio && audio.url) {
          const result = {
            url: audio.url,
            headers: audio.headers,
            _source: "bilibili-audio",
            _bvid: bvid,
            _cid: audio.cid,
          };
          candidates[i].cid = audio.cid;
          biliSourceCache.set(cacheKey, {
            expireAt: Date.now() + BILI_SOURCE_TTL,
            result: result,
          });
          if (biliSourceCache.size > 100) {
            const firstKey = biliSourceCache.keys().next().value;
            biliSourceCache.delete(firstKey);
          }
          return result;
        }
      } catch (error) {
        lastError = error;
      }
    }
  }

  throw createError(
    lastError ? lastError.message : "B 站没有可用的音频流"
  );
}

//#endregion

async function getLyric(musicItem) {
  const result = await requestWithFallback(
    "/weapi/song/lyric",
    { id: musicItem.id, lv: -1, kv: -1, tv: -1 },
    "/api/song/lyric",
    { id: musicItem.id, lv: -1, kv: -1, tv: -1 }
  );
  const lrc = (result.lrc && result.lrc.lyric) || "";
  const translation = (result.tlyric && result.tlyric.lyric) || "";
  if (!lrc && !translation) {
    return null;
  }
  return {
    rawLrc: lrc || undefined,
    translation: translation || undefined,
  };
}

async function getMusicInfo(musicBase) {
  const songs = await requestSongDetails([musicBase.id]);
  if (!songs.length) {
    return null;
  }
  const item = formatMusicItem(songs[0]);

  /**
   * 这里是「防呆」而不是「必需」：
   * 如果用户误把本插件的「替代插件」设成了 bilibili，MusicFree 会把这里返回的对象
   * 直接交给 B 站插件，而 B 站插件需要 bvid / cid。提前把匹配结果补进去，
   * 就能让那种错误配置也能播（虽然仍然建议关掉替代插件）。
   *
   * 失败不影响正常流程：拿不到就只是不带这两个字段。
   */
  try {
    const candidates = await searchBiliVideo(item);
    if (candidates.length) {
      item.bvid = candidates[0].bvid;
      item.aid = candidates[0].aid;
      // cid 需要额外请求一次 view 接口；拿到就能让 B 站插件少请求一次
      try {
        const view = await axios.get(
          "https://api.bilibili.com/x/web-interface/view",
          {
            headers: BILI_API_HEADERS,
            params: { bvid: item.bvid },
            timeout: 8000,
          }
        );
        const cid = view.data && view.data.data && view.data.data.cid;
        if (cid) {
          item.cid = cid;
        }
      } catch (error) {
        // 拿不到 cid 也没关系：B 站插件会自己去 view 接口查
      }
    }
  } catch (error) {
    // 忽略：正常播放不依赖这些字段
  }

  return item;
}

async function getAlbumInfo(albumItem, page) {
  if (page > 1) {
    return { isEnd: true, musicList: [] };
  }
  const result = await requestWithFallback(
    "/weapi/v1/album/" + albumItem.id,
    {},
    "/api/album/" + albumItem.id,
    {}
  );
  const album = result.album || {};
  const songs = result.songs || album.songs || [];
  return {
    isEnd: true,
    albumItem: {
      id: String(album.id || albumItem.id),
      title: album.name || albumItem.title,
      artist: (album.artist && album.artist.name) || "",
      artwork: album.picUrl || "",
      description: album.description || album.briefDesc || "",
      worksNum: album.size,
      createAt: album.publishTime,
    },
    musicList: songs.map(formatMusicItem).filter(Boolean),
  };
}

async function getMusicComments(musicItem, page) {
  const currentPage = page || 1;
  const offset = (currentPage - 1) * COMMENT_PAGE_SIZE;
  const result = await requestWithFallback(
    "/weapi/v1/resource/comments/R_SO_4_" + musicItem.id,
    { limit: COMMENT_PAGE_SIZE, offset: offset },
    "/api/v1/resource/comments/R_SO_4_" + musicItem.id,
    { limit: COMMENT_PAGE_SIZE, offset: offset }
  );
  const comments = result.comments || [];
  const total = result.total || 0;
  return {
    isEnd: offset + comments.length >= total || !comments.length,
    data: comments.map(function (comment) {
      const user = comment.user || {};
      return {
        id: String(comment.commentId),
        nickName: user.nickname || "",
        avatar: user.avatarUrl || "",
        comment: comment.content || "",
        like: comment.likedCount,
        createAt: comment.time,
        location: (comment.ipLocation && comment.ipLocation.location) || "",
      };
    }),
  };
}

//#endregion

//#region 歌单

/**
 * 取歌单某一页歌曲。
 * 优先用 trackIds + 批量详情，保证顺序正确、数量不丢（大歌单也不会被截断）。
 */
async function requestPlaylistTracks(playlistId, page) {
  const playlist = await requestPlaylistDetail(playlistId);
  const offset = (page - 1) * TRACK_PAGE_SIZE;
  const trackIds = (playlist.trackIds || []).map(function (item) {
    return item.id;
  });
  const total = playlist.trackCount || trackIds.length;

  let musicList = [];
  let hasMore = false;

  if (trackIds.length) {
    const slice = trackIds.slice(offset, offset + TRACK_PAGE_SIZE);
    hasMore = offset + slice.length < trackIds.length;
    if (slice.length) {
      const wholeTracks = playlist.tracks || [];
      // 接口直接给全了歌曲信息就不必再请求
      const canSliceDirectly =
        wholeTracks.length === trackIds.length &&
        wholeTracks.length >= offset + slice.length;
      if (canSliceDirectly) {
        musicList = wholeTracks
          .slice(offset, offset + slice.length)
          .map(formatMusicItem)
          .filter(Boolean);
      } else {
        const songs = await requestSongDetails(slice);
        musicList = songs.map(formatMusicItem).filter(Boolean);
      }
    }
  } else {
    // 没有 trackIds（老版 /api 接口的特征）：只能按 tracks 实际长度分页，
    // 注意不能用 trackCount 判断是否还有下一页，否则接口截断时会无限翻页。
    const tracks = playlist.tracks || [];
    musicList = tracks
      .slice(offset, offset + TRACK_PAGE_SIZE)
      .map(formatMusicItem)
      .filter(Boolean);
    hasMore = offset + musicList.length < tracks.length;
  }

  return {
    isEnd: !hasMore,
    total: total,
    playlist: playlist,
    musicList: musicList,
  };
}

async function getMusicSheetInfo(sheetItem, page) {
  const currentPage = page || 1;

  // 每日推荐伪歌单（从歌单广场进入）
  if (String(sheetItem.id) === DAILY_ID) {
    if (currentPage > 1) {
      return { isEnd: true, musicList: [] };
    }
    const musicList = await requestDailySongs();
    const entry = await getDailySheetEntry();
    return {
      isEnd: true,
      sheetItem: {
        id: DAILY_ID,
        title: entry.title,
        artwork: entry.artwork,
        description: entry.description,
        worksNum: musicList.length,
      },
      musicList: musicList,
    };
  }

  const result = await requestPlaylistTracks(sheetItem.id, currentPage);
  const playlist = result.playlist;
  const response = {
    isEnd: result.isEnd,
    musicList: result.musicList,
  };
  if (currentPage === 1) {
    response.sheetItem = {
      id: String(playlist.id),
      title: playlist.name || sheetItem.title,
      artwork: playlist.coverImgUrl || "",
      artist: (playlist.creator && playlist.creator.nickname) || "",
      description: playlist.description || "",
      playCount: playlist.playCount,
      worksNum: playlist.trackCount,
      createAt: playlist.createTime,
    };
  }
  return response;
}

//#endregion

//#region 推荐歌单（歌单广场）

/** 网易云歌单分类：0 语种 / 1 风格 / 2 场景 / 3 情感 / 4 主题 */
const TAG_CATEGORY_MAP = {
  0: "语种",
  1: "风格",
  2: "场景",
  3: "情感",
  4: "主题",
};

let recommendTagCache = null;

async function getRecommendSheetTags() {
  if (recommendTagCache) {
    return recommendTagCache;
  }
  const result = await requestWithFallback(
    "/weapi/playlist/catalogue",
    {},
    "/api/playlist/catalogue",
    {}
  );  const subTags = result.sub || [];
  const groups = [];
  const groupIndex = {};

  subTags.forEach(function (tag) {
    const title = TAG_CATEGORY_MAP[tag.category] || "其它";
    if (groupIndex[title] === undefined) {
      groupIndex[title] = groups.length;
      groups.push({ title: title, data: [] });
    }
    groups[groupIndex[title]].data.push({
      id: tag.name,
      title: tag.name,
    });
  });

  // 注意：app 会自带一个 id 为 "" 的默认标签（「全部」），此处不要重复添加
  recommendTagCache = {
    pinned: [
      // 「我的歌单」放最前面：账号下所有歌单会独立列出来，每个都能一键整单导入
      { id: MY_SHEETS_TAG_ID, title: "我的歌单" },
      { id: DAILY_TAG_ID, title: "每日推荐" },
      { id: HIGH_QUALITY_PREFIX + "全部", title: "精选" },
      { id: "华语", title: "华语" },
      { id: "欧美", title: "欧美" },
      { id: "流行", title: "流行" },
      { id: "电子", title: "电子" },
      { id: "说唱", title: "说唱" },
      { id: "古风", title: "古风" },
      { id: "ACG", title: "ACG" },
      { id: "摇滚", title: "摇滚" },
      { id: "轻音乐", title: "轻音乐" },
    ],
    data: groups,
  };
  return recommendTagCache;
}

/** 描述「这一份每日推荐」的来源，避免用户误以为是账号数据 */
function describeDailySource(musicList) {
  const fromAccount =
    musicList.length > 0 && musicList[0].dailySource === "account";
  const nick = accountCache && accountCache.nickname ? String(accountCache.nickname) : "";
  if (fromAccount) {
    return nick
      ? "来自你的网易云账号「" + nick + "」· 每日更新"
      : "来自你的网易云账号 · 每日更新";
  }
  if (!hasAnyCookie()) {
    return "未配置 Cookie，当前为公共推荐（非账号数据）";
  }
  // 填了 Cookie 但没读到账号推荐：可能是 Cookie 失效，也可能是当天还没生成。
  // 详细的登录/风控诊断请点插件卡片的「?」查看。
  return "未读到账号推荐，当前为公共推荐（可点「?」查看诊断）";
}

/** 「每日推荐」在歌单广场里作为一个歌单条目展示 */
async function getDailySheetEntry() {
  const musicList = await requestDailySongs();
  const first = musicList[0];
  return {
    id: DAILY_ID,
    title: "每日推荐 · " + formatDate(Date.now()),
    artwork: (first && first.artwork) || "",
    description: "共 " + musicList.length + " 首 · " + describeDailySource(musicList),
    worksNum: musicList.length,
  };
}

/**
 * 「精选歌单」接口是游标分页（lasttime），按 tag + 页码记录游标。
 * app 会顺序翻页，因此能够对上。
 */
const highQualityCursorCache = new Map();

async function getHighQualitySheets(cat, page) {
  const cursorMap = highQualityCursorCache.get(cat) || {};
  const lasttime = page <= 1 ? 0 : cursorMap[page - 1] || 0;
  const result = await requestWithFallback(
    "/weapi/playlist/highquality/list",
    { cat: cat, limit: SHEET_PAGE_SIZE, lasttime: lasttime },
    "/api/playlist/highquality/list",
    { cat: cat, limit: SHEET_PAGE_SIZE, lasttime: lasttime }
  );
  const playlists = result.playlists || [];
  if (result.lasttime) {
    cursorMap[page] = result.lasttime;
    highQualityCursorCache.set(cat, cursorMap);
  }
  return {
    isEnd: !result.more || !playlists.length,
    data: playlists.map(formatSheetItem),
  };
}

/** tag.id：每日推荐 / 精选("hq:" 前缀) / 普通分类名 */
function parseTag(tag) {
  const raw = String((tag && tag.id) || "");
  if (raw === DAILY_TAG_ID) {
    return { kind: "daily" };
  }
  if (raw === MY_SHEETS_TAG_ID) {
    return { kind: "mySheets" };
  }
  if (raw.indexOf(HIGH_QUALITY_PREFIX) === 0) {
    return {
      kind: "highQuality",
      cat: raw.slice(HIGH_QUALITY_PREFIX.length) || "全部",
    };
  }
  return {
    kind: "list",
    cat: raw || "全部",
    order: (tag && tag.order) || "hot",
  };
}

async function getRecommendSheetsByTag(tag, page) {
  const currentPage = page || 1;
  const parsed = parseTag(tag);

  // 每日推荐：作为一个歌单条目出现，点进去走 getMusicSheetInfo
  if (parsed.kind === "daily") {
    if (currentPage > 1) {
      return { isEnd: true, data: [] };
    }
    return { isEnd: true, data: [await getDailySheetEntry()] };
  }

  // 我的歌单：账号下全部歌单，每个独立成条目（进去后可用 📁 一键整单导入）
  if (parsed.kind === "mySheets") {
    if (currentPage > 1) {
      return { isEnd: true, data: [] };
    }
    const account = await requestAccount();
    if (!account || !account.userId) {
      return { isEnd: true, data: [] };
    }
    const data = await plainApiGet(
      "/api/user/playlist?uid=" + account.userId + "&limit=1000&offset=0"
    );
    const list = (data && data.playlist) || [];
    return {
      isEnd: true,
      data: list.map(function (item) {
        const isLiked = item.specialType === 5;
        return {
          id: String(item.id),
          title: isLiked ? "我喜欢的音乐" : item.name || "",
          coverImg: item.coverImgUrl || "",
          artwork: item.coverImgUrl || "",
          description:
            ((item.creator && item.creator.nickname) || account.nickname) +
            " · " +
            (item.trackCount || 0) +
            " 首",
          worksNum: item.trackCount,
          playCount: item.playCount,
        };
      }),
    };
  }

  if (parsed.kind === "highQuality") {
    return getHighQualitySheets(parsed.cat, currentPage);
  }

  // 注意：网易云 /weapi/playlist/list 的 order=new 已失效（返回空），只用最热排序
  const offset = (currentPage - 1) * SHEET_PAGE_SIZE;
  const result = await requestWithFallback(
    "/weapi/playlist/list",
    {
      cat: parsed.cat,
      order: parsed.order || "hot",
      limit: SHEET_PAGE_SIZE,
      offset: offset,
      total: true,
    },
    "/api/playlist/list",
    {
      cat: parsed.cat,
      order: parsed.order || "hot",
      limit: SHEET_PAGE_SIZE,
      offset: offset,
    }
  );
  const playlists = result.playlists || [];
  const total = result.total || 0;
  return {
    isEnd: offset + playlists.length >= total || !playlists.length,
    data: playlists.map(formatSheetItem),
  };
}

//#endregion

//#region 扫码登录

/**
 * 扫码登录。
 *
 * 为什么做这个：让用户去 F12 里翻 Cookie 太折磨，而且网易云的登录字段名一直在变
 * （MUSIC_U / MUSIC_A / 以后可能又叫别的）。扫码是官方正规流程，最可靠。
 *
 * 流程：
 *   1. /weapi/login/qrcode/unikey 拿 unikey
 *   2. 二维码内容 = https://music.163.com/login?codekey=<unikey>
 *   3. 轮询 /weapi/login/qrcode/client/login，803 时服务端通过 Set-Cookie 下发登录凭证
 *
 * 局限：MusicFree 的插件接口是「查询型」的，没有弹窗/图片展示能力，
 * 所以这里把二维码**渲染成一个可用浏览器打开的图片链接**，
 * 用户用网易云 App 或手机浏览器打开即可扫码。
 */

/**
 * 本次会话的扫码状态。
 *
 * ⚠️ 关键：**不能每次进页面都新建二维码**。
 * 用户扫码需要时间，如果一进来就换新 unikey，之前扫的那次就作废了，
 * 表现就是「明明扫码确认了，回来还是未登录」。
 * 所以这里缓存会话，直到「拿到 Cookie」或「过期」才重建。
 */
let qrSession = null;

/** 扫码得到的 Cookie（内存里保留，供本次运行期间直接使用） */
let qrLoginCookie = null;

/** 本次扫码凭证是否已经写回用户变量（用于说明页显示不同文案） */
let qrLoginPersisted = false;

/**
 * 扫码成功那一刻，用户变量里的粘贴原文。
 * 用来判断「用户之后有没有又改过粘贴内容」——改过就以粘贴内容为准。
 */
let qrLoginBaseRaw = "";

/** 最近一次创建二维码失败的原因（显示在说明页，避免静默失败） */
let qrLoginError = "";

/** 二维码有效期（网易云 unikey 约 5 分钟失效，这里留点余量） */
const QR_SESSION_TTL = 4 * 60 * 1000;
/** 轮询间隔：扫码后 3 秒内就能感知到 */
const QR_POLL_INTERVAL = 3000;

/** 复用未过期的会话，否则新建 */
async function ensureQrSession(forceNew) {
  const now = Date.now();
  if (
    !forceNew &&
    qrSession &&
    qrSession.status !== QR_STATUS.EXPIRED &&
    now - qrSession.createdAt < QR_SESSION_TTL
  ) {
    return qrSession;
  }
  return createQrSession();
}

/** 把 Set-Cookie 头解析成 "名=值" 列表 */
function parseSetCookie(setCookie) {
  if (!setCookie) {
    return [];
  }
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const pair = String(arr[i]).split(";")[0];
    if (pair && pair.indexOf("=") > 0) {
      out.push(pair.trim());
    }
  }
  return out;
}

/**
 * 把扫码得到的凭证写回插件用户变量。
 *
 * 上游 0.7.0 只把凭证放在模块内存里：App 重启 / JS 重载后 qrLoginCookie 丢失，
 * 用户必须重新扫码。新版 App 的插件环境提供 env.setUserVariables，
 * 这里把整份 Cookie 合并进现有用户变量，重启后由 getRawCookieInput() 读回。
 *
 * 返回是否写入成功；写入失败时仍保留内存凭证，不影响本次运行。
 */
function persistQrLoginCookie(cookie) {
  if (!cookie) {
    return false;
  }
  try {
    if (
      typeof env === "undefined" ||
      !env ||
      typeof env.setUserVariables !== "function"
    ) {
      return false;
    }
    const current = env.getUserVariables ? env.getUserVariables() : {};
    env.setUserVariables(
      Object.assign({}, current || {}, { cookie: String(cookie) })
    );
    return true;
  } catch (error) {
    return false;
  }
}

/** 合并 Cookie（同名后者覆盖前者） */
function mergeCookie(base, pairs) {
  const map = {};
  const order = [];
  const ingest = function (str) {
    String(str || "")
      .split(";")
      .forEach(function (pair) {
        const t = pair.trim();
        const eq = t.indexOf("=");
        if (eq <= 0) {
          return;
        }
        const name = t.slice(0, eq);
        if (!(name in map)) {
          order.push(name);
        }
        map[name] = t;
      });
  };
  ingest(base);
  for (let i = 0; i < pairs.length; i++) {
    ingest(pairs[i]);
  }
  const out = [];
  for (let i = 0; i < order.length; i++) {
    out.push(map[order[i]]);
  }
  return out.join("; ");
}

/**
 * 直接发 weapi 请求并拿到 Set-Cookie。
 * 扫码流程必须自己管 Cookie，因为 unikey 和轮询要和同一个服务端会话绑定。
 */
async function qrRawPost(path, payload, cookieStr) {
  const encrypted = encryptWeapi(Object.assign({ csrf_token: "" }, payload));
  const body =
    "params=" +
    encodeURIComponent(encrypted.params) +
    "&encSecKey=" +
    encodeURIComponent(encrypted.encSecKey);

  const response = await axios.post(BASE_URL + path, body, {
    headers: {
      "user-agent": UA,
      referer: BASE_URL + "/",
      "content-type": "application/x-www-form-urlencoded",
      cookie: cookieStr,
    },
    timeout: 12000,
  });
  return {
    data: response.data || {},
    setCookie: response.headers && response.headers["set-cookie"],
  };
}

/**
 * 稳定的设备标识（模拟浏览器的 _ntes_nuid）。
 *
 * 网易云的风控会把「全新设备 + 立刻扫码登录」判定为异常，
 * 给一个稳定的伪设备 ID 能让多次尝试看起来是同一台设备，降低被拦概率。
 * 没有随机存储能力，就用固定前缀 + 时间片拼一个足够稳定的值。
 */
function getStableDeviceId() {
  // 已经注册匿名设备时，用服务端认可的那个 deviceId
  if (anonDevice && anonDevice.deviceId) {
    return anonDevice.deviceId;
  }
  let seed = "musicfree-netease-plugin";
  try {
    // 尽量掺入设备信息，让它在本机保持稳定
    if (typeof env !== "undefined" && env && env.os) {
      seed += "-" + env.os;
    }
    if (typeof process !== "undefined" && process && process.platform) {
      seed += "-" + process.platform;
    }
    seed += "-" + (getRawCookieInput() ? "user" : "anon");
  } catch (error) {
    // ignore
  }
  // 与参考项目 generateDeviceId 一致：52 位大写十六进制
  const hexChars = "0123456789ABCDEF";
  const bytes = [];
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 = ((h1 ^ c) * 0x01000193) >>> 0;
    h2 = (h2 + c * 31) >>> 0;
    bytes.push(h1, h2);
  }
  let out = "";
  for (let i = 0; i < 52; i++) {
    out += hexChars[bytes[i % bytes.length] % 16];
  }
  return out;
}

/**
 * 匿名设备注册（对应参考项目的 module/register_anonimous.js）。
 *
 * 为什么必须有：扫码登录时，手机 App 会校验「发起扫码的客户端环境」。
 * 一个从未注册过的裸客户端会被判定「设备环境异常」并直接阻止确认。
 * 先用 /api/register/anonimous 注册一个游客设备，拿到 MUSIC_A，
 * 后续请求带上它，才会被当成正常设备。
 */
let anonDevice = null;
let anonRegisterPromise = null;

/**
 * 取或生成 sDeviceId。
 *
 * 网易云的 sDeviceId 形如 `YD-ZjW1mJyAz9NBRgRFRBOdQvFFL7sKLGEP`，
 * 用于构造扫码二维码的 chainId 参数。用户 Cookie 里有就直接用，
 * 没有就生成一个同格式的（同一会话内保持稳定）。
 */
let cachedSDeviceId = null;
function getOrCreateSDeviceId() {
  const fromCookie = getCookieValue("sDeviceId");
  if (fromCookie) {
    return fromCookie;
  }
  if (anonDevice && anonDevice.sDeviceId) {
    return anonDevice.sDeviceId;
  }
  if (cachedSDeviceId) {
    return cachedSDeviceId;
  }
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let body = "";
  for (let i = 0; i < 32; i++) {
    body += chars[Math.floor(Math.random() * chars.length)];
  }
  cachedSDeviceId = "YD-" + body;
  return cachedSDeviceId;
}

function cloudmusicDllEncodeId(someId) {
  const key = "3go8&$8*3*3h0k(2)2";
  let xored = "";
  for (let i = 0; i < someId.length; i++) {
    xored += String.fromCharCode(
      someId.charCodeAt(i) ^ key.charCodeAt(i % key.length)
    );
  }
  const digest = CryptoJs.MD5(CryptoJs.enc.Utf8.parse(xored));
  return CryptoJs.enc.Base64.stringify(digest);
}

async function ensureAnonDevice() {
  if (anonDevice) {
    return anonDevice;
  }
  if (anonRegisterPromise) {
    return anonRegisterPromise;
  }
  anonRegisterPromise = (async function () {
    const hexChars = "0123456789ABCDEF";
    let deviceId = "";
    for (let i = 0; i < 52; i++) {
      deviceId += hexChars[Math.floor(Math.random() * 16)];
    }
    const encoded = CryptoJs.enc.Base64.stringify(
      CryptoJs.enc.Utf8.parse(deviceId + " " + cloudmusicDllEncodeId(deviceId))
    );
    const result = await eapiRawRequest("/api/register/anonimous", {
      username: encoded,
    });
    const pairs = parseSetCookie(result.setCookie);
    let musicA = "";
    let nmtid = "";
    let csrf = "";
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      if (pair.indexOf("MUSIC_A=") === 0) {
        musicA = pair.slice("MUSIC_A=".length);
      } else if (pair.indexOf("NMTID=") === 0) {
        nmtid = pair.slice("NMTID=".length);
      } else if (pair.indexOf("__csrf=") === 0) {
        csrf = pair.slice("__csrf=".length);
      }
    }
    anonDevice = {
      deviceId: deviceId,
      musicA: musicA,
      nmtid: nmtid,
      csrf: csrf,
      code: result.data && result.data.code,
    };
    return anonDevice;
  })();
  try {
    return await anonRegisterPromise;
  } catch (error) {
    anonRegisterPromise = null;
    throw error;
  }
}

/** 申请扫码 unikey（同时建立服务端会话 Cookie） */
async function createQrSession() {
  // 1. 先像浏览器那样攒一份会话 Cookie。
  //    网易云会按「设备指纹」判定风险：一个全新的匿名客户端一上来就扫码登录，
  //    很容易被判为异常（-462 请完成验证）。所以这里尽量补齐浏览器常见的设备 Cookie。
  let jar = "os=pc; appver=3.1.17.204416; osver=Microsoft-Windows-10-Professional-build-19045-64bit; channel=netease;";

  // 如果用户已经填过 Cookie，就沿用它的设备标识，避免每次都被当成新设备
  const existing = buildCookie();
  if (existing && existing.indexOf("NMTID=") >= 0) {
    jar = mergeCookie(jar, parseSetCookie(existing));
  }

  // 补上浏览器必备的设备唯一标识（没有就生成一个稳定值）
  if (jar.indexOf("_ntes_nuid=") < 0) {
    jar = mergeCookie(jar, ["_ntes_nuid=" + getStableDeviceId()]);
  }
  if (jar.indexOf("_ntes_nnid=") < 0) {
    jar = mergeCookie(jar, ["_ntes_nnid=" + getStableDeviceId() + "," + Date.now()]);
  }

  try {
    const seed = await axios.get(BASE_URL + "/discover", {
      headers: { "user-agent": UA },
      timeout: 12000,
    });
    jar = mergeCookie(jar, parseSetCookie(seed.headers && seed.headers["set-cookie"]));
  } catch (error) {
    // 拿不到就用基础 Cookie，不影响取码
  }

  // 2. 取 unikey
  //
  // ⚠️ 必须优先走 eapi：实测 weapi 的扫码相关接口会被 -462 拦，
  // 而 eapi 通道（凭证/设备信息在加密体内部）可以正常拿到 unikey 和轮询结果。
  //
  // 另外必须**先注册匿名设备**：手机 App 确认时会校验发起扫码的客户端环境，
  // 裸客户端会被判定「设备环境异常」并阻止登录。
  try {
    await ensureAnonDevice();
  } catch (error) {
    // 注册失败也继续尝试，最多是回到「设备环境异常」的老问题
  }

  let unikey = null;
  let viaEapi = false;
  try {
    // type: 3 = App 扫码（与参考项目 login_qr_key.js 一致）
    const uni = await eapiRawRequest("/api/login/qrcode/unikey", { type: 3 });
    unikey = uni.data && uni.data.unikey;
    if (unikey) {
      viaEapi = true;
    }
  } catch (error) {
    unikey = null;
  }
  if (!unikey) {
    const uni = await qrRawPost("/weapi/login/qrcode/unikey", { type: 3 }, jar);
    unikey = uni.data && uni.data.unikey;
    jar = mergeCookie(jar, parseSetCookie(uni.setCookie));
  }
  if (!unikey) {
    throw createError("网易云没有返回二维码标识，请稍后再试");
  }

  /**
   * 二维码链接必须带 chainId。
   *
   * 参考 NeteaseCloudMusicApi 的 module/login_qr_create.js：
   *   if (platform === 'web') url += `&chainId=${generateChainId(cookie)}`
   * 而 generateChainId = `v1_${sDeviceId}_web_login_${timestamp}`。
   *
   * 少了这个参数，网易云 App 扫码后会提示「设备环境异常，被阻止」。
   */
  const sDeviceId = getOrCreateSDeviceId();
  const chainId = "v1_" + sDeviceId + "_web_login_" + Date.now();
  const loginUrl =
    "https://music.163.com/login?codekey=" + unikey + "&chainId=" + chainId;

  const session = {
    unikey: unikey,
    loginUrl: loginUrl,
    qrImage: buildQrImage(loginUrl),
    createdAt: Date.now(),
    status: QR_STATUS.WAITING,
    cookie: null,
    /** 与服务端保持一致的 Cookie 罐 */
    jar: jar,
    /** unikey 是否来自 eapi 通道（eapi 的轮询不会被 -462 拦） */
    viaEapi: viaEapi,
    /** 最近一次轮询的原始结果，便于把问题显示给用户 */
    lastCode: null,
    lastMessage: "",
  };
  qrSession = session;
  return session;
}

/**
 * 轮询扫码结果。
 * 返回 { status, cookie }，status 见 QR_STATUS。
 */
async function pollQrSession(session) {
  let r = null;

  /**
   * 优先用 eapi 轮询。
   *
   * 实测：weapi 的 `/weapi/login/qrcode/client/login` 会被 -462（请完成验证）拦住，
   * 而 eapi 通道（设备信息与凭证在加密体内部）稳定返回 801/802/803。
   * 这是让扫码登录真正可用的关键。
   */
  if (session.viaEapi !== false) {
    try {
      const res = await eapiRawRequest("/api/login/qrcode/client/login", {
        key: session.unikey,
        type: 1,
      });
      r = { data: res.data, setCookie: res.setCookie };
      session.viaEapi = true;
    } catch (error) {
      r = null;
    }
  }

  // eapi 失败时才退回 weapi
  if (!r) {
    r = await qrRawPost(
      "/weapi/login/qrcode/client/login",
      { key: session.unikey, type: 3 },
      session.jar
    );
    session.viaEapi = false;
  }

  const setCookiePairs = parseSetCookie(r.setCookie);
  // 把服务端下发的 Cookie 合并进会话罐
  session.jar = mergeCookie(session.jar, setCookiePairs);

  const code = r.data.code;
  session.lastCode = code;
  session.lastMessage = r.data.message || "";

  if (code === QR_STATUS.SUCCESS) {
    // 803：登录凭证就在这次响应的 Set-Cookie 里
    const loginPairs = setCookiePairs.filter(function (pair) {
      const name = pair.slice(0, pair.indexOf("="));
      return (
        /^MUSIC_[A-Z]+$/i.test(name) ||
        /^__csrf$/i.test(name) ||
        /^NMTID$/i.test(name) ||
        /^JSESSIONID/i.test(name) ||
        /^__remember_me$/i.test(name)
      );
    });
    if (loginPairs.length) {
      session.cookie = loginPairs.join("; ");
      session.status = QR_STATUS.SUCCESS;
      return { status: QR_STATUS.SUCCESS, cookie: session.cookie };
    }
    session.lastMessage = "登录成功但没有拿到 Cookie，请重试";
  } else {
    session.status = code;
  }
  return { status: code, cookie: null };
}

/** 停掉轮询定时器 */
function stopQrPolling() {
  if (qrPollTimer) {
    try {
      clearInterval(qrPollTimer);
    } catch (error) {
      // ignore
    }
    qrPollTimer = null;
  }
}

/**
 * 快速轮询扫码状态（每 3 秒一次）。
 *
 * ⚠️ 这是「扫完码插件没反应」的核心修复：
 * 之前只在插件加载和打开榜单页时问一次，用户扫完码后插件根本不会再去查，
 * 自然一直显示未登录。现在扫完最多 3 秒就能被感知到。
 */
let qrPollTimer = null;

function startQrPolling() {
  if (qrPollTimer) {
    return;
  }
  try {
    qrPollTimer = setInterval(function () {
      const session = qrSession;
      if (!session) {
        return;
      }
      // 已经登录成功：停止
      if (session.status === QR_STATUS.SUCCESS && qrLoginCookie) {
        stopQrPolling();
        return;
      }
      // 过期：停止并把状态写回界面
      if (Date.now() - session.createdAt >= QR_SESSION_TTL) {
        session.status = QR_STATUS.EXPIRED;
        stopQrPolling();
        rebindCookieHint(session);
        return;
      }
      pollQrSession(session)
        .then(function (poll) {
          if (poll.status === QR_STATUS.SUCCESS && poll.cookie) {
            qrLoginCookie = poll.cookie;
            // 新版 App 提供 env.setUserVariables：把扫码凭证写回用户变量，
            // 否则只存在模块内存里，App 重启 / JS 重载后就要重新扫码。
            qrLoginPersisted = persistQrLoginCookie(poll.cookie);
            // 写入成功后，粘贴原文要跟着变成新凭证，
            // 否则 getEffectiveLoginCookie 会把 qrLoginCookie 当成「用户改过粘贴内容」清掉。
            qrLoginBaseRaw = qrLoginPersisted
              ? String(qrLoginCookie)
              : getRawCookieInput();
            accountCache = null;
            markLoginVerified(true);
            // 扫码走的是 eapi → 后续请求也走 eapi，绕开 Cookie 头问题
            if (session.viaEapi) {
              preferEapi = true;
            }
            stopQrPolling();
            // 立刻用新凭证核验一次，把结果显示到说明里
            try {
              requestAccount()
                .then(function () {
                  rebindCookieHint();
                })
                .catch(function () {});
            } catch (error) {
              // ignore
            }
          } else if (poll.status === -462) {
            // 连续被风控就别再刷了：越刷越容易被判定为异常
            session.riskHits = (session.riskHits || 0) + 1;
            if (session.riskHits >= 3) {
              session.blocked = true;
              stopQrPolling();
            }
          } else {
            session.riskHits = 0;
          }
          // 每次轮询都刷新界面状态（扫码中/待确认/成功/风控都能看到）
          rebindCookieHint(session);
        })
        .catch(function () {
          // 网络抖动忽略，下一轮继续
        });
    }, QR_POLL_INTERVAL);
    if (qrPollTimer && typeof qrPollTimer.unref === "function") {
      qrPollTimer.unref();
    }
  } catch (error) {
    // 沙箱不支持 setInterval 时退化为「按需轮询」
  }
}

/** 把扫码状态翻译成人话 */
function describeQrStatus(status) {
  if (status === QR_STATUS.SUCCESS) {
    return "✅ 登录成功（Cookie 已获取）";
  }
  if (status === QR_STATUS.SCANNED) {
    return "📱 已扫码，请在手机上点「确认登录」";
  }
  if (status === QR_STATUS.EXPIRED) {
    return "⌛ 二维码已过期（点「导入单曲」输入 qr 换一张）";
  }
  if (status === QR_STATUS.WAITING) {
    return "⏳ 等待扫码…";
  }
  if (status === -462) {
    return "⚠️ 网易云风控（-462 请完成验证）：扫码查询接口被人机验证拦住";
  }
  if (status === 301 || status === 403) {
    return "⚠️ 被网易云拒绝（" + status + "），请稍后重试或更换网络";
  }
  if (status === null || status === undefined) {
    return "⏳ 等待扫码…";
  }
  return "状态未知（" + status + "）";
}


//#endregion

//#region 排行榜 / 每日推荐 / 我的歌单

async function getTopLists() {
  const result = await requestWithFallback(
    "/weapi/toplist",
    {},
    "/api/toplist",
    {}
  );
  const all = result.list || [];

  const official = [];
  const others = [];
  all.forEach(function (item) {
    const sheetItem = {
      id: String(item.id),
      title: item.name || "",
      coverImg: item.coverImgUrl || "",
      artwork: item.coverImgUrl || "",
      description: item.description || item.updateFrequency || "",
      playCount: item.playCount,
      worksNum: item.trackCount,
      updateFrequency: item.updateFrequency,
    };
    if (item.ToplistType) {
      official.push(sheetItem);
    } else {
      others.push(sheetItem);
    }
  });

  const groups = [];

  // 先核验登录态（有 Cookie 才会真的请求，结果会缓存），后面两处都要用
  // 注意：这里**不能**因为「已降级」就跳过检查，否则被误判失效后再也无法恢复
  const account = await requestAccount();
  const loggedIn = !!account;

  // 核验完立刻刷新一次说明，让「Cookie 自检」显示真实的服务器结论
  // （说明一开始是在核验之前生成的，不刷新会一直停在「尚未核验」）
  if (getRawCookieInput()) {
    rebindCookieHint(qrSession);
  }

  // 1. 每日推荐（固定在最前）
  //    这里**真的取一次**数据来决定文案：只有亲眼看到结果，
  //    才能说清是「账号推荐」「公共推荐」还是「被风控」，
  //    否则靠 account/get 去猜会误报（account/get 被拦不代表推荐接口也被拦）。
  let dailyDesc;
  if (!hasAnyCookie()) {
    dailyDesc = "未配置 Cookie：当前是公共推荐，非账号数据";
  } else {
    try {
      const preview = await requestDailySongsCached();
      dailyDesc = describeDailySource(preview);
    } catch (error) {
      dailyDesc = "每日推荐获取失败：" + ((error && error.message) || "网络异常");
    }
  }

  groups.push({
    title: "每日推荐",
    data: [
      {
        id: DAILY_ID,
        title: "每日推荐",
        coverImg: "",
        artwork: "",
        description: dailyDesc,
      },
    ],
  });

  // 注意：扫码登录已移到「插件加载时」（见 description 生成逻辑），
  // 不再在榜单里放入口。

  // 2. 我的歌单（登录后）
  if (account) {
    try {
      // 明文 GET /api/user/playlist（社区插件同款，避开 weapi 风控）
      const userPlaylists = await plainApiGet(
        "/api/user/playlist?uid=" + account.userId + "&limit=1000&offset=0"
      );
      const list = (userPlaylists.playlist || []).map(function (item) {
        const isLiked = item.specialType === 5;
        return {
          id: PLAYLIST_ID_PREFIX + item.id,
          title: isLiked ? "我喜欢的音乐" : item.name || "",
          coverImg: item.coverImgUrl || "",
          artwork: item.coverImgUrl || "",
          description:
            "创建者：" +
            ((item.creator && item.creator.nickname) || account.nickname) +
            " · " +
            (item.trackCount || 0) +
            " 首",
          worksNum: item.trackCount,
          playCount: item.playCount,
        };
      });
      if (list.length) {
        groups.push({
          title: "我的歌单（" + account.nickname + "）",
          data: list,
        });
      }
    } catch (error) {
      // 隐私设置可能导致读取失败，忽略即可
    }
  }

  // 3. 官方榜 / 更多榜单
  if (official.length) {
    groups.push({ title: "官方榜", data: official });
  }
  if (others.length) {
    groups.push({ title: "更多榜单", data: others });
  }

  return groups;
}

/**
 * 每日推荐歌曲。
 *
 * 关键：网易云有两个「每日推荐」接口，返回结构**完全不同**，别搞混——
 *
 *   /weapi/v1/discovery/recommend/songs  → 账号的真实每日推荐（必须登录）
 *       返回 { code, recommend: [歌曲...] }
 *       未登录 / Cookie 无效时 recommend 是空数组（不报错，这点很坑）
 *
 *   /weapi/v3/discovery/recommend/songs  → 按 IP 的公共推荐，跟账号无关
 *       返回 { code, data: { dailySongs: [...], recommendReasons: [...] } }
 *       匿名也返回 30 首，但所有人都一样
 *
 * 因此：登录了就必须走 v1（并读 recommend 字段），只有未登录才退回 v3。
 */
/**
 * 取每日推荐（带短期缓存）。
 * 这样榜单页就能拿到「真实结果」来决定文案，而不是靠 account/get 猜。
 */
async function requestDailySongsCached() {
  const now = Date.now();
  if (dailyCache && now - dailyCache.at < 60 * 1000) {
    return dailyCache.list;
  }
  const list = await requestDailySongs();
  dailyCache = { list: list, at: now };
  return list;
}

async function requestDailySongs() {
  /**
   * 每日推荐接口优先级：**明文 GET v3 优先**。
   *
   * 实测结论（用真实账号逐首比对得出）：
   *   ・v3（/api/v3/discovery/recommend/songs）才是**手机 App 里显示的每日推荐**，
   *     并且响应里带 recommendReasons（「超80%人播放」「十万评论」这类推荐理由），
   *     这正是 App 上能看到的东西。
   *   ・v1（/api/discovery/recommend/songs）是**另一套推荐集合**，
   *     与 v3 的重合度为 0 —— 用它就会「看起来完全不对」。
   *   ・eapi 请求会写回设备会话（原生 jar），能不用就不用。
   */
  const hasCookie = await shouldUseAccountApi();

  // ① 明文 GET v3（手机 App 同款，最优先）
  try {
    const result = await plainApiGet("/api/v3/discovery/recommend/songs");
    const songs = (result && result.data && result.data.dailySongs) || [];
    if (songs.length) {
      return formatDailySongs(songs, result, hasCookie ? "account" : "public");
    }
  } catch (error) {
    // 退回 v1
  }

  // ② 明文 GET v1（旧接口，作为兜底）
  try {
    const result = await plainApiGet("/api/discovery/recommend/songs");
    const songs =
      (result && result.recommend) ||
      (result && result.data && result.data.dailySongs) ||
      [];
    if (songs.length) {
      return formatDailySongs(songs, result, hasCookie ? "account" : "public");
    }
  } catch (error) {
    // 退回 eapi
  }

  // ③ 最后才试 eapi v3（凭证放加密体，会写回设备会话，仅作兜底）
  if (hasCookie) {
    try {
      const viaEapi = await eapiRequest("/api/v3/discovery/recommend/songs", {});
      const eapiSongs = (viaEapi && viaEapi.data && viaEapi.data.dailySongs) || [];
      if (eapiSongs.length) {
        return formatDailySongs(eapiSongs, viaEapi, "account");
      }
    } catch (error) {
      // 忽略
    }
  }

  return [];
}

/** 把每日推荐歌曲格式化成 MusicFree 曲目 */
function formatDailySongs(songs, result, source) {
  return songs
    .map(function (song) {
      const formatted = formatMusicItem(song);
      if (formatted) {
        formatted.recommendReason = getRecommendReason(song, result);
        formatted.dailySource = source;
      }
      return formatted;
    })
    .filter(Boolean);
}

/**
 * 取推荐理由。
 * v1 会在 data.recommendReasons 里给「因为…」这类说明，
 * v3 则可能直接在歌曲上带 reason 字段。
 */
function getRecommendReason(song, result) {
  if (song && song.reason) {
    return song.reason;
  }
  // 明文 /api/discovery/recommend/songs 把理由放在顶层 recommendReasons；
  // 加密 v1/v3 则放在 data.recommendReasons。两种都兼容。
  const reasons =
    (result && (result.recommendReasons || (result.data && result.data.recommendReasons))) ||
    [];
  for (let i = 0; i < reasons.length; i++) {
    if (String(reasons[i].songId) === String(song.id)) {
      return reasons[i].reason || "";
    }
  }
  return "";
}

/** 用歌单信息补全榜单条目 */
function buildTopListItem(topListItem, playlist) {
  const merged = Object.assign({}, topListItem);
  merged.title = playlist.name || topListItem.title;
  merged.coverImg = playlist.coverImgUrl || topListItem.coverImg;
  merged.artwork = playlist.coverImgUrl || topListItem.artwork;
  merged.description = playlist.description || topListItem.description;
  merged.worksNum = playlist.trackCount;
  merged.updateFrequency = playlist.updateFrequency || topListItem.updateFrequency;
  return merged;
}

async function getTopListDetail(topListItem, page) {
  const currentPage = page || 1;
  const id = String(topListItem.id || "");

  // 每日推荐
  if (id === DAILY_ID) {
    if (currentPage > 1) {
      return { isEnd: true, musicList: [] };
    }
    // 先尽力拿到账号昵称（有缓存时零开销），好在标题/描述里显示
    if (hasAnyCookie()) {
      try {
        await requestAccount();
      } catch (error) {
        // 忽略
      }
    }
    const musicList = await requestDailySongsCached();
    const today = formatDate(Date.now());
    const dailyItem = Object.assign({}, topListItem);
    dailyItem.title =
      "每日推荐 · " +
      today +
      (accountCache && accountCache.nickname ? "（" + accountCache.nickname + "）" : "");
    dailyItem.description =
      "共 " + musicList.length + " 首 · " + describeDailySource(musicList);
    dailyItem.worksNum = musicList.length;
    return {
      isEnd: true,
      topListItem: dailyItem,
      musicList: musicList,
    };
  }

  // 我的歌单
  if (id.indexOf(PLAYLIST_ID_PREFIX) === 0) {
    const playlistId = id.slice(PLAYLIST_ID_PREFIX.length);
    const result = await requestPlaylistTracks(playlistId, currentPage);
    const response = {
      isEnd: result.isEnd,
      musicList: result.musicList,
    };
    if (currentPage === 1) {
      response.topListItem = buildTopListItem(topListItem, result.playlist);
    }
    return response;
  }

  // 普通榜单：榜单 id 本身就是歌单 id
  const result = await requestPlaylistTracks(id, currentPage);
  const response = {
    isEnd: result.isEnd,
    musicList: result.musicList,
  };
  if (currentPage === 1) {
    response.topListItem = buildTopListItem(topListItem, result.playlist);
  }
  return response;
}

//#endregion

//#region 歌手作品

async function getArtistWorks(artistItem, page, type) {
  const currentPage = page || 1;

  if (type === "album") {
    const offset = (currentPage - 1) * ARTIST_ALBUM_PAGE_SIZE;
    const result = await weapiRequest("/weapi/artist/albums/" + artistItem.id, {
      limit: ARTIST_ALBUM_PAGE_SIZE,
      offset: offset,
      total: true,
    });
    const albums = result.hotAlbums || [];
    return {
      isEnd: !result.more || !albums.length,
      data: albums.map(formatAlbumItem),
    };
  }

  // 默认：单曲
  const offset = (currentPage - 1) * ARTIST_PAGE_SIZE;
  const result = await requestWithFallback(
    "/weapi/v1/artist/songs",
    { id: artistItem.id, offset: offset, limit: ARTIST_PAGE_SIZE },
    "/api/v1/artist/songs",
    { id: artistItem.id, offset: offset, limit: ARTIST_PAGE_SIZE }
  );
  const songs = result.songs || [];
  return {
    isEnd: !result.more || !songs.length,
    data: songs.map(formatMusicItem).filter(Boolean),
  };
}

//#endregion

//#region 导入

/** 从链接/文本中提取 id */
function parseIdFromUrl(urlLike, pattern) {
  const text = String(urlLike || "").trim();
  if (/^\d+$/.test(text)) {
    return text;
  }
  const match = text.match(pattern);
  return match ? match[1] : null;
}

/** 拉取歌单全部歌曲（不截断，分批请求） */
async function requestAllPlaylistSongs(playlistId) {
  const playlist = await requestPlaylistDetail(playlistId);
  const trackIds = (playlist.trackIds || []).map(function (item) {
    return item.id;
  });
  if (!trackIds.length) {
    return (playlist.tracks || []).map(formatMusicItem).filter(Boolean);
  }
  /**
   * 不设上限：歌单有多少首就取多少首。
   * 之前截断到 1000 首，大歌单（例如几万首的「我喜欢的音乐」）会丢歌。
   * 分批请求避免单次 URL/响应过大。
   */
  const result = [];
  for (let i = 0; i < trackIds.length; i += SONG_DETAIL_BATCH) {
    const songs = await requestSongDetails(trackIds.slice(i, i + SONG_DETAIL_BATCH));
    songs.forEach(function (song) {
      result.push(formatMusicItem(song));
    });
  }
  return result.filter(Boolean);
}

async function importMusicSheet(urlLike) {
  /**
   * 输入清洗。
   *
   * 手机端粘贴常带有不可见字符（零宽空格 U+200B、BOM、全角空格、换行），
   * 直接拿去正则匹配会「看起来一样却匹配不上」，表现为导入没反应。
   */
  const rawInput = String(urlLike || "");
  const input = rawInput
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "")
    .replace(/[\uFF01-\uFF5E]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
    })
    .replace(/[\r\n\t]/g, " ")
    .trim();

  if (!input) {
    throw createError("输入为空，请粘贴歌单链接或歌单 ID");
  }

  if (input === "mylist" || input === "我的歌单" || input === "歌单列表") {
    throw createError(
      "要查看歌单列表，请用「导入 → 单曲」输入 mylist；这里（导入 → 歌单）请填歌单链接 / 歌单 ID / 歌单名"
    );
  }

  /**
   * 全部导入：把账号下**所有歌单的歌曲合并**成一个列表返回。
   *
   * 用途：用户想「一次性把网易云里的歌全部搬过来」时用这个。
   * 注意合并后是一个大列表（会加到同一个本地歌单）；
   * 若想保留歌单结构，用「导入 → 歌单」逐个导入，或去歌单广场的「我的歌单」标签。
   */
  if (
    input === "all" ||
    input === "全部" ||
    input === "全部歌单" ||
    input === "allplaylist"
  ) {
    const account = await requestAccount();
    if (!account || !account.userId) {
      throw createError("未登录，读不到你的歌单。请先填写网易云 Cookie");
    }
    const data = await plainApiGet(
      "/api/user/playlist?uid=" + account.userId + "&limit=1000&offset=0"
    );
    const list = (data && data.playlist) || [];
    if (!list.length) {
      throw createError("你的账号下没有歌单");
    }

    // 逐个歌单拉全量，按 id 去重（多歌单常有重复歌曲）
    const seen = {};
    const merged = [];
    for (let i = 0; i < list.length; i++) {
      const pl = list[i];
      try {
        const songs = await requestAllPlaylistSongs(String(pl.id));
        for (let k = 0; k < songs.length; k++) {
          const s = songs[k];
          if (s && s.id && !seen[s.id]) {
            seen[s.id] = true;
            merged.push(s);
          }
        }
      } catch (e) {
        // 单个歌单失败不影响整体
      }
    }

    if (!merged.length) {
      throw createError("所有歌单都是空的，没有可导入的歌曲");
    }
    return merged;
  }

  let id =
    parseIdFromUrl(input, /playlist[\/?].*?[?&]?id=(\d+)/i) ||
    parseIdFromUrl(input, /playlist\D*(\d+)/i);

  /**
   * 支持更宽松的输入方式：
   *   ・纯数字 → 当作歌单 ID
   *   ・歌单名 → 在「我的歌单」里按名字查找（唯一匹配才导入）
   */
  if (!id && /^\d+$/.test(input)) {
    id = input;
  }

  if (!id) {
    const account = await requestAccount();
    if (account && account.userId) {
      let list = [];
      try {
        const data = await plainApiGet(
          "/api/user/playlist?uid=" + account.userId + "&limit=1000&offset=0"
        );
        list = (data && data.playlist) || [];
      } catch (e) {
        list = [];
      }

      const needle = input.toLowerCase();
      const exact = list.filter(function (p) {
        return String(p.name || "").trim().toLowerCase() === needle;
      });
      const fuzzy =
        exact.length === 0
          ? list.filter(function (p) {
              return String(p.name || "").toLowerCase().indexOf(needle) >= 0;
            })
          : [];

      if (exact.length === 1) {
        id = String(exact[0].id);
      } else if (exact.length > 1) {
        throw createError(
          "有 " +
            exact.length +
            " 个同名歌单，请改用歌单 ID 导入：" +
            exact.map(function (p) { return p.name + "=" + p.id; }).join("、")
        );
      } else if (fuzzy.length >= 1) {
        throw createError(
          "没有完全同名的歌单。你是不是要找：" +
            fuzzy.slice(0, 5).map(function (p) { return p.name + "=" + p.id; }).join("、") +
            " ？（直接填对应的数字 ID 即可）"
        );
      } else if (list.length) {
        throw createError(
          "没找到名为「" + input + "」的歌单。你的歌单有：" +
            list.slice(0, 8).map(function (p) { return p.name; }).join("、") +
            " …（用「导入 → 单曲」输入 mylist 可看全部）"
        );
      }
    }
  }

  if (!id) {
    throw createError(
      "无法解析歌单。可以填这三种之一：\n" +
        "① 链接：https://music.163.com/#/playlist?id=331947302\n" +
        "② 歌单 ID：331947302\n" +
        "③ 歌单名：颠\n" +
        "（用「导入 → 单曲」输入 mylist 可查看你的全部歌单和 ID）"
    );
  }

  const musicList = await requestAllPlaylistSongs(id);
  if (!musicList.length) {
    throw createError("歌单为空或无法读取");
  }
  return musicList;
}

/**
 * 构造一条「诊断条目」用于把结论显示给用户。
 *
 * 背景：MusicFree 会吞掉插件方法抛出的错误（只显示「导入失败」），
 * 所以想让用户看到结果，只能**返回一条数据**，借导入确认弹窗展示标题。
 * 用户看到后点取消即可，不会真的加进歌单。
 */
function makeDiagnosticItem(title, detail) {
  return {
    id: "__diagnostic__",
    platform: "网易云音乐",
    title: title,
    artist: detail,
    album: "",
    artwork: "",
    duration: 0,
  };
}

async function importMusicItem(urlLike) {
  const raw = String(urlLike || "").trim().toLowerCase();

  /**
   * 列出「我的歌单」及其 ID，方便用户复制链接/ID 后全量导入。
   * 输入：mylist / 我的歌单 / 歌单列表
   */
  if (raw === "mylist" || raw === "我的歌单" || raw === "歌单列表") {
    const account = await requestAccount();
    if (!account || !account.userId) {
      return makeDiagnosticItem(
        "❌ 未登录，读不到你的歌单",
        "请先在「用户变量 → 网易云 Cookie」填入 Cookie。"
      );
    }
    let data = null;
    try {
      data = await plainApiGet(
        "/api/user/playlist?uid=" + account.userId + "&limit=1000&offset=0"
      );
    } catch (e) {
      return makeDiagnosticItem("❌ 读取歌单失败", (e && e.message) || "未知错误");
    }
    const list = (data && data.playlist) || [];
    if (!list.length) {
      return makeDiagnosticItem("⚠️ 你没有歌单", "接口返回 0 个歌单。");
    }
    const rows = list.map(function (p, i) {
      const liked = p.specialType === 5 ? "（我喜欢的音乐）" : "";
      return (
        i +
        1 +
        ". " +
        (p.name || "(未命名)") +
        liked +
        " · " +
        (p.trackCount || 0) +
        " 首 · id=" +
        p.id
      );
    });
    return makeDiagnosticItem(
      "📚 你的歌单共 " + list.length + " 个（点取消即可）",
      "要导入某个歌单：回到「导入 → 歌单」，粘贴下面任一形式——\n" +
        "  • https://music.163.com/#/playlist?id=<歌单ID>\n" +
        "  • 直接输入歌单 ID（纯数字）\n" +
        "  • 输入歌单名（如果名字唯一）\n\n" +
        rows.join("\n")
    );
  }

  /**
   * 手动「测试登录」：输入 test 立刻用当前 Cookie 问一次服务器，
   * 把原始结论直接告诉用户。用于判断 Cookie 到底是「失效」还是「被风控」。
   */
  /**
   * 扫码登录入口。
   *
   * 用途：当「浏览器 Cookie 怎么填都不被接受」时，让插件在本机自己完成一次登录，
   * 拿到一份**本机产生**的 MUSIC_U（服务端最可能接受的那种）。
   *
   * 二维码用 Markdown 图片展示在「插件说明（?）」里，
   * 因为导入弹窗不保证能渲染图片。
   */
  if (
    raw === "login" ||
    raw === "扫码" ||
    raw === "扫码登录" ||
    raw === "qr" ||
    raw === "登录"
  ) {
    let session = null;
    let errMsg = "";
    try {
      session = await ensureQrSession(true);
      qrLoginError = "";
      startQrPolling();
    } catch (error) {
      errMsg = (error && error.message) || "未知错误";
      qrLoginError = errMsg;
    }
    rebindCookieHint();
    if (!session) {
      return makeDiagnosticItem(
        "❌ 二维码生成失败（原因已写入「?」）",
        "原因：" +
          errMsg +
          "\n\n常见原因：\n" +
          "1. 被网易云风控（-462 / 请完成验证）\n" +
          "2. 当前网络访问不了 interfacepc.music.163.com\n" +
          "3. unikey 接口没有返回\n\n" +
          "请打开插件说明（?）查看「扫码登录」面板里的完整错误，把那段发我。"
      );
    }
    return makeDiagnosticItem(
      "📷 扫码登录：打开「?」查看二维码",
      "已生成登录二维码，请**打开插件说明（?）** 查看并扫码。\n\n" +
        "二维码链接（也可以在电脑上打开）：\n" +
        session.loginUrl +
        "\n\n扫码并在手机上点「确认登录」后，插件会自动轮询（每 3 秒一次），" +
        "成功后说明页会显示拿到的 Cookie，复制粘贴到「用户变量 → 网易云 Cookie」即可。\n\n" +
        "二维码有效期约 4 分钟。"
    );
  }

  if (raw === "test" || raw === "测试登录" || raw === "check") {
    accountCache = null;
    accountRiskBlocked = false;
    lastAccountCheck = null;

    const verdict = async function () {
      /**
       * 先算出「发出去的内容」的关键指标，无论成功失败都带上，
       * 这样用户一截图就能定位问题（长度/首尾是判断截断的关键）。
       */
      const rawInput = getRawCookieInput();
      const musicU = getCookieValue("MUSIC_U") || getCookieValue("MUSIC_A");
      const fingerprint = musicU
        ? "MUSIC_U " +
          musicU.length +
          " 字符（" +
          musicU.slice(0, 8) +
          "…" +
          musicU.slice(-4) +
          "）"
        : "没有 MUSIC_U";

      if (!rawInput) {
        return {
          ok: false,
          title: "❌ 还没填 Cookie",
          detail:
            "请先在「用户变量 → 网易云 Cookie」里粘贴浏览器 Cookie。",
        };
      }
      const account = await requestAccount();
      if (account) {
        return {
          ok: true,
          title: "✅ 登录有效：" + account.nickname,
          detail: "账号 ID " + account.userId + " · " + fingerprint,
        };
      }
      if (accountRiskBlocked) {
        return {
          ok: false,
          title: "⚠️ 被网易云风控（-462），无法核验",
          detail:
            "这不代表 Cookie 无效 · " +
            fingerprint +
            " · 建议换网络（Wi-Fi ↔ 流量）后重试。",
        };
      }
      if (!musicU) {
        return {
          ok: false,
          title: "❌ Cookie 里没有 MUSIC_U",
          detail:
            "粘贴内容 " +
            rawInput.length +
            " 字符，但解析不出 MUSIC_U。可能只复制了一部分。",
        };
      }
      if (musicU.length < 200) {
        return {
          ok: false,
          title: "❌ MUSIC_U 被截断了（只有 " + musicU.length + " 字符）",
          detail: "正常约 800 字符 · 建议改用「cookie2」分段填写。" + fingerprint,
        };
      }
      return {
        ok: false,
        title: "❌ 网易云不认这个 MUSIC_U",
        detail:
          fingerprint +
          " · 粘贴内容 " +
          rawInput.length +
          " 字符。请把这一整行发给开发者，即可判断是内容不符还是被服务端拒绝。",
      };
    };

    const result = await verdict();

    /**
     * 全组合探测：当「浏览器是一个账号、插件是另一个账号」时，
     * 用它定位是哪一种请求形态导致服务端认错人。
     */
    let probeLines = [];
    try {
      const probe = await runFullAccountProbe();
      for (let i = 0; i < probe.length; i++) {
        const p = probe[i];
        probeLines.push(
          p.label +
            " → " +
            (p.accountId ? "账号 ID " + p.accountId : "无账号") +
            (p.nickname ? "（" + p.nickname + "）" : "") +
            (p.note ? " · " + p.note : "")
        );
      }
    } catch (e) {
      probeLines.push("探测失败：" + ((e && e.message) || "未知"));
    }

    const fullDetail =
      result.detail +
      "\n\n【全组合探测】各请求形态查到的账号：\n" +
      probeLines.map(function (l) {
        return "- " + l;
      }).join("\n") +
      "\n\n如果浏览器是 A 账号、这里全是 B 账号，说明 Cookie 本身就是 B 账号的；" +
      "\n如果这里有的组合是 A、有的是 B，说明是请求头/os 前缀导致的识别差异。" +
      "\n\n⚠️ 本次探测里的 eapi 请求可能向手机网络层写回设备会话 Cookie。" +
      "\n探测完后若账号又变回设备匿名号，请清除 MusicFree 应用数据后重粘 Cookie。";

    // 同步更新说明与提示，保证「?」和用户变量里也能看到同样结论
    rebindCookieHint(qrSession);

    /**
     * ⚠️ 这里**不能** throw：
     * MusicFree 会把插件方法抛出的错误吞掉，只显示「导入失败」，
     * 用户根本看不到具体原因。所以返回一条「诊断条目」，
     * 让结论直接显示在导入确认弹窗里。
     */
    return makeDiagnosticItem(result.title, fullDetail);
  }

  const id =
    parseIdFromUrl(urlLike, /song[\/?].*?[?&]?id=(\d+)/i) ||
    parseIdFromUrl(urlLike, /song\D*(\d+)/i);
  if (!id) {
    throw createError(
      "无法解析单曲链接，请粘贴形如 https://music.163.com/#/song?id=xxx 的链接"
    );
  }
  const songs = await requestSongDetails([id]);
  if (!songs.length) {
    throw createError("歌曲不存在或已下架");
  }
  return formatMusicItem(songs[0]);
}

//#endregion

/**
 * 生成「网易云 Cookie」这一项的 hint 文本（纯文本，无法显示图片）。
 * 只做 Cookie 填写与登录状态展示，不含扫码。
 */
function buildCookieHint() {
  const parts = [];
  const userCookie = getRawCookieInput();

  if (userCookie) {
    if (accountCache && accountCache.nickname) {
      parts.push("✅ 已登录：" + accountCache.nickname);
    } else if (accountCache && accountCache.userId) {
      parts.push("✅ 已登录（账号 ID " + accountCache.userId + "）");
    } else {
      parts.push("✅ 已填写 Cookie");
    }
    parts.push("");
    parts.push("插件会用这份 Cookie 请求账号每日推荐与「我的歌单」。");
    parts.push("如果推荐不是你的口味，说明 Cookie 已过期，重新复制一份覆盖即可。");
    parts.push("");
    parts.push("（插件版本：" + BUILD_STAMP + "）");
    return parts.join("\n");
  }

  parts.push("登录才能使用个性化每日推荐与「我的歌单」。");
  parts.push("");
  parts.push(
    "浏览器登录 music.163.com → F12 → Application → Cookies → 全选复制粘到这里。"
  );
  parts.push("（登录凭证叫 MUSIC_U，全大写；搜小写 music 是搜不到的）");
  parts.push("");
  parts.push("（插件版本：" + BUILD_STAMP + "）");
  return parts.join("\n");
}

/**
 * 插件说明（Markdown）。
 * 只做 Cookie 登录说明与登录状态展示，不含扫码二维码。
 */
function buildPluginDescription() {
  const lines = [
    "网易云音乐插件，支持搜索、播放、每日推荐、歌单广场、榜单、我的歌单、专辑、歌手、歌词、评论与链接导入。",
    "",
    "登录后可解锁：**个性化每日推荐**、「我的歌单」。",
    "",
    "---",
    "",
    "## 🔖 构建版本",
    "",
    "**" + BUILD_STAMP + "**",
    "",
    "本次包含的改动：",
    "",
  ];
  for (let i = 0; i < CHANGELOG.length; i++) {
    lines.push("- " + CHANGELOG[i]);
  }
  lines.push("");
  lines.push(
    "> 如果这里显示的版本号和你刚装的文件不一致，说明**没有真正替换成功**（还是旧插件在跑）。"
  );
  lines.push("");

  /**
   * 扫码登录面板：只要本次运行里创建过二维码（或失败过）就显示在最顶部，
   * 这样用户「导入单曲 → 输入 login」之后，打开「?」就能看到码或失败原因。
   */
  if (!qrSession && qrLoginError) {
    lines.push("---");
    lines.push("");
    lines.push("## 📷 扫码登录 · ❌ 生成失败");
    lines.push("");
    lines.push("错误信息：");
    lines.push("");
    lines.push("```");
    lines.push(qrLoginError);
    lines.push("```");
    lines.push("");
    lines.push(
      "请把上面这段发我。常见原因是网易云风控（`-462 请完成验证`）——" +
        "可以等 10 分钟后再试一次，或换网络（切 WiFi / 切流量）重试。"
    );
    lines.push("");
  }
  if (qrSession) {
    lines.push("---");
    lines.push("");
    lines.push("## 📷 扫码登录");
    lines.push("");
    const qrNow = Date.now();
    const qrExpired = qrNow - qrSession.createdAt >= QR_SESSION_TTL;
    const qrOk = qrSession.status === QR_STATUS.SUCCESS && qrLoginCookie;
    if (qrOk) {
      lines.push(
        qrLoginPersisted
          ? "### ✅ 扫码成功，凭证已自动保存"
          : "### ✅ 扫码成功，已拿到本机凭证"
      );
      lines.push("");
      if (qrLoginPersisted) {
        lines.push(
          "插件已把凭证写入「用户变量 → 网易云 Cookie」，重启 App 后仍然有效。"
        );
        lines.push("");
        lines.push(
          "如需在其他设备使用，可到用户变量里复制；这里只显示摘要，避免整段凭证出现在说明页。"
        );
      } else {
        lines.push(
          "⚠️ 当前客户端不支持插件写回用户变量，凭证只在本次运行期间有效，重启后需要重新扫码。"
        );
        lines.push("");
        lines.push(
          "若要长期保存，把下面整行粘到「用户变量 → 网易云 Cookie」："
        );
        lines.push("");
        lines.push("```");
        lines.push(qrLoginCookie);
        lines.push("```");
      }
      const muQr = getCookieValue("MUSIC_U");
      if (muQr) {
        lines.push("");
        lines.push(
          "- MUSIC_U 长度 **" +
            muQr.length +
            "**，`" +
            muQr.slice(0, 16) +
            "…" +
            muQr.slice(-8) +
            "`"
        );
      }
    } else if (qrExpired) {
      lines.push("二维码已过期。请在「导入 → 单曲」里输入 `login` 重新生成。");
    } else {
      lines.push(
        "用**网易云音乐 App** 扫码，然后在手机上点「确认登录」（有效期约 4 分钟）："
      );
      lines.push("");
      lines.push("![" + "网易云登录二维码" + "](" + qrSession.qrImage + ")");
      lines.push("");
      lines.push(
        "状态：" +
          describeQrStatus(qrSession.status) +
          (qrSession.lastMessage ? "（" + qrSession.lastMessage + "）" : "")
      );
      lines.push("");
      lines.push("扫不出来也可以在电脑浏览器打开这个链接：");
      lines.push("");
      lines.push("```");
      lines.push(qrSession.loginUrl);
      lines.push("```");
    }
    lines.push("");
  }


  // 扫码拿到的凭证也算「已配置」，否则扫码成功后这里不会显示账号
  const userCookie = getEffectiveLoginCookie().cookie;
  if (userCookie) {
    lines.push("---");
    lines.push("");
    if (accountCache && accountCache.nickname) {
      lines.push("## ✅ 已登录：`" + accountCache.nickname + "`");
      lines.push("");
    } else if (accountCache && accountCache.userId) {
      // 已登录但拿不到显示昵称（eapi 只回了 account，没有 profile）
      lines.push("## ✅ 已登录");
      lines.push("");
    } else {
      lines.push("## ⚠️ 已填写 Cookie，但读不到账号");
      lines.push("");
      lines.push(
        "这说明网易云没有接受这份 Cookie（请求被当成匿名）。每日推荐会是公共数据。"
      );
      lines.push("");
    }

    /**
     * 启动自动清理的结果：账号读不到时插件会退出设备残留会话并重新核验。
     * 把结果明明白白写在这里，用户一看就知道清理有没有起作用。
     */
    if (autoCleanupState) {
      lines.push("");
      if (autoCleanupState.accountId) {
        lines.push(
          "## 🔄 自动清理成功 ✅"
        );
        lines.push("");
        lines.push(
          autoCleanupState.note +
            "。清理后账号已恢复：`" +
            autoCleanupState.accountId +
            "`" +
            (autoCleanupState.nickname ? "（" + autoCleanupState.nickname + "）" : "") +
            "。"
        );
      } else {
        lines.push("## 🔄 自动清理已执行");
        lines.push("");
        lines.push(
          autoCleanupState.note + "，但账号仍未识别。"
        );
      }
      lines.push("");
    }

    /**
     * 「这份 Cookie 到底是谁」的指纹：放在最显眼的位置，
     * 方便和浏览器里的账号、MUSIC_U 逐项对比。
     */
    if (accountCache && accountCache.userId) {
      lines.push("**这份 Cookie 对应的账号：**");
      lines.push("");
      lines.push("| 项目 | 值 |");
      lines.push("| --- | --- |");
      lines.push("| 账号 ID | `" + accountCache.userId + "` |");
      if (sendDebug && sendDebug.accountPhone) {
        lines.push("| 手机号 | `" + sendDebug.accountPhone + "` |");
      }
      if (sendDebug && sendDebug.accountUserName) {
        lines.push("| 登录名 | `" + sendDebug.accountUserName + "` |");
      }
      if (sendDebug && sendDebug.musicUHead) {
        lines.push(
          "| MUSIC_U | 长度 " +
            sendDebug.musicULength +
            "，`" +
            sendDebug.musicUHead +
            "…" +
            sendDebug.musicUTail +
            "` |"
        );
      }
      if (sendDebug && sendDebug.nmtidLength !== undefined) {
        lines.push(
          "| NMTID | " +
            (sendDebug.nmtidLength
              ? "长度 " + sendDebug.nmtidLength + "，`" + sendDebug.nmtidHead + "…`"
              : "**缺失**（eapi 设备会话标识，缺了容易被识别成匿名设备）") +
            " |"
        );
      }
      lines.push("");
      lines.push(
        "👉 请核对：**账号 ID** 是否等于你在浏览器打开 `music.163.com/api/nuser/account/get` 看到的 `account.id`；" +
          "**手机号** 是否是自己的号。不一致说明这份 Cookie 不是你的账号。"
      );
      lines.push("");
    }

    // 读不到账号时，给出排查方向
    if (!(accountCache && accountCache.userId)) {
      /** 读不到账号时，给出排查方向（本仓库已修复 Cookie 头覆盖问题）。 */
      lines.push("---");
      lines.push("");
      lines.push("### 排查建议");
      lines.push("");
      lines.push(
        "本仓库的 iOS 构建已修复「插件 Cookie 头被 RN 原生 Cookie 覆盖」的问题（scripts/apply-react-native-patches.js）。"
      );
      lines.push("");
      lines.push(
        "如果仍读不到账号，通常是 Cookie 不完整/已过期，或网易云风控。请重新从浏览器复制整张 Cookies 表；也可以在「导入单曲」输入 `test` 查看 6 种请求形态的账号探测结果。"
      );
      lines.push("");
    }
    lines.push("每日推荐会按这份 Cookie 取账号数据。");
    lines.push("");
  }

  // Cookie 自检：直接告诉用户「粘进来的东西」有没有问题
  const diag = describeCookieDiagnostics();
  if (diag) {
    lines.push("---");
    lines.push("");
    lines.push(diag);
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("## 🔑 填 Cookie");
  lines.push("");
  lines.push(
    "插件管理 → 本插件卡片 → **用户变量** → 「网易云 Cookie」，粘贴从浏览器复制的 Cookie。"
  );
  lines.push("");
  lines.push("请**全选复制**整张 Cookies 表，确保包含完整的 `MUSIC_U`（约 800 字符）。");
  lines.push("");
  lines.push("仅封装网易云公开接口，不提供任何会员/付费歌曲的破解。");

  return lines.join("\n");
}

//#region 插件导出

/**
 * 插件实例。登录方式只有一种：在「用户变量 → 网易云 Cookie」里粘贴浏览器 Cookie。
 */
const pluginExports = {
  // 插件显示名沿用「网易云音乐」：
  // 它是媒体的身份主键，改名会导致已收藏的歌单/历史/已填的 Cookie 全部失联。
  platform: "网易云音乐",
  author: "qingniaoheyu",
  version: "0.7.1",
  description: buildPluginDescription(),
  primaryKey: ["id"],
  cacheControl: "no-cache",
  supportedSearchType: ["music", "album", "artist", "sheet"],
  defaultSearchType: "music",
  userVariables: [
    {
      key: "cookie",
      name: "网易云 Cookie",
      hint: buildCookieHint(),
    },
    {
      key: "bilibiliFallback",
      name: "B 站音源回退",
      hint: "可选，默认开启。填 1 = 网易云拿不到音源时自动去 B 站找同名音频并播放；填 0 = 关闭，只用网易云原生音源。",
    },
    {
      key: "bilibiliMp4",
      name: "改用 mp4 容器",
      hint: "可选，默认开启。1 = 用标准 mp4（兼容性最好，体积较大）；0 = 用 dash 分片 m4s（省流量，但部分播放器可能报 Source error）。",
    },
  ],
  hints: {
    importMusicSheet: [
      "支持粘贴网易云歌单链接，例如：",
      "https://music.163.com/#/playlist?id=3778678",
      "或直接粘贴歌单 id：3778678",
      "最多导入 1000 首。",
    ],
    importMusicItem: [
      "支持粘贴网易云单曲链接，例如：",
      "https://music.163.com/#/song?id=186016",
      "或直接粘贴歌曲 id：186016",
      "",
      "隐藏命令：",
      "· 输入 test —— 检测登录 Cookie 是否有效（结果会显示在弹窗里）",
      "· 输入 login —— 扫码登录网易云（二维码显示在插件说明 ? 里）",
    ],
  },

  async search(query, page, type) {
    const currentPage = page || 1;
    if (type === "album") {
      return searchAlbum(query, currentPage);
    }
    if (type === "artist") {
      return searchArtist(query, currentPage);
    }
    if (type === "sheet") {
      return searchSheet(query, currentPage);
    }
    if (type === "music") {
      return searchMusic(query, currentPage);
    }
    return { isEnd: true, data: [] };
  },

  getMediaSource,
  getMusicInfo,
  getLyric,
  getAlbumInfo,
  getMusicSheetInfo,
  getArtistWorks,
  getMusicComments,
  getTopLists,
  getTopListDetail,
  getRecommendSheetTags,
  getRecommendSheetsByTag,
  importMusicSheet,
  importMusicItem,
};

/** 把当前登录状态（含昵称）写回「网易云 Cookie」提示与插件说明 */
function rebindCookieHint() {
  try {
    if (typeof pluginExports === "undefined" || !pluginExports) {
      return;
    }
    if (Array.isArray(pluginExports.userVariables)) {
      for (let i = 0; i < pluginExports.userVariables.length; i++) {
        if (pluginExports.userVariables[i].key === "cookie") {
          pluginExports.userVariables[i].hint = buildCookieHint();
          break;
        }
      }
    }
    pluginExports.description = buildPluginDescription();
  } catch (error) {
    // ignore
  }
}

/**
 * 加载后异步校验一次登录态：成功就把昵称显示到「说明」与「用户变量提示」里。
 * 失败静默，不影响插件加载。
 *
 * 同时跑一次「全组合探测」，把 6 种请求形态各自查到的账号记下来，
 * 直接显示在「?」里，用户不用手动输入 test。
 */
async function refreshLoginUi() {
  try {
    if (!getRawCookieInput()) {
      return;
    }
    await requestAccount();
    rebindCookieHint();

    /**
     * 账号读不到 → 自动清理设备残留会话再核验一次（每次运行只做一次）。
     * 这是「重启后账号又变回匿名设备」的根治尝试。
     */
    if (!(accountCache && accountCache.userId) && !autoCleanupState) {
      try {
        await tryAutoCleanup();
        rebindCookieHint();
      } catch (error) {
        // 忽略
      }
    }

    /**
     * ⚠️ 不再自动跑「全组合探测」。
     * 探测里的 eapi 请求会把设备会话 Cookie 写回手机网络层，
     * 导致用户 Cookie 的 MUSIC_U 又失效（账号变回设备匿名号）。
     * 现在只有用户主动在「导入单曲」里输入 `test` 才会跑。
     */
    if (false && !lastProbeResults) {
      try {
        lastProbeResults = await runFullAccountProbe();
        rebindCookieHint();
      } catch (error) {
        // 探测失败不影响主流程
      }
    }

    // 检测 Cookie 请求头是否真的发出去了（httpbin 是别的域名，无污染，保留）
    if (!lastEchoResult) {
      try {
        await probeCookieHeaderEcho();
        rebindCookieHint();
      } catch (error) {
        // 忽略
      }
    }
  } catch (error) {
    // ignore
  }
}

// 延迟一拍再执行，确保模块已完整导出；后台校验登录态以显示昵称
try {
  setTimeout(function () {
    refreshLoginUi().catch(function () {
      // 校验失败不影响使用
    });
  }, 0);
} catch (error) {
  // 某些沙箱没有 setTimeout：登录态会在打开榜单页时自动校验
}

module.exports = pluginExports;

//#endregion
