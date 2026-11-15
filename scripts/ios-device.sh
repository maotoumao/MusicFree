#!/usr/bin/env bash
#
# Build and install the Release app (including the Live Activity widget
# extension) on a physical iPhone.
#
# Prerequisites:
#   1. Xcode is signed in with an Apple ID (Xcode -> Settings -> Accounts),
#      so `security find-identity -v -p codesigning` lists an
#      "Apple Development" identity.
#   2. The iPhone is connected, trusted, and Developer Mode is enabled.
#
# Usage:
#   scripts/ios-device.sh                  # auto-detect team and device
#   scripts/ios-device.sh --list           # list identities/devices
#   scripts/ios-device.sh --check          # validate prerequisites only
#   scripts/ios-device.sh --device <id>    # pick a device by UDID/name
#   scripts/ios-device.sh --team <TEAMID>  # override the signing team
#   scripts/ios-device.sh --build-only
#   scripts/ios-device.sh --install-only
#   scripts/ios-device.sh --launch         # launch after installing
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE="$REPO_ROOT/ios/MusicFree.xcworkspace"
SCHEME="MusicFreeNew"
BUNDLE_ID="fun.upup.musicfree"
DERIVED_DATA="$REPO_ROOT/build/ios-device"

DEVICE_REQUEST=""
TEAM_ID=""
CONFIGURATION="Release"
BUILD=true
INSTALL=true
LAUNCH=false
CHECK_ONLY=false
LIST_ONLY=false

usage() {
    sed -n '2,21p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --device)
            DEVICE_REQUEST="${2:-}"
            [[ -n "$DEVICE_REQUEST" ]] || { echo "缺少 --device 的值" >&2; exit 2; }
            shift 2
            ;;
        --team)
            TEAM_ID="${2:-}"
            [[ -n "$TEAM_ID" ]] || { echo "缺少 --team 的值" >&2; exit 2; }
            shift 2
            ;;
        --configuration)
            CONFIGURATION="${2:-}"
            [[ -n "$CONFIGURATION" ]] || { echo "缺少 --configuration 的值" >&2; exit 2; }
            shift 2
            ;;
        --build-only)
            INSTALL=false
            shift
            ;;
        --install-only)
            BUILD=false
            shift
            ;;
        --launch)
            LAUNCH=true
            shift
            ;;
        --check)
            CHECK_ONLY=true
            shift
            ;;
        --list)
            LIST_ONLY=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "未知参数: $1" >&2
            usage >&2
            exit 2
            ;;
    esac
done

require() {
    command -v "$1" >/dev/null 2>&1 || {
        echo "缺少命令: $1" >&2
        exit 1
    }
}

require xcodebuild
require xcrun
require security
require python3
require codesign

[[ -d "$WORKSPACE" ]] || {
    echo "找不到 $WORKSPACE，请先在 ios/ 下执行 pod install" >&2
    exit 1
}

find_team() {
    local identity team
    identity="$(security find-identity -v -p codesigning 2>/dev/null \
        | sed -n 's/.*"\(Apple Development:.*\)"/\1/p' | head -1)"
    if [[ -z "$identity" ]]; then
        return 1
    fi
    team="$(printf '%s\n' "$identity" | sed -n 's/.*(\([A-Z0-9]\{10\}\)).*/\1/p')"
    if [[ -z "$team" ]]; then
        return 1
    fi
    printf '%s\t%s\n' "$team" "$identity"
}

list_identities() {
    security find-identity -v -p codesigning 2>/dev/null || true
}

# Prints "<udid>\t<name>" for a single matching physical, connected iPhone.
# Exits non-zero and prints candidates when the match is ambiguous.
pick_device() {
    local json
    json="$(mktemp "${TMPDIR:-/tmp}/musicfree-devices.XXXXXX.json")"
    trap 'rm -f "$json"' RETURN
    xcrun devicectl list devices --json-output "$json" >/dev/null 2>&1 || {
        echo "无法读取设备列表，请确认 Xcode 与 iPhone 连接正常" >&2
        return 1
    }
    python3 - "$json" "$DEVICE_REQUEST" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    payload = json.load(handle)
requested = (sys.argv[2] or "").strip().lower()
devices = payload.get("result", {}).get("devices", [])

physical = []
for device in devices:
    properties = device.get("properties", {})
    hardware = properties.get("hardware", {})
    connection = properties.get("connection", {})
    state = properties.get("state", {})
    # devicectl also lists CoreSimulator devices; never install on those.
    if hardware.get("reality") == "simulated":
        continue
    if connection.get("state") != "connected":
        continue
    udid = device.get("identifier") or hardware.get("udid") or ""
    name = state.get("name") or hardware.get("marketingName") or udid
    physical.append((udid, name))

if requested:
    matches = [
        item for item in physical
        if requested == item[0].lower()
        or item[0].lower().startswith(requested)
        or requested in item[1].lower()
    ]
else:
    matches = physical

if not matches:
    if physical:
        print("找到多个已连接的 iPhone，请用 --device 指定：", file=sys.stderr)
        for udid, name in physical:
            print(f"  {name}  {udid}", file=sys.stderr)
    else:
        print("没有找到已连接的物理 iPhone（模拟器不算）。", file=sys.stderr)
        print("请用数据线连接手机、点信任，并打开开发者模式。", file=sys.stderr)
    sys.exit(1)

if len(matches) > 1:
    print("设备名不唯一，请改用 UDID：", file=sys.stderr)
    for udid, name in matches:
        print(f"  {name}  {udid}", file=sys.stderr)
    sys.exit(1)

udid, name = matches[0]
print(f"{udid}\t{name}")
PY
}

