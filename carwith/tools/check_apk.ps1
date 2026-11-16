# MusicFree CarWith 成品 APK 自查（只读，不改 APK；全部 PASS 才谈装车）
# 用法： powershell -ExecutionPolicy Bypass -File check_apk.ps1 -Apk app-arm64-v8a-release.apk

param(
    [Parameter(Mandatory = $true)][string]$Apk,
    [string]$Work = "",
    [string]$DebugCert = "fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c"
)
$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $Apk)) { throw "APK 不存在：$Apk" }
if (-not $Work) { $Work = Join-Path $env:TEMP ("mf_carwith_" + [guid]::NewGuid().ToString("N").Substring(0, 8)) }
New-Item -ItemType Directory -Force -Path $Work | Out-Null

$script:fails = 0
function Check([string]$name, $ok, [string]$detail = "") {
    if ($ok) {
        Write-Host ("  PASS  {0}{1}" -f $name, $(if ($detail) { "   " + $detail } else { "" }))
    } else {
        $script:fails++
        Write-Host ("  FAIL  {0}   {1}" -f $name, $detail) -ForegroundColor Red
    }
}
function Find-Tool([string]$name) {
    foreach ($r in @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT) | Where-Object { $_ }) {
        $hit = Get-ChildItem -Path $r -Recurse -Filter $name -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($hit) { return $hit.FullName }
    }
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

# 两段式：dex 里是 MUTF-8，Hermes 字节码的字符串表 ASCII 走 UTF-8、含非 ASCII 的串走 **UTF-16LE**
# —— 中文文案按 UTF-8 找必然 FAIL，这一条是本文最容易抄错的探针。
$Latin1 = [System.Text.Encoding]::GetEncoding(28591)
$hayCache = @{}
function Find-Pattern([string]$pattern, $files) {
    $needles = @($Latin1.GetString([System.Text.Encoding]::UTF8.GetBytes($pattern)),
                 $Latin1.GetString([System.Text.Encoding]::Unicode.GetBytes($pattern)))
    foreach ($f in $files) {
        if (-not $hayCache.ContainsKey($f.FullName)) {
            $hayCache[$f.FullName] = $Latin1.GetString([System.IO.File]::ReadAllBytes($f.FullName))
        }
        $hay = $hayCache[$f.FullName]
        for ($i = 0; $i -lt 2; $i++) {
            if ($hay.IndexOf($needles[$i], [System StringComparison]::Ordinal) -ge 0) {
                return $f.Name + "|" + $(if ($i -eq 0) { "UTF-8" } else { "UTF-16LE" })
            }
        }
    }
    return $null
}

Write-Host "`n[1] 解包"
$zip = Join-Path $Work "apk.zip"
Copy-Item -LiteralPath $Apk -Destination $zip -Force
$out = Join-Path $Work "x"
if (Test-Path $out) { Remove-Item -Recurse -Force $out }
Expand-Archive -LiteralPath $zip -DestinationPath $out
$dex = @(Get-ChildItem -Path $out -Filter "classes*.dex" -Recurse)
$bundle = @(Get-ChildItem -Path $out -Recurse | Where-Object { $_.Name -like "*.bundle" })
Check "classes*.dex" ($dex.Count -ge 1) ("共 " + $dex.Count + " 个")
Check "JS bundle" ($bundle.Count -ge 1) $(if ($bundle.Count) { $bundle[0].Name + " " + [math]::Round($bundle[0].Length / 1MB, 2) + " MB" } else { "" })

Write-Host "`n[2] 车机侧键名（classes*.dex）—— 这 4 个是 CarWith 反汇编定的，改一个字车机就读不到"
foreach ($k in @(
        "ucar.media.metadata.LYRICS_WHOLE",
        "ucar.media.metadata.LYRICS_LINE",
        "ucar.media.metadata.LYRICS_STATUS",
        "android.media.metadata.LYRICS")) {
    $hit = Find-Pattern $k $dex
    Check $k ($null -ne $hit) $hit
}

