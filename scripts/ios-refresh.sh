#!/usr/bin/env bash
#
# Weekly free-account renewal for the physical iPhone.
#
# Builds the Release app with automatic signing, lets Xcode renew the
# development provisioning profiles, installs over the existing app (same
# bundle id, so data is kept), then tries to launch it once.
#
# The install is what renews the profile, so a locked phone (launch refused)
# is still a successful renewal; the result line just notes it. Only launch
# errors that mean the app is unusable (not installed, signature mismatch)
# fail the run.
#
# Usage:
#   scripts/ios-refresh.sh
#   scripts/ios-refresh.sh --device "My iPhone"
#   scripts/ios-refresh.sh --team ABCDE12345
#   scripts/ios-refresh.sh --configuration Release
#
# Environment overrides:
#   MUSICFREE_DEVICE         device UDID or name
#   MUSICFREE_TEAM_ID        signing team (fallback: DEVELOPMENT_TEAM)
#   MUSICFREE_CONFIGURATION  Debug or Release (default Release)
#   MUSICFREE_FORCE_PROFILE  1 (default) rotates this app's old profiles so
#                            Xcode must fetch fresh ones; 0 keeps them.
#
# Logs are kept under build/ios-device/. Only the final result line is
# printed, so a scheduled job can forward stdout directly to the user.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEVICE_SCRIPT="$REPO_ROOT/scripts/ios-device.sh"
LOG_DIR="$REPO_ROOT/build/ios-device"
STAMP="$(date +%Y%m%d-%H%M%S)"
RUN_LOG="$LOG_DIR/refresh-$STAMP.log"
CHECK_LOG="$LOG_DIR/refresh-check-$STAMP.log"

DEVICE_REQUEST="${MUSICFREE_DEVICE:-}"
TEAM_ID="${MUSICFREE_TEAM_ID:-${DEVELOPMENT_TEAM:-}}"
CONFIGURATION="${MUSICFREE_CONFIGURATION:-Release}"
FORCE_PROFILE="${MUSICFREE_FORCE_PROFILE:-1}"
BUNDLE_ID="${MUSICFREE_BUNDLE_ID:-fun.upup.musicfree}"

usage() {
    cat <<'EOF'
每周续签并覆盖安装到物理 iPhone（保留 App 数据）。

用法:
  scripts/ios-refresh.sh
  scripts/ios-refresh.sh --device <UDID或名称>
  scripts/ios-refresh.sh --team <TEAMID>
  scripts/ios-refresh.sh --configuration <Debug|Release>
  scripts/ios-refresh.sh --no-force-profile

环境变量:
  MUSICFREE_DEVICE, MUSICFREE_TEAM_ID, MUSICFREE_CONFIGURATION,
  MUSICFREE_FORCE_PROFILE（默认 1）

默认会先把本 App 的旧 profile 移到 build/ios-profile-backup-*，
强制 Xcode 向 Apple 换新；失败会自动恢复旧 profile。

安装成功即视为续签成功；装完会尝试打开 App 一次，手机锁屏时只在
结果行末尾加「（手机锁着，没自动打开）」，退出码仍为 0。

成功时只输出一行:
  续签成功 team=... device=... 耗时 ... 新到期 Nov 22 20:48
失败时最后一行输出原因，并以非 0 退出。
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --device)
            DEVICE_REQUEST="${2:-}"
            if [[ -z "$DEVICE_REQUEST" ]]; then
                echo "续签失败: 缺少 --device 的值"
                exit 1
            fi
            shift 2
            ;;
        --team)
            TEAM_ID="${2:-}"
            if [[ -z "$TEAM_ID" ]]; then
                echo "续签失败: 缺少 --team 的值"
                exit 1
            fi
            shift 2
            ;;
        --configuration)
            CONFIGURATION="${2:-}"
            if [[ -z "$CONFIGURATION" ]]; then
                echo "续签失败: 缺少 --configuration 的值"
                exit 1
            fi
            shift 2
            ;;
        --force-profile)
            FORCE_PROFILE=1
            shift
            ;;
        --no-force-profile)
            FORCE_PROFILE=0
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "续签失败: 未知参数 $1"
            exit 1
            ;;
    esac
done

mkdir -p "$LOG_DIR"

