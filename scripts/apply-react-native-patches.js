#!/usr/bin/env node
/**
 * iOS 侧的 React Native 网络补丁（npm postinstall 自动执行）。
 *
 * 背景：
 *   RN 0.76 的 RCTNetworking 在 withCredentials=true（默认）时，会先把
 *   NSHTTPCookieStorage 里的 Cookie 塞进请求头，再把插件手写的 Cookie 头
 *   addValue 进去。iOS 上两者会合并成一个 Cookie 头，原生匿名 Cookie 排在
 *   前面。网易云等插件靠手写 Cookie 传用户变量（MUSIC_U / __csrf），
 *   服务端可能取到前面的匿名值，表现为“填了 Cookie 仍是未登录”。
 *
 * 修复：
 *   只要 JS 明确传了 Cookie 头，就关闭该请求的 HTTPShouldHandleCookies，
 *   让插件手写的 Cookie 原样发出，不再和原生 Cookie 仓合并。
 *   没有手写 Cookie 的请求保持原行为。
 *
 * 只改 node_modules 里的 RN 源码，因此用 postinstall 保证每次 npm install
 * 后仍然生效；如果 RN 版本升级导致代码块变化，脚本会报错提醒重新适配。
 */

"use strict";

const fs = require("fs");
const path = require("path");

const target = path.join(
    __dirname,
    "..",
    "node_modules",
    "react-native",
    "Libraries",
    "Network",
    "RCTNetworking.mm",
);

if (!fs.existsSync(target)) {
    console.log("[rn-ios-patch] 未找到 RCTNetworking.mm，跳过（可能还没安装依赖）");
    process.exit(0);
}

let source = fs.readFileSync(target, "utf8");

if (source.indexOf("hasExplicitCookie") >= 0) {
    console.log("[rn-ios-patch] 已应用，跳过");
    process.exit(0);
}

const before = `  NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:URL];
  request.HTTPMethod = [RCTConvert NSString:RCTNilIfNull(query[@"method"])].uppercaseString ?: @"GET";
  request.HTTPShouldHandleCookies = [RCTConvert BOOL:query[@"withCredentials"]];

  if (request.HTTPShouldHandleCookies == YES) {
    // Load and set the cookie header.
    NSArray<NSHTTPCookie *> *cookies = [[NSHTTPCookieStorage sharedHTTPCookieStorage] cookiesForURL:URL];
    request.allHTTPHeaderFields = [NSHTTPCookie requestHeaderFieldsWithCookies:cookies];
  }

  // Set supplied headers.
  NSDictionary *headers = [RCTConvert NSDictionary:query[@"headers"]];`;

const after = `  NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:URL];
  request.HTTPMethod = [RCTConvert NSString:RCTNilIfNull(query[@"method"])].uppercaseString ?: @"GET";

  // Set supplied headers.
  NSDictionary *headers = [RCTConvert NSDictionary:query[@"headers"]];

  // If the caller supplies an explicit Cookie header, do not let NSURLSession merge
  // the shared cookie jar in front of it. Plugins use this header to pass their own
  // login cookie; a stale anonymous cookie with the same name would otherwise be sent
  // first and may win on the server side.
  BOOL hasExplicitCookie = NO;
  for (NSString *key in headers) {
    if ([key caseInsensitiveCompare:@"Cookie"] == NSOrderedSame && headers[key] != [NSNull null]) {
      hasExplicitCookie = YES;
      break;
    }
  }
  request.HTTPShouldHandleCookies =
      [RCTConvert BOOL:query[@"withCredentials"]] && !hasExplicitCookie;

  if (request.HTTPShouldHandleCookies == YES) {
    // Load and set the cookie header.
    NSArray<NSHTTPCookie *> *cookies = [[NSHTTPCookieStorage sharedHTTPCookieStorage] cookiesForURL:URL];
    request.allHTTPHeaderFields = [NSHTTPCookie requestHeaderFieldsWithCookies:cookies];
  }`;

if (source.indexOf(before) < 0) {
    console.error(
        "[rn-ios-patch] RCTNetworking.mm 结构和预期不一致（React Native 版本变了？）。\n" +
            "请重新确认显式 Cookie 头的处理逻辑后再更新 scripts/apply-react-native-patches.js。",
    );
    process.exit(1);
}

source = source.replace(before, after);
fs.writeFileSync(target, source, "utf8");
console.log("[rn-ios-patch] 已应用：显式 Cookie 头不再合并原生 Cookie");