Write-Host "`n[3] 连接判据与车机深浅键（classes*.dex）"
foreach ($k in @("ucar_night_mode", "com.miui.carlink", "com.xiaomi.ucar.minimap")) {
    $hit = Find-Pattern $k $dex
    Check $k ($null -ne $hit) $hit
}
Check "没有拿 autonavi 当屏名（应当找不到该常量）" ($null -eq (Find-Pattern "com.autonavi.minimap" $dex))

Write-Host "`n[4] 类名 / 方法名 / 事件名 + 加固提示串（classes*.dex）"
foreach ($n in @("CarWithLyric", "CarWithState", "CarWithStateModule", "setCarWithLyric", "setLyricEnabled", "setFollowTheme", "onCarWithStateChange")) {
    Check $n ($null -ne (Find-Pattern $n $dex))
}
# 这八条在，说明「适配代码出错就吞掉并留一行 log」的加固真的进了包
# 最后一条同时是递归修复的凭证：provider 只在 publish 的 gated 分支里装
foreach ($n in @(
        "attach 失败（已忽略，不影响播放）",
        "clearLyric 失败（已忽略，不影响播放）",
        "update 失败（已忽略，不影响播放）",
        "publish 跳过（不影响手机播放）",
        "provider 跳过（不影响手机播放）",
        "setConnected 失败（已忽略）",
        "setEnabled 失败（已忽略）",
        "provider 装不上（已忽略，逐句那一路不受影响）")) {
    Check ("加固 " + $n) ($null -ne (Find-Pattern $n $dex))
}

Write-Host "`n[5] JS 侧配置键（assets/*.bundle，纯 ASCII ⇒ UTF-8）"
foreach ($s in @("lyric.showCarWithLyric", "theme.followCarWith", "basicSettings.lyric.showCarWithLyric", "themeSettings.followCarWithTheme")) {
    Check $s ($null -ne (Find-Pattern $s $bundle))
}
foreach ($s in @("车机投屏歌词（CarWith）", "跟随CarWith车机深浅色", "車機投屏歌詞（CarWith）", "Car head-unit lyrics (CarWith)")) {
    $hit = Find-Pattern $s $bundle
    Check ("文案 " + $s) ($null -ne $hit) $hit
}

Write-Host "`n[6] 签名"
$apksigner = Find-Tool "apksigner.bat"
if (-not $apksigner) { $apksigner = Find-Tool "apksigner" }
if ($apksigner) {
    $sig = (& $apksigner verify --print-certs $Apk 2>&1) | Out-String
    Check "签名有效" ($sig -notmatch "DOES NOT VERIFY")
    Check ("公签 = 仓库自带 debug.keystore（" + $DebugCert.Substring(0, 16) + "…）") ($sig -match [regex]::Escape($DebugCert))
} else { Write-Host "  SKIP  没找到 apksigner（装 build-tools 后重跑）" -ForegroundColor Yellow }

Write-Host "`n[7] 清单"
$aapt2 = Find-Tool "aapt2.exe"
if (-not $aapt2) { $aapt2 = Find-Tool "aapt2" }
if ($aapt2) {
    $bad = (& $aapt2 dump badging $Apk 2>&1) | Out-String
    Check "applicationId = fun.upup.musicfree" ($bad -match "package: name='fun\.upup\.musicfree'")
    Check "native-code 只有 arm64-v8a" ($bad -match "native-code: 'arm64-v8a'")
    Write-Host ("  INFO  " + ([regex]::Match($bad, "package: name='[^']*' versionCode='([^']*)' versionName='([^']*)'")).Value)
} else { Write-Host "  SKIP  没找到 aapt2" -ForegroundColor Yellow }

Write-Host ""
if ($script:fails -eq 0) {
    $h = (Get-FileHash -Algorithm SHA256 $Apk).Hash.ToLower()
    Write-Host ("ALL PASS   sha256=" + $h + "   bytes=" + (Get-Item $Apk).Length)
    Write-Host ("临时目录：" + $Work + "   清理： Remove-Item -Recurse -Force '" + $Work + "'")
    exit 0
} else {
    Write-Host ("FAIL x " + $script:fails) -ForegroundColor Red
    exit 1
}
