#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""MusicFree CarWith 成品 APK 自查（只读；全部 PASS 才谈装车）

用法： python check_apk.py <apk 路径>
同一套断言的 PowerShell 版是 check_apk.ps1（Windows 上顺手），两者的期望值应当一致。

两段式探针：
  · classes*.dex 里是 MUTF-8    ⇒ 键名、类名、方法名按 UTF-8 找
  · Hermes 字节码的字符串表里 ASCII 走 UTF-8、**含非 ASCII 的串走 UTF-16LE**
    ⇒ 中文文案必须按 UTF-16LE 找（按 UTF-8 找必然 FAIL，这是最容易抄错的一条）
"""

import glob
import hashlib
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

DEBUG_CERT = "fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c"
FAILS = []
INFO = []


def check(name, ok, detail=""):
    print(("  PASS  %-46s %s" % (name, detail)) if ok
          else ("  FAIL  %-46s %s" % (name, detail)))
    if not ok:
        FAILS.append(name)


def find(hay, needle):
    """按 UTF-8 与 UTF-16LE 各找一遍，命中就报口径。"""
    for enc, tag in (("utf-8", "UTF-8"), ("utf-16-le", "UTF-16LE")):
        if needle.encode(enc) in hay:
            return tag
    return None


def run(cmd):
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        return (p.stdout or "") + (p.stderr or ""), p.returncode
    except Exception as e:                      # 工具没装：不算 FAIL，算 SKIP
        return "%s" % e, 99


def tool(name):
    for base in (os.environ.get("ANDROID_HOME"), os.environ.get("ANDROID_SDK_ROOT")):
        if not base:
            continue
        hit = glob.glob(os.path.join(base, "**", name), recursive=True)
        if hit:
            return hit[0]
    return shutil.which(name) or shutil.which(name + ".bat")


def main():
    apk = Path(sys.argv[1] if len(sys.argv) > 1 else "")
    if not apk.is_file():
        print(__doc__)
        return 2
    print("APK：%s" % apk)
    raw = apk.read_bytes()
    print("     bytes=%d sha256=%s" % (len(raw), hashlib.sha256(raw).hexdigest()))

    work = Path(tempfile.mkdtemp(prefix="mf_carwith_"))
    try:
        with zipfile.ZipFile(apk) as z:
            names = [n for n in z.namelist()
                     if re.match(r"classes\d*\.dex$", n) or n.endswith(".bundle")]
            for n in names:
                z.extract(n, work)
        dex = sorted(work.glob("classes*.dex"))
        bundles = list(work.glob("*.bundle")) + list(work.glob("**/*.bundle"))
        bundles = sorted(set(bundles))

        print("\n[1] 解包")
        check("classes*.dex", len(dex) >= 1, "共 %d 个" % len(dex))
        check("JS bundle", bool(bundles), bundles[0].name if bundles else "")
        if not dex or not bundles:
            raise SystemExit("解包不完整")

        dex_b = [d.read_bytes() for d in dex]
        bun_b = [b.read_bytes() for b in bundles]

        print("\n[2] 车机侧键名（dex）—— 改一个字车机就读不到")
        for k in ["ucar.media.metadata.LYRICS_WHOLE", "ucar.media.metadata.LYRICS_LINE",
                  "ucar.media.metadata.LYRICS_STATUS", "android.media.metadata.LYRICS"]:
            hit = [find(b, k) for b in dex_b]
            check(k, any(hit), next((h for h in hit if h), ""))

        print("\n[3] 连接判据与车机深浅键（dex）")
        for k in ["ucar_night_mode", "com.miui.carlink", "com.xiaomi.ucar.minimap"]:
            check(k, any(find(b, k) for b in dex_b))
        check("反向：com.autonavi.minimap 不在 dex 里",
              not any(find(b, "com.autonavi.minimap") for b in dex_b))

        print("\n[4] 类名 / 方法名 / 事件名 + 加固提示串（dex）")
        for k in ["CarWithLyric", "CarWithState", "CarWithStateModule",
                  "setCarWithLyric", "setLyricEnabled", "setFollowTheme",
                  "onCarWithStateChange"]:
            check(k, any(find(b, k) for b in dex_b))
        # 这八条在，说明「适配代码出错就吞掉并留一行 log」的加固真的进了包
        # 最后一条同时是递归修复的凭证：provider 只能在 publish 的 gated 分支里装
        for k in ["attach 失败（已忽略，不影响播放）",
                  "clearLyric 失败（已忽略，不影响播放）",
                  "update 失败（已忽略，不影响播放）",
                  "publish 跳过（不影响手机播放）",
                  "provider 跳过（不影响手机播放）",
                  "setConnected 失败（已忽略）",
                  "setEnabled 失败（已忽略）",
                  "provider 装不上（已忽略，逐句那一路不受影响）"]:
            check("加固 " + k, any(find(b, k) for b in dex_b))

        print("\n[5] JS 侧配置键（bundle，ASCII ⇒ UTF-8）")
        for k in ["lyric.showCarWithLyric", "theme.followCarWith",
                  "basicSettings.lyric.showCarWithLyric", "themeSettings.followCarWithTheme"]:
            check(k, any(find(b, k) for b in bun_b))

        print("\n[6] 中文文案（bundle，非 ASCII ⇒ UTF-16LE）")
        for k in ["车机投屏歌词（CarWith）", "跟随CarWith车机深浅色",
                  "車機投屏歌詞（CarWith）", "Car head-unit lyrics (CarWith)"]:
            hit = [find(b, k) for b in bun_b]
            check(k, any(hit), next((h for h in hit if h), ""))

        print("\n[7] 签名")
        apksigner = tool("apksigner")
        if apksigner:
            out, _ = run([apksigner, "verify", "--print-certs", str(apk)])
            check("签名有效", "DOES NOT VERIFY" not in out)
            check("公签 = 仓库自带 debug.keystore", DEBUG_CERT in out.replace(" ", ""),
                  out.splitlines()[2].strip() if len(out.splitlines()) > 2 else "")
        else:
            print("  SKIP  没找到 apksigner")

        print("\n[8] 清单")
        aapt2 = tool("aapt2")
        if aapt2:
            out, _ = run([aapt2, "dump", "badging", str(apk)])
            check("applicationId = fun.upup.musicfree",
                  "package: name='fun.upup.musicfree'" in out)
            m = re.search(r"versionCode='(\d+)' versionName='([^']+)'", out)
            check("versionName / versionCode", bool(m), m.group(0) if m else "")
            nc = re.search(r"native-code: [^\n]*", out)
            check("native-code 只有 arm64-v8a",
                  (nc.group(0) if nc else "") == "native-code: 'arm64-v8a'",
                  nc.group(0) if nc else "(没有 native-code 行)")
        else:
            print("  SKIP  没找到 aapt2")

        print("\n[9] 内部产物（重做一致性就看这两个）")
        main_dex = max(dex_b, key=len)
        INFO.append(("classes.dex(最大)", len(main_dex), hashlib.sha256(main_dex).hexdigest()))
        INFO.append((bundles[0].name, len(bun_b[0]), hashlib.sha256(bun_b[0]).hexdigest()))
        for name, size, sha in INFO:
            print("  INFO  %-26s bytes %9d  sha256 %s" % (name, size, sha))
    finally:
        shutil.rmtree(work, ignore_errors=True)

    print()
    if FAILS:
        print("FAIL x %d：%s" % (len(FAILS), ", ".join(FAILS)))
        return 1
    print("ALL PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
