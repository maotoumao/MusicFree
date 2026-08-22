/**
 * 桌面端渲染进程入口
 * 复用 src/entry/index.tsx 的页面组件,移动端代码零改动。
 */
import "./polyfills";
import React from "react";
import { createRoot } from "react-dom/client";
import Pages from "../../../src/entry/index";

const container = document.getElementById("root");
const root = createRoot(container!);
root.render(<Pages />);
