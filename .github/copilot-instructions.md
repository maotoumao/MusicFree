# MusicFree 项目说明

## 项目简介
MusicFree 是一个基于 React Native 的音乐播放器应用。

## 常见任务
### 如何新增多语言支持
1. 在 `src/core/i18n/languages/` 目录下新增对应语言的 JSON 文件，例如 `zh-cn.json` 用于简体中文支持。
2. 在 `src/types/core/i18n/index.d.ts` 文件中添加对应的语言类型定义。
3. 确保不同语言下的含义一致，优先参考中文版本。