if [[ "$LIST_ONLY" == true ]]; then
    echo "== 本机签名身份 =="
    list_identities
    echo
    echo "== 已连接的物理 iPhone =="
    DEVICE_REQUEST="" pick_device || true
    echo
    echo "提示：模拟器不会出现在上面的物理设备列表里。"
    exit 0
fi

if [[ -z "$TEAM_ID" ]]; then
    if team_info="$(find_team)"; then
        TEAM_ID="${team_info%%$'\t'*}"
        IDENTITY_NAME="${team_info#*$'\t'}"
    else
        echo "未找到 Apple Development 签名证书。" >&2
        echo "请先在 Xcode -> Settings -> Accounts 登录 Apple ID，并让 Xcode 生成证书。" >&2
        echo "详见 ios/HANDOFF.md 的「真机调试步骤」。" >&2
        exit 1
    fi
fi

if [[ -z "${IDENTITY_NAME:-}" ]]; then
    IDENTITY_NAME="$(list_identities | sed -n 's/.*"\(Apple Development:.*\)"/\1/p' | head -1)"
fi

if ! device_info="$(pick_device)"; then
    exit 1
fi
DEVICE_UDID="${device_info%%$'\t'*}"
DEVICE_NAME="${device_info#*$'\t'}"

echo "签名团队: $TEAM_ID"
[[ -n "${IDENTITY_NAME:-}" ]] && echo "签名身份: $IDENTITY_NAME"
echo "目标设备: $DEVICE_NAME ($DEVICE_UDID)"
echo "构建配置: $CONFIGURATION"

if [[ "$CHECK_ONLY" == true ]]; then
    echo "检查通过：可以执行 scripts/ios-device.sh 构建并安装。"
    exit 0
fi

if [[ "$BUILD" == true ]]; then
    mkdir -p "$DERIVED_DATA"
    echo "开始构建（首次构建会生成 App 与 Widget Extension 的描述文件）..."
    set +e
    xcodebuild \
        -workspace "$WORKSPACE" \
        -scheme "$SCHEME" \
        -configuration "$CONFIGURATION" \
        -destination "id=$DEVICE_UDID" \
        -derivedDataPath "$DERIVED_DATA" \
        -allowProvisioningUpdates \
        -allowProvisioningDeviceRegistration \
        DEVELOPMENT_TEAM="$TEAM_ID" \
        CODE_SIGN_STYLE=Automatic \
        build 2>&1 | tee "$DERIVED_DATA/build.log"
    build_status=${PIPESTATUS[0]}
    set -e
    if [[ "$build_status" -ne 0 ]]; then
        echo "构建失败，完整日志见 $DERIVED_DATA/build.log" >&2
        exit "$build_status"
    fi
fi

APP_PATH="$DERIVED_DATA/Build/Products/${CONFIGURATION}-iphoneos/MusicFree.app"
APPEX_PATH="$APP_PATH/PlugIns/MusicFreeLiveActivity.appex"

[[ -d "$APP_PATH" ]] || {
    echo "找不到构建产物 $APP_PATH" >&2
    exit 1
}
[[ -d "$APPEX_PATH" ]] || {
    echo "App 内没有 Live Activity Extension，请检查构建产物" >&2
    exit 1
}

echo "检查签名..."
codesign --verify --deep --strict "$APP_PATH"
echo "App:"
codesign -dv --verbose=2 "$APP_PATH" 2>&1 | grep -E "Identifier|Authority|TeamIdentifier" || true
echo "Widget Extension:"
codesign -dv --verbose=2 "$APPEX_PATH" 2>&1 | grep -E "Identifier|Authority|TeamIdentifier" || true

if [[ "$INSTALL" == true ]]; then
    echo "安装到 $DEVICE_NAME..."
    xcrun devicectl device install app \
        --device "$DEVICE_UDID" \
        "$APP_PATH"

    if [[ "$LAUNCH" == true ]]; then
        echo "启动 $BUNDLE_ID..."
        xcrun devicectl device process launch \
            --device "$DEVICE_UDID" \
            "$BUNDLE_ID"
    else
        echo "安装完成。加 --launch 可直接启动。"
    fi
fi