human_reason() {
    local log="$1"
    local line

    if grep -q "No Account for Team" "$log" 2>/dev/null; then
        echo "Xcode 未登录该签名团队账号，无法自动换新描述文件"
        return
    fi
    if grep -q "No profiles for" "$log" 2>/dev/null; then
        echo "无法生成开发描述文件，请检查 Xcode 账号和证书"
        return
    fi
    if grep -qiE "not, or could not be, unlocked|BSErrorCodeDescription = Locked" "$log" 2>/dev/null; then
        echo "手机未解锁，安装完成但启动失败；解锁后重跑"
        return
    fi
    if grep -qiE "No devices|Unable to connect|not connected|device.*unavailable|没有找到(已连接的|物理) ?iPhone|没有可用连接" "$log" 2>/dev/null; then
        echo "没找到已连接的 iPhone，请确认手机与 Mac 在同一 Wi-Fi（或插线）、已解锁并信任"
        return
    fi
    if grep -q "设备名不唯一" "$log" 2>/dev/null; then
        echo "找到多台 iPhone，请用 --device 指定目标"
        return
    fi
    if grep -qiE "No signing certificate|codesign failed|CodeSign failed" "$log" 2>/dev/null; then
        echo "签名证书不可用，请在 Xcode 检查 Apple Development 证书"
        return
    fi

    line="$(awk 'NF { line = $0 } END { print line }' "$log" 2>/dev/null \
        | sed -E 's/\x1B\[[0-9;]*[A-Za-z]//g' \
        | tr '\n' ' ' \
        | cut -c1-180)"
    echo "${line:-未知错误，请查看日志}"
}

# Reason for a launch that failed for something other than the lock screen.
launch_reason() {
    local log="$1"
    local line

    if grep -qiE "not installed|does not exist|unknown application|requested application" "$log" 2>/dev/null; then
        echo "App 可能没装上或 bundle id 不匹配"
        return
    fi
    if grep -qiE "code signature|signature invalid|invalid signature" "$log" 2>/dev/null; then
        echo "签名不匹配，系统拒绝启动"
        return
    fi
    if grep -qiE "No devices|Unable to connect|not connected|device.*unavailable" "$log" 2>/dev/null; then
        echo "手机连接中断，请确认同一 Wi-Fi（或插线）、已解锁并信任"
        return
    fi

    line="$(awk 'NF { line = $0 } END { print line }' "$log" 2>/dev/null \
        | sed -E 's/\x1B\[[0-9;]*[A-Za-z]//g' \
        | tr '\n' ' ' \
        | cut -c1-180)"
    echo "${line:-未知错误，请查看日志}"
}

finish_fail() {
    local reason="$1"
    local log="${2:-$RUN_LOG}"
    # If the build itself succeeded, the new profiles are valid even when the
    # launch was blocked by the lock screen; keep them. Only restore old
    # profiles when signing/build never produced a usable app.
    if grep -q '\*\* BUILD SUCCEEDED \*\*' "$RUN_LOG" 2>/dev/null; then
        cleanup_profile_backup
    else
        restore_app_profiles
    fi
    printf '续签失败: %s（日志 %s）\n' "$reason" "$log"
    exit 1
}

read_expiry() {
    local profile="$1"
    local date_value
    [[ -f "$profile" ]] || return 1
    date_value="$(security cms -D -i "$profile" 2>/dev/null \
        | plutil -extract ExpirationDate raw -o - - 2>/dev/null || true)"
    [[ -n "$date_value" ]] || return 1
    printf '%s\n' "$date_value"
}

# Profile expiry is UTC ISO (2026-11-22T12:48:48Z); show it in the Mac's
# local time so the result line reads naturally (Nov 22 20:48).
format_expiry() {
    local iso="$1"
    local epoch
    [[ -n "$iso" ]] || return 1
    epoch="$(date -j -u -f "%Y-%m-%dT%H:%M:%SZ" "$iso" "+%s" 2>/dev/null)" || return 1
    [[ -n "$epoch" ]] || return 1
    LC_ALL=C date -r "$epoch" "+%b %d %H:%M" 2>/dev/null
}

