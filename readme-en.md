# MusicFree

[中文](./readme.md) | **English**

![GitHub Repo stars](https://img.shields.io/github/stars/maotoumao/MusicFree) 
![GitHub forks](https://img.shields.io/github/forks/maotoumao/MusicFree)
![star](https://gitcode.com/maotoumao/MusicFree/star/badge.svg)

![GitHub License](https://img.shields.io/github/license/maotoumao/MusicFree)
![GitHub Downloads (all assets, all releases)](https://img.shields.io/github/downloads/maotoumao/MusicFree/total)
![GitHub Issues or Pull Requests](https://img.shields.io/github/issues/maotoumao/MusicFree)
![GitHub package.json version](https://img.shields.io/github/package-json/v/maotoumao/MusicFree)

---

## Introduction

A plugin-based, customizable, ad-free music player that currently supports Android and Harmony OS only.

> **Desktop version is here: <https://github.com/maotoumao/MusicFreeDesktop>**

If you need to stay updated on future developments, you can follow the WeChat official account below; if you have questions, you can leave feedback directly in the issue section or the official account.

![WeChat Official Account](./src/assets/imgs/wechat_channel.jpg)

For software download methods, plugin usage instructions, and plugin development documentation, please visit <https://musicfree.catcat.work>.

> [!NOTE]
> - If you see paid/ad-free/cracked versions on other platforms, they are all fake. This is an open source project to begin with. **Please report paid versions directly when encountered**;
> - The software is primarily for personal use, shared to hopefully help those in need; it's a hobby project that will be maintained as much as possible, but daily development time is limited (about half an hour), and it's expected to remain in unstable testing versions for a long time with irregular update frequency. Please use with caution;
> - Third-party plugins and the data they generate are not related to this software. Please use legally and compliantly, and delete any copyright data that may be generated in a timely manner.
> - **Please do not promote with VIP/cracked version as a gimmick**. The example repository is based on public internet API wrappers and **filters out all VIP, preview, and paid songs**. The example repository will **not provide plugins with cracking functionality** in the future;
> - Information about this software **will only be actively published in Git repositories and the WeChat official account "一只猫头猫"**. If you wish to write articles introducing this software, feel free to do so, but please **describe truthfully, and please blur the plugin sources when involving the example repository**. Don't add unreal features to the software (although I wish it had them); in case of conflicting descriptions, this repository shall prevail.

## Project Usage Agreement:
This project is open sourced under the AGPL 3.0 license. Please comply with the open source license when using this project.
In addition, please ensure you understand the following additional notes when using the code:

1. For packaging and redistribution, **please retain the code source**: https://github.com/maotoumao/MusicFree
2. Please do not use for commercial purposes; use the code legally and compliantly;
3. If the open source license changes, it will be updated in this GitHub repository without separate notice.

> [!CAUTION]
> ### 👎 Hall of Shame
> 👎 MusicFree apps on <ins>Xiaomi/Huawei/Vivo app stores</ins> are not related to this software. **They are adware that misappropriates this software's name and logo**. Please be cautious to avoid being deceived.
>
> 👎 速悦音乐 is based on secondary development of this software, with changes only including built-in plugins, UI modifications, and traffic diversion. **It has not complied with this project's open source license and refuses to communicate**.

## Features

- **Plugin-based**: This software is just a player and **does not integrate** any music sources from any platform. All search, playback, playlist import and other functions are entirely based on **plugins**. This means that **as long as music sources can be searched on the internet, as long as there are corresponding plugins, you can use this software for search, playback and other functions**. For detailed plugin information, please see the Plugin section.

- **Plugin-supported features**: Search (music, albums, artists), playback, view albums, view artist details, import singles, import playlists, get lyrics, etc.

- **Customizable and ad-free**: This software provides light and dark modes; supports custom backgrounds; this software is open sourced under the AGPL license and ~~one star for a deal~~ will remain free.
- **Privacy**: All data is stored locally, this software will not collect any of your personal information.
- **Lyrics association**: You can associate the lyrics of two songs, for example, associate song A's lyrics to song B. After association, both songs A and B will display song B's lyrics. You can also associate multiple songs' lyrics, like A->B->C, so that songs A, B, and C will all display C's lyrics.

## Plugins

### Plugin Introduction

A plugin is essentially a CommonJS module that satisfies the plugin protocol. The plugin defines basic functions such as search (music, albums, artists), playback, view albums, artist details, import playlists, get lyrics, etc. Plugin developers only need to focus on input and output logic, while pagination, caching, etc. are all handled by MusicFree. This software completes all player functions through plugins. This decoupled design also allows this software to focus on being a feature-complete player. I must say, small and beautiful.

Plugin development documentation can be found [here](https://musicfree.catcat.work/plugin/introduction.html)

Please note:

- If you are using third-party downloaded plugins, please identify the security of the plugins yourself (basically check that there are no strange network requests; self-written ones are the safest, *don't install things from unknown sources*) to prevent malicious code damage. This software is not responsible for possible losses caused by third-party malicious plugins.

- Plugins may generate certain copyright data unrelated to this software during use. Plugins and any data generated by plugins are not related to this software. Please consider carefully and delete data in a timely manner. This software does not advocate nor will it provide any cracking behavior. You can build your own offline music repository for use.

### Plugin Usage

After downloading the app, you just need to install plugins in the sidebar Settings - Plugin Settings. Supports installing local plugins and installing plugins from the network (supports parsing .js files and .json description files; several example plugins have been written: [link to this repository](https://github.com/maotoumao/MusicFreePlugins), though functionality may not be very complete);

You can directly click "Install plugin from network", then enter <https://gitee.com/maotoumao/MusicFreePlugins/raw/master/plugins.json> and click confirm to install.

For detailed usage instructions with images, please refer to the WeChat official account: [MusicFree Plugin Usage Guide](https://mp.weixin.qq.com/s?__biz=MzkxOTM5MDI4MA==&mid=2247483875&idx=1&sn=aedf8bb909540634d927de7fd2b4b8b1&chksm=c1a390c4f6d419d233908bb781d418c6b9fd2ca82e9e93291e7c93b8ead3c50ca5ae39668212#rd), or the website: https://musicfree.catcat.work/usage/mobile/install-plugin.html

## Download

Please go to the release page: [Link](https://github.com/maotoumao/MusicFree/releases) (if you can't open it, you can replace github with gitee). You can also reply "Musicfree" on the WeChat official account.

## Q&A

For common issues encountered during use, see here: [MusicFree Usage Q&A](https://musicfree.catcat.work/qa/common.html)

For technical exchange/building interesting things together/technical chats, welcome to join the QQ group: [683467814](https://jq.qq.com/?_wv=1027&k=upVpi2k3)~ (Not a Q&A group)

For casual chat, you can go to [QQ Channel](https://pd.qq.com/s/cyxnf0jj1)~

## WIP

If you have new requirements that need discussion, you can leave a message on the WeChat official account backend/submit an issue/or start a topic in discussions.

## Support This Project

If you like this project, or hope I can continue maintaining it, you can support me through any of the following ways ;)

1. Star this project and share it with people around you;
2. Follow the WeChat official account 👇 or Bilibili [不想睡觉猫头猫](https://space.bilibili.com/12866223) for the latest information;
3. Follow maotoumao's [XiaoHongShu](https://www.xiaohongshu.com/user/profile/5ce6085200000000050213a6?xhsshare=CopyLink&appuid=5ce6085200000000050213a6&apptime=1714394544) or [X](https://twitter.com/upupfun). Although I might not update software-related information there, it's still support~

![WeChat Official Account](./src/assets/imgs/wechat_channel.jpg)

Thanks to the following friends for their recommendations, very surprising and delightful ~~~

Recommendation from **果核剥壳**~ <https://mp.weixin.qq.com/s/F6hMbLv_a-Ty0fPA_0P0Rg>

Recommendation from **小棉袄**~ <https://mp.weixin.qq.com/s/Fqe3o7vcTw0KDKoB-gsQfg>

## ChangeLog

[Click here](./changelog.md)

---
This project is for learning and reference only, open sourced under the AGPL3.0 license; please use this project reasonably in compliance with laws and regulations, prohibited for commercial use.

## App Screenshots

**The following screenshots are UI examples only. The software does not provide any music sources internally and does not represent actual performance as shown below.**

#### Main Interface

<img src="./.imgs/main-v0.6.jpg" width="320px" alt="Main Interface">

#### Sidebar

- Sidebar

<img src="./.imgs/sidebar-v0.6.jpg" width="320px" alt="Sidebar">

- Basic Settings

<img src="./.imgs/basic-setting-v0.6.jpg" width="320px" alt="Basic Settings">

- Theme Settings

<img src="./.imgs/theme-setting-v0.6.jpg" width="320px" alt="Theme Settings">

#### Music Related

- Playlist Page

<img src="./.imgs/song-sheet-v0.6.jpg" width="320px" alt="Playlist Page">

- Search in Playlist

<img src="./.imgs/search-in-sheet-v0.6.jpg" width="320px" alt="Search in Playlist">

- Player Page

<img src="./.imgs/song-cover-v0.6.jpg" width="320px" alt="Player Page">

- Lyrics Page

<img src="./.imgs/song-lrc-v0.6.jpg" width="320px" alt="Lyrics Page">

#### Search Related

- Artist Information

<img src="./.imgs/artist-detail-v0.6.jpg" width="320px" alt="Artist Information">

<details>

<summary>The following are UI from early versions of the software</summary>

#### Main Interface

<img src="./.imgs/main.jpg" width="320px" alt="Main Interface">

#### Sidebar

- Basic Settings

<img src="./.imgs/basic-setting.jpg" width="320px" alt="Basic Settings">

- Theme Settings

<img src="./.imgs/theme-setting.jpg" width="320px" alt="Theme Settings">

#### Music Related

- Playlist Page

<img src="./.imgs/song-sheet.jpg" width="320px" alt="Playlist Page">

- Search in Playlist

<img src="./.imgs/search-in-sheet.jpg" width="320px" alt="Search in Playlist">

- Player Page

<img src="./.imgs/song-cover.jpg" width="320px" alt="Player Page">

- Lyrics Page

<img src="./.imgs/song-lrc.jpg" width="320px" alt="Lyrics Page">

#### Search Related

- Artist Information

<img src="./.imgs/artist-detail.jpg" width="320px" alt="Artist Information">

</details>
