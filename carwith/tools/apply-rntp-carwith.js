#!/usr/bin/env node
/*
 * 把 CarWith 歌词适配打进 node_modules/react-native-track-player。
 *
 * 为什么要这么绕：RNTP 是 npm 依赖，node_modules 不进 Git，所以那 5 处改动
 * 存在 patches/react-native-track-player+4.1.1.patch 里，由本脚本在装完依赖后落地。
 *
 * 用法：
 *   node carwith/tools/apply-rntp-carwith.js          应用（幂等，已打过就跳过）
 *   node carwith/tools/apply-rntp-carwith.js --check  只校验，不写任何东西
 *   node carwith/tools/apply-rntp-carwith.js --force  版本不是 4.1.1 也照打（后果自负）
 *
 * 设计原则和 rebuild_carwith.py 一致：**宁可报错停下，也不半打进去**。
 * 所以每个文件都按 sha256 认三种状态：pristine（该打）、patched（已打）、其它（漂移，报错）。
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const PKG = "react-native-track-player";
const EXPECT_VERSION = "4.1.1";
const PATCH_FILE = `${PKG}+${EXPECT_VERSION}.patch`;

// 基线：npm 上 react-native-track-player@4.1.1 的三个文件
const FILES = [
  {
    rel: "android/src/main/java/com/doublesymmetry/trackplayer/service/MusicService.kt",
    pristine: "1dcc1bb6b05ccce802c24b4e0945e565ceeed288e2b84b561a9570e3a699ada7",
    patched: "1e9758e1039430868580b8c2e986cc0365ce089f4f6e6c4d0deec82675c7f4ad",
  },
  {
    rel: "android/src/main/java/com/doublesymmetry/trackplayer/module/MusicModule.kt",
    pristine: "be0de3b03f164def4a4c42bd793babd75cf3aa18af1fef76abc42ef6864a808b",
    patched: "b9cb3616500c26dc095ea69659ad12dd02ae3403ddb6f9364f4b8673dd3b06c7",
  },
  {
    // 新文件：pristine 状态下不存在
    rel: "android/src/main/java/com/doublesymmetry/trackplayer/carwith/CarWithLyric.kt",
    pristine: null,
    patched: "b6fcfbf8f2c976f1a3ac9d39eae64979a5dabb3baa85333f4098e5a467099fd9",
  },
];

const ROOT = path.resolve(__dirname, "..", ".."); // <repo>/carwith/tools → <repo>
const pkgDir = path.join(ROOT, "node_modules", PKG);
const patchPath = path.join(ROOT, "patches", PATCH_FILE);

const sha256 = (p) =>
  crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");

function die(msg, code = 1) {
  console.error("FAIL " + msg);
  process.exit(code);
}

function state(rel, wantPristine, wantPatched) {
  const p = path.join(pkgDir, rel);
  if (!fs.existsSync(p)) return wantPristine === null ? "ready" : "missing";
  const h = sha256(p);
  if (h === wantPatched) return "applied";
  if (wantPristine !== null && h === wantPristine) return "ready";
  return "drift:" + h;
}

function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const force = args.includes("--force");

  if (!fs.existsSync(patchPath)) die("找不到 patches/" + PATCH_FILE);
  if (!fs.existsSync(path.join(pkgDir, "package.json"))) {
    die("node_modules/" + PKG + " 不存在 —— 先 npm install（或 yarn install）再跑本脚本");
  }

  const ver = JSON.parse(
    fs.readFileSync(path.join(pkgDir, "package.json"), "utf8")
  ).version;
  if (ver !== EXPECT_VERSION && !force) {
    die(
      `${PKG} 解析到的是 ${ver}，本补丁钉在 ${EXPECT_VERSION}。\n` +
        "  两个选择：\n" +
        `  1) package.json 里把 ${PKG} 固定成 "${EXPECT_VERSION}" 后重装（重做一致性走这条）；\n` +
        `  2) 照 carwith/README.md「上游漂移」一节，拿新${PKG}重做出 ${PKG}+${ver}.patch 再打。\n` +
        "  （确认差异只是无关行，也可以 --force 强打，但别把结果当可复现交付物。）"
    );
  }

  const states = FILES.map((f) => ({ rel: f.rel, st: state(f.rel, f.pristine, f.patched) }));
  for (const s of states) {
    if (s.st.startsWith("drift")) {
      die(
        "文件既不是基线也不是已打状态，说明依赖被动过（或版本漂移）：\n" +
          "  " + s.rel + "\n  实际 sha256 = " + s.st.slice(6) + "\n" +
          "  重装依赖（rm -rf node_modules && npm install）再跑；还不行就照 README 重做补丁。"
      );
    }
    if (s.st === "missing") {
      die("缺文件，依赖装得不完整：" + s.rel);
    }
  }

  const ready = states.filter((s) => s.st === "ready");
  if (ready.length === 0) {
    console.log("SKIP 补丁已在 " + pkgDir + "（sha256 全部对上）");
    return;
  }
  if (checkOnly) {
    console.log("CHECK 待应用 " + ready.length + " 个文件：" + ready.map((r) => path.basename(r.rel)).join(", "));
    return;
  }

  // 必须在仓库根上跑：node_modules 在 MusicFree 这个 git 仓库里面，
  // 站在包目录里跑 git apply 的话，它会按**超级项目根**去解析 a/android/... 这条路，
  // 结果三个 hunk 全部 "Skipped patch"（假成功）。用 --directory 把包目录接上。
  const relPkg = path.relative(ROOT, pkgDir).split(path.sep).join("/");
  const r = spawnSync(
    "git",
    ["apply", "--verbose", "--directory=" + relPkg, path.relative(ROOT, patchPath).split(path.sep).join("/")],
    { cwd: ROOT, stdio: "inherit" }
  );
  if (r.error && r.error.code === "ENOENT") {
    die("本机没有 git（本脚本用 git apply 落地）。装 git，或者用 patch-package：npx patch-package");
  }
  if (r.status !== 0) die("git apply 失败，退出码 " + r.status);

  // 打完再核一遍：不一致就是白打
  for (const f of FILES) {
    const st = state(f.rel, f.pristine, f.patched);
    if (st !== "applied") die("打完校验没过：" + f.rel + " 状态 = " + st);
  }
  console.log("OK " + PKG + " " + ver + " ← patches/" + PATCH_FILE);
}

main();
