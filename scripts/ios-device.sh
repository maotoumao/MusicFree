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
#   scripts/ios-device.sh --no-launch      # do not launch after installing
#
# Environment overrides:
#   MUSICFREE_TEAM_ID        signing team (fallback: DEVELOPMENT_TEAM)
#   MUSICFREE_DEVICE         device UDID or name (same as --device)
#   MUSICFREE_CONFIGURATION  Debug or Release (default Release)
#   MUSICFREE_BUNDLE_ID      bundle id used on launch (default fun.upup.musicfree)
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE="$REPO_ROOT/ios/MusicFree.xcworkspace"
SCHEME="MusicFreeNew"
BUNDLE_ID="${MUSICFREE_BUNDLE_ID:-fun.upup.musicfree}"
DERIVED_DATA="$REPO_ROOT/build/ios-device"

DEVICE_REQUEST="${MUSICFREE_DEVICE:-}"
TEAM_ID="${MUSICFREE_TEAM_ID:-${DEVELOPMENT_TEAM:-}}"
CONFIGURATION="${MUSICFREE_CONFIGURATION:-Release}"
BUILD=true
INSTALL=true
LAUNCH=true
CHECK_ONLY=false
LIST_ONLY=false

usage() {
    cat <<'EOF'
Build and install the Release app (with the Live Activity extension) on a
physical iPhone.

Usage:
  scripts/ios-device.sh                  auto-detect team and device
  scripts/ios-device.sh --list           list signing identities and devices
  scripts/ios-device.sh --check          validate prerequisites only
  scripts/ios-device.sh --device <id>    pick a device by UDID/name
  scripts/ios-device.sh --team <TEAMID>  override the signing team
  scripts/ios-device.sh --configuration <Debug|Release>
  scripts/ios-device.sh --build-only     build, do not install
  scripts/ios-device.sh --install-only   install the existing build
  scripts/ios-device.sh --no-launch      do not launch after installing
                                     (launching is the default)

Environment overrides:
  MUSICFREE_TEAM_ID        signing team (fallback: DEVELOPMENT_TEAM)
  MUSICFREE_DEVICE         device UDID or name
  MUSICFREE_CONFIGURATION  Debug or Release
  MUSICFREE_BUNDLE_ID      bundle id used on launch
EOF
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
        --no-launch)
            LAUNCH=false
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
    local identity subject team profile profile_dir
    identity="$(security find-identity -v -p codesigning 2>/dev/null \
        | sed -n 's/.*"\(Apple Development:.*\)"/\1/p' | head -1)"
    if [[ -z "$identity" ]]; then
        return 1
    fi

    # 1. Team ID is the certificate subject's OU field. The value in the
    #    CN parentheses (e.g. "(7C4Q7824B6)") is the certificate ID, not
    #    a team ID; never use it for DEVELOPMENT_TEAM.
    subject="$(security find-certificate -c "$identity" -p 2>/dev/null \
        | openssl x509 -noout -subject -nameopt RFC2253 2>/dev/null || true)"
    team="$(printf '%s\n' "$subject" \
        | sed -n 's/.*OU=\([A-Z0-9]\{10\}\).*/\1/p' | head -1)"
    if [[ -n "$team" ]]; then
        printf '%s\t%s\n' "$team" "$identity"
        return 0
    fi

    # 2. Fallback: read TeamIdentifier from the newest provisioning profile.
    profile_dir="$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"
    if [[ -d "$profile_dir" ]]; then
        shopt -s nullglob
        local profiles=("$profile_dir"/*.mobileprovision)
        shopt -u nullglob
        if (( ${#profiles[@]} > 0 )); then
            while IFS= read -r profile; do
                [[ -n "$profile" ]] || continue
                team="$(security cms -D -i "$profile" 2>/dev/null \
                    | plutil -extract TeamIdentifier.0 raw -o - - 2>/dev/null || true)"
                if [[ "$team" =~ ^[A-Z0-9]{10}$ ]]; then
                    printf '%s\t%s\n' "$team" "$identity"
                    return 0
                fi
            done < <(ls -t "${profiles[@]}" 2>/dev/null)
        fi
    fi
    return 1
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
connected = []
for device in devices:
    properties = device.get("properties", {})
    hardware = properties.get("hardware", {})
    connection = properties.get("connection", {})
    state = properties.get("state", {})
    # devicectl also lists CoreSimulator devices; never install on those.
    if hardware.get("reality") == "simulated":
        continue
    udid = device.get("identifier") or hardware.get("udid") or ""
    name = state.get("name") or hardware.get("marketingName") or udid
    physical.append((udid, name, connection))
    if connection.get("state") == "connected":
        connected.append((udid, name, connection))


def transport(connection):
    return (connection.get("transportType") or "").lower() or "unknown"


def network_rank(connection):
    # Prefer Wi-Fi / network connections; a wired device is still usable.
    return 0 if transport(connection) != "wired" else 1


if requested:
    matches = [
        item for item in connected
        if requested == item[0].lower()
        or item[0].lower().startswith(requested)
        or requested in item[1].lower()
    ]
else:
    matches = connected

matches.sort(key=lambda item: (network_rank(item[2]), item[1].lower()))

if not matches:
    if connected:
        print("没有匹配的已连接 iPhone，请用 --device 指定：", file=sys.stderr)
        for udid, name, connection in connected:
            print(f"  {name}  {udid}  transport={transport(connection)}", file=sys.stderr)
    elif physical:
        print("检测到物理 iPhone，但没有可用连接（手机可能不在同一 Wi-Fi、未解锁或未信任）：", file=sys.stderr)
        for udid, name, connection in physical:
            pairing = connection.get("pairingState", "unknown")
            print(
                f"  {name}  {udid}  (pairing={pairing}, transport={transport(connection)})",
                file=sys.stderr,
            )
        print("请在手机上解锁、点「信任」，并在 Xcode 的 Window -> Manage Devices 中开启 Wi-Fi 连接。", file=sys.stderr)
    else:
        print("没有找到物理 iPhone（模拟器不算）。", file=sys.stderr)
        print("请确认手机与 Mac 在同一 Wi-Fi（或插线）、已解锁并信任这台 Mac。", file=sys.stderr)
    sys.exit(1)

if len(matches) > 1:
    print("设备名不唯一，请改用 UDID：", file=sys.stderr)
    for udid, name, connection in matches:
        print(f"  {name}  {udid}  transport={transport(connection)}", file=sys.stderr)
    sys.exit(1)

udid, name, _ = matches[0]
print(f"{udid}\t{name}")
PY
}

show_build_hints() {
    local log="$1"
    echo "构建失败，完整日志见 $log" >&2
    if grep -qiE "No Account for Team|not signed in|Unable to find a team" "$log"; then
        cat >&2 <<'MSG'
[Apple ID] Xcode 里没有该签名团队的账号，无法自动换新描述文件。
  1. Xcode -> Settings -> Accounts 登录 Apple ID
  2. 确认账号属于该团队，然后重跑 scripts/ios-refresh.sh
MSG
    fi
    if grep -qiE "No signing certificate|No profiles for|requires a development team|does not have a membership" "$log"; then
        cat >&2 <<'MSG'
[签名] 没有可用的 Apple Development 证书或描述文件。
  1. Xcode -> Settings -> Accounts 登录 Apple ID（免费账号即可）
  2. Xcode -> Manage Certificates -> + -> Apple Development
  3. 重新执行 scripts/ios-device.sh
MSG
    fi
    if grep -qiE "bundle identifier|bundle ID|is not available|already (registered|in use)" "$log"; then
        cat >&2 <<'MSG'
[Bundle ID] App ID 注册冲突。fun.upup.musicfree 可能已被其他账号占用，
或同类 App ID 已存在。可在 Apple Developer 后台检查 App ID，
或修改 MusicFree / MusicFreeLiveActivity 两个 target 的 PRODUCT_BUNDLE_IDENTIFIER。
MSG
    fi
    if grep -qiE "Developer Mode|developer mode" "$log"; then
        echo "[开发者模式] 请在 iPhone 设置 -> 隐私与安全性 -> 开发者模式 打开并重启手机。" >&2
    fi
    if grep -qiE "Unable to connect|not connected|No devices|device.*unavailable" "$log"; then
        echo "[设备] 未检测到可用 iPhone，请确认手机与 Mac 在同一 Wi-Fi（或插线）、已解锁并信任。" >&2
    fi
}

show_install_hints() {
    local log="$1"
    echo "安装失败，输出见 $log" >&2
    if grep -qiE "Developer Mode|developer mode" "$log"; then
        echo "[开发者模式] 请在 iPhone 设置 -> 隐私与安全性 -> 开发者模式 打开并重启手机。" >&2
    elif grep -qiE "bundle identifier|bundle ID|already (installed|in use)|application-identifier|conflict" "$log"; then
        cat >&2 <<'MSG'
[Bundle ID] 安装被拒绝，通常是 App ID / 描述文件冲突。
  1. 确认 fun.upup.musicfree 在当前签名团队下已注册
  2. 若被其他账号占用，修改两个 target 的 PRODUCT_BUNDLE_IDENTIFIER
  3. 删掉手机上的旧版本后再装
MSG
    elif grep -qiE "Unable to connect|not connected|No devices|device.*unavailable" "$log"; then
        echo "[设备] 安装时设备不可用，请重新连接、解锁手机并确认开发者模式。" >&2
    else
        echo "可在 Xcode 的 Window -> Manage Devices 查看设备日志。" >&2
    fi
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

if [[ "$BUILD" == true ]]; then
    if [[ -z "$TEAM_ID" ]]; then
        if team_info="$(find_team)"; then
            TEAM_ID="${team_info%%$'\t'*}"
            IDENTITY_NAME="${team_info#*$'\t'}"
        else
            echo "未找到 Apple Development 签名证书。" >&2
            echo "请先在 Xcode -> Settings -> Accounts 登录 Apple ID，并让 Xcode 生成证书。" >&2
            echo "也可以用 MUSICFREE_TEAM_ID 或 --team 显式指定团队。" >&2
            echo "详见 ios/HANDOFF.md 的「真机调试步骤」。" >&2
            exit 1
        fi
    fi
    if [[ -z "${IDENTITY_NAME:-}" ]]; then
        IDENTITY_NAME="$(list_identities | sed -n 's/.*"\(Apple Development:.*\)"/\1/p' | head -1)"
    fi
fi

if [[ "$INSTALL" == true ]]; then
    if ! device_info="$(pick_device)"; then
        exit 1
    fi
    DEVICE_UDID="${device_info%%$'\t'*}"
    DEVICE_NAME="${device_info#*$'\t'}"
fi

echo "签名团队: ${TEAM_ID:-（只安装，不需要签名）}"
[[ -n "${IDENTITY_NAME:-}" ]] && echo "签名身份: $IDENTITY_NAME"
[[ -n "${DEVICE_NAME:-}" ]] && echo "目标设备: $DEVICE_NAME ($DEVICE_UDID)"
echo "构建配置: $CONFIGURATION"

if [[ "$CHECK_ONLY" == true ]]; then
    if [[ "$BUILD" == true && "$INSTALL" == true ]]; then
        echo "检查通过：可以执行 scripts/ios-device.sh 构建并安装。"
    elif [[ "$BUILD" == true ]]; then
        echo "检查通过：可以执行 scripts/ios-device.sh --build-only。"
    else
        echo "检查通过：可以执行 scripts/ios-device.sh --install-only。"
    fi
    exit 0
fi

BUILD_LOG="$DERIVED_DATA/build.log"
INSTALL_LOG="$DERIVED_DATA/install.log"

run_build() {
    local destination="$1"
    set +e
    xcodebuild \
        -workspace "$WORKSPACE" \
        -scheme "$SCHEME" \
        -configuration "$CONFIGURATION" \
        -destination "$destination" \
        -derivedDataPath "$DERIVED_DATA" \
        -allowProvisioningUpdates \
        -allowProvisioningDeviceRegistration \
        DEVELOPMENT_TEAM="$TEAM_ID" \
        CODE_SIGN_STYLE=Automatic \
        build 2>&1 | tee "$BUILD_LOG"
    local status=${PIPESTATUS[0]}
    set -e
    return "$status"
}

if [[ "$BUILD" == true ]]; then
    mkdir -p "$DERIVED_DATA"
    echo "开始构建（App 与 MusicFreeLiveActivity 都使用自动签名）..."
    if ! run_build "generic/platform=iOS"; then
        # A free account may have no development profile yet. Building for the
        # connected device lets xcodebuild register it and create the profile.
        if [[ -n "${DEVICE_UDID:-}" ]] && grep -qiE "No profiles for|provisioning|requires a development team|signing certificate" "$BUILD_LOG"; then
            echo "generic/platform=iOS 无法生成开发描述文件，改用已连接设备重试..." >&2
            if ! run_build "id=$DEVICE_UDID"; then
                show_build_hints "$BUILD_LOG"
                exit 1
            fi
        else
            show_build_hints "$BUILD_LOG"
            exit 1
        fi
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
    set +e
    xcrun devicectl device install app \
        --device "$DEVICE_UDID" \
        "$APP_PATH" 2>&1 | tee "$INSTALL_LOG"
    install_status=${PIPESTATUS[0]}
    set -e
    if [[ "$install_status" -ne 0 ]]; then
        show_install_hints "$INSTALL_LOG"
        exit "$install_status"
    fi

    if [[ "$LAUNCH" == true ]]; then
        echo "启动 $BUNDLE_ID..."
        set +e
        xcrun devicectl device process launch \
            --device "$DEVICE_UDID" \
            "$BUNDLE_ID" 2>&1 | tee "$DERIVED_DATA/launch.log"
        launch_status=${PIPESTATUS[0]}
        set -e
        if [[ "$launch_status" -ne 0 ]]; then
            if grep -qiE "Locked|not, or could not be, unlocked" "$DERIVED_DATA/launch.log"; then
                echo "启动失败：手机锁屏。请解锁 iPhone 后重跑，或加 --no-launch 只安装。" >&2
            else
                echo "启动失败；确认 $BUNDLE_ID 已安装，且手机已解锁。" >&2
            fi
            exit "$launch_status"
        fi
    else
        echo "安装完成（--no-launch 已跳过启动）。"
    fi
fi