PROFILE_DIRS=(
    "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"
    "$HOME/Library/MobileDevice/Provisioning Profiles"
)
PROFILE_BACKUP=""
PROFILES_MOVED=0

is_app_profile() {
    local team="$1"
    local name="$2"
    [[ "$team" == "$TEAM_ID" && ( "$name" == *": fun.upup.musicfree" || "$name" == *": fun.upup.musicfree.liveactivity" ) ]]
}

# Xcode reuses a still-valid profile and does not extend its expiry just
# because -allowProvisioningUpdates is set. Move only this app's old profiles
# aside so automatic signing must fetch new ones. Any failure restores them.
backup_app_profiles() {
    [[ "$FORCE_PROFILE" == "1" ]] || return 0
    if pgrep -x xcodebuild >/dev/null 2>&1; then
        finish_fail "另一个 xcodebuild 正在运行，稍后再试"
    fi

    PROFILE_BACKUP="$REPO_ROOT/build/ios-profile-backup-$STAMP"
    mkdir -p "$PROFILE_BACKUP"
    local idx=0
    local dir backup_dir profile name team
    for dir in "${PROFILE_DIRS[@]}"; do
        if [[ ! -d "$dir" ]]; then
            idx=$((idx + 1))
            continue
        fi
        backup_dir="$PROFILE_BACKUP/$idx"
        mkdir -p "$backup_dir"
        while IFS= read -r -d '' profile; do
            name="$(security cms -D -i "$profile" 2>/dev/null \
                | plutil -extract Name raw -o - - 2>/dev/null || true)"
            team="$(security cms -D -i "$profile" 2>/dev/null \
                | plutil -extract TeamIdentifier.0 raw -o - - 2>/dev/null || true)"
            if is_app_profile "$team" "$name"; then
                mv "$profile" "$backup_dir/"
                PROFILES_MOVED=$((PROFILES_MOVED + 1))
            fi
        done < <(find "$dir" -maxdepth 1 -type f -name '*.mobileprovision' -print0 2>/dev/null)
        idx=$((idx + 1))
    done
}

remove_app_profiles() {
    local dir profile name team
    for dir in "${PROFILE_DIRS[@]}"; do
        [[ -d "$dir" ]] || continue
        while IFS= read -r -d '' profile; do
            name="$(security cms -D -i "$profile" 2>/dev/null \
                | plutil -extract Name raw -o - - 2>/dev/null || true)"
            team="$(security cms -D -i "$profile" 2>/dev/null \
                | plutil -extract TeamIdentifier.0 raw -o - - 2>/dev/null || true)"
            if is_app_profile "$team" "$name"; then
                rm -f "$profile"
            fi
        done < <(find "$dir" -maxdepth 1 -type f -name '*.mobileprovision' -print0 2>/dev/null)
    done
}

restore_app_profiles() {
    [[ -n "$PROFILE_BACKUP" && -d "$PROFILE_BACKUP" ]] || return 0
    # Drop any profiles the failed build managed to create, then put the
    # originals back so the installed app keeps a working signing identity.
    remove_app_profiles
    local idx=0
    local dir backup_dir profile
    for dir in "${PROFILE_DIRS[@]}"; do
        backup_dir="$PROFILE_BACKUP/$idx"
        if [[ -d "$backup_dir" ]]; then
            while IFS= read -r -d '' profile; do
                mv "$profile" "$dir/"
            done < <(find "$backup_dir" -maxdepth 1 -type f -name '*.mobileprovision' -print0 2>/dev/null)
        fi
        idx=$((idx + 1))
    done
    rm -rf "$PROFILE_BACKUP"
    PROFILE_BACKUP=""
}

cleanup_profile_backup() {
    [[ -n "$PROFILE_BACKUP" ]] || return 0
    rm -rf "$PROFILE_BACKUP"
    PROFILE_BACKUP=""
}

APP_PATH="$REPO_ROOT/build/ios-device/Build/Products/${CONFIGURATION}-iphoneos/MusicFree.app"
EMBEDDED_PROFILE="$APP_PATH/embedded.mobileprovision"
OLD_EXPIRY="$(read_expiry "$EMBEDDED_PROFILE" || true)"

START_EPOCH="$(date +%s)"

if [[ ! -x "$DEVICE_SCRIPT" ]]; then
    finish_fail "找不到可执行的 scripts/ios-device.sh"
fi

# Preflight: resolve the team from the certificate OU and pick one physical
# device, preferring a network connection over a wired one.
check_args=(--check)
if [[ -n "$DEVICE_REQUEST" ]]; then
    check_args+=(--device "$DEVICE_REQUEST")
fi
if [[ -n "$TEAM_ID" ]]; then
    check_args+=(--team "$TEAM_ID")
fi
if ! "$DEVICE_SCRIPT" "${check_args[@]}" >"$CHECK_LOG" 2>&1; then
    cat "$CHECK_LOG" >>"$RUN_LOG" 2>/dev/null || true
    finish_fail "$(human_reason "$CHECK_LOG")"
fi

TEAM_ID="$(sed -n 's/^签名团队: //p' "$CHECK_LOG" | head -1)"
DEVICE_LINE="$(sed -n 's/^目标设备: //p' "$CHECK_LOG" | head -1)"
DEVICE_NAME="$(printf '%s\n' "$DEVICE_LINE" | sed -n 's/^\(.*\) (.*)$/\1/p')"
DEVICE_UDID="$(printf '%s\n' "$DEVICE_LINE" | sed -n 's/^.* (\(.*\))$/\1/p')"

if [[ -z "$TEAM_ID" || -z "$DEVICE_UDID" ]]; then
    cat "$CHECK_LOG" >>"$RUN_LOG" 2>/dev/null || true
    finish_fail "预检没有解析出团队或设备，请查看日志"
fi

# Reuse the resolved values so the build cannot silently pick a different
# team/device between preflight and install. Rotate old app profiles first so
# -allowProvisioningUpdates actually fetches a new 7-day profile.
backup_app_profiles
{
    printf 'profile_backup=%s moved=%s force=%s\n' \
        "${PROFILE_BACKUP:-none}" "$PROFILES_MOVED" "$FORCE_PROFILE"
} >>"$RUN_LOG" 2>/dev/null || true

build_args=(--device "$DEVICE_UDID" --team "$TEAM_ID" --configuration "$CONFIGURATION" --no-launch)
if ! "$DEVICE_SCRIPT" "${build_args[@]}" >>"$RUN_LOG" 2>&1; then
    finish_fail "$(human_reason "$RUN_LOG")"
fi
cleanup_profile_backup

# The install above is the renewal. Try to open the app once; a locked phone
# only adds a note, it does not turn a successful renewal into a failure.
LAUNCH_NOTE=""
LAUNCH_LOG="$LOG_DIR/launch-$STAMP.log"
if ! xcrun devicectl device process launch \
        --device "$DEVICE_UDID" "$BUNDLE_ID" >"$LAUNCH_LOG" 2>&1; then
    if grep -qiE "Locked|not, or could not be, unlocked" "$LAUNCH_LOG"; then
        LAUNCH_NOTE="（手机锁着，没自动打开）"
    else
        finish_fail "安装完成但启动失败：$(launch_reason "$LAUNCH_LOG")" "$LAUNCH_LOG"
    fi
fi

END_EPOCH="$(date +%s)"
ELAPSED_SECONDS="$((END_EPOCH - START_EPOCH))"
ELAPSED="$(printf '%dm%02ds' "$((ELAPSED_SECONDS / 60))" "$((ELAPSED_SECONDS % 60))")"

NEW_EXPIRY="$(read_expiry "$EMBEDDED_PROFILE" || true)"
EXPIRY_LABEL="到期"
if [[ -n "$OLD_EXPIRY" && -n "$NEW_EXPIRY" && "$NEW_EXPIRY" > "$OLD_EXPIRY" ]]; then
    EXPIRY_LABEL="新到期"
fi
NEW_EXPIRY_HUMAN="$(format_expiry "$NEW_EXPIRY" || true)"
NEW_EXPIRY_HUMAN="${NEW_EXPIRY_HUMAN:-未知}"

printf '续签成功 team=%s device=%s 耗时 %s %s %s%s\n' \
    "$TEAM_ID" "$DEVICE_NAME" "$ELAPSED" "$EXPIRY_LABEL" "$NEW_EXPIRY_HUMAN" "$LAUNCH_NOTE"
