# MusicFree

**中文** | [English](./readme-en.md)

![GitHub Repo stars](https://img.shields.io/github/stars/maotoumao/MusicFree) 
![GitHub forks](https://img.shields.io/github/forks/maotoumao/MusicFree)
![star](https://gitcode.com/maotoumao/MusicFree/star/badge.svg)

![GitHub License](https://img.shields.io/github/license/maotoumao/MusicFree)
![GitHub Downloads (all assets, all releases)](https://img.shields.io/github/downloads/maotoumao/MusicFree/total)
![GitHub Issues or Pull Requests](https://img.shields.io/github/issues/maotoumao/MusicFree)
![GitHub package.json version](https://img.shields.io/github/package-json/v/maotoumao/MusicFree)

<a href="https://trendshift.io/repositories/1028" target="_blank"><img src="https://trendshift.io/api/badge/repositories/1028" alt="maotoumao%2FMusicFree | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

## 简介

一个插件化、定制化、无广告的免费音乐播放器，目前只支持 Android 和 Harmony OS。

> **桌面版来啦：<https://github.com/maotoumao/MusicFreeDesktop>**

如果需要了解后续进展可以关注公众号↓；如果有问题可以在 issue 区或者公众号直接留言反馈。

![微信公众号](./src/assets/imgs/wechat_channel.jpg)

软件下载方式、插件使用说明、插件开发文档可去站点 [https://musicfree.catcat.work](https://musicfree.catcat.work) 查看。

> [!NOTE]
> - 如果你在其他的平台看到收费版/无广告版/破解版，都是假的，本来就是开源项目，**遇到收费版请直接举报**；
> - 软件首先是自用，顺带分享出来希望可以帮助到有需要的人；是业余作品，会尽量保持维护，不过每天能写的时间有限（半小时左右），目测会有很长一段时间处于不稳定测试版本，且更新频率不定，请谨慎使用；
> - 软件的第三方插件、及其所产生的数据与本软件无关，请合理合法使用，可能产生的版权数据请及时删除。
> - **请不要以 VIP/破解版为噱头进行宣传**，示例仓库基于互联网公开接口封装，并**过滤掉所有 VIP、试听、付费歌曲**，且示例仓库以后也**不会提供具备破解功能的插件**；
> - 本软件的相关信息**只会主动投放在 Git 仓库以及公众号“一只猫头猫”中**，如果希望写文章介绍本软件请自便，但还烦请**如实陈述，涉及到示例仓库请给插件源打个码**，不要给软件增加一些不实的功能（尽管我也想有）；描述冲突的地方以本仓库为准。


## 项目使用约定：
本项目基于 AGPL 3.0 协议开源，使用此项目时请遵守开源协议。  
除此外，希望你在使用代码时已经了解以下额外说明：

1. 打包、二次分发 **请保留代码出处**：https://github.com/maotoumao/MusicFree
2. 请不要用于商业用途，合法合规使用代码；
3. 如果开源协议变更，将在此 Github 仓库更新，不另行通知。

> [!CAUTION]
> ### 👎 Hall of Shame
> 👎 小米/华为/vivo等<ins>应用市场的 MusicFree </ins>和本软件无关，**是套用本软件名称和 Logo 的广告软件**。
>
> 👎 速悦音乐基于本软件二次开发，改动点仅仅是内置插件、修改一些 UI 以及引流，**并未遵守本项目的开源协议，且拒绝沟通**。

---

## 特性

- 插件化：本软件仅仅是一个播放器，本身**并不集成**任何平台的任何音源，所有的搜索、播放、歌单导入等功能全部基于**插件**。这也就意味着，**只要可以在互联网上搜索到的音源，只要有对应的插件，你都可以使用本软件进行搜索、播放等功能**。关于插件的详细说明请看插件一节。

- 插件支持的功能：搜索（音乐、专辑、作者）、播放、查看专辑、查看作者详细信息、导入单曲、导入歌单、获取歌词等。

- 定制化、无广告：本软件提供了浅色、深色模式；支持自定义背景；本软件基于 AGPL 协议开源，~~一个 star 做交易~~ 将会保持免费。
- 隐私：所有的数据都存储在本地，本软件不会收集你的任何个人信息。
- 歌词关联：你可以把两首歌的歌词关联起来，比如将歌曲 A 的歌词关联到歌曲 B，关联后 A、B 两首歌都将显示歌曲 B 的歌词。你也可以关联多首歌的歌词，如 A->B->C，这样 A、B、C 三首歌都将显示 C 的歌词。

## 插件

### 插件简介

插件本质上是一个满足插件协议的 commonjs 模块。插件中定义了搜索（音乐、专辑、作者）、播放、查看专辑、作者详细信息、导入歌单、获取歌词等基本函数，插件的开发者只需要关心输入输出逻辑，至于分页、缓存等全都交给 MusicFree 控制即可。本软件通过插件来完成播放器的所有功能，这样解耦的设计也可以使得本软件可以专注于做一个功能完善的播放器，我直呼小而美。

插件开发文档可以参考 [这里](https://musicfree.catcat.work/plugin/introduction.html)

需要注意的是：

- 如果你是使用第三方下载的插件，那么请自行鉴别插件的安全性（基本上看下没有奇怪的网络请求什么的就好了；自己写的最安全，*不要安装来路不明的东西*），防止恶意代码破坏。因为第三方恶意插件导致的可能的损失与本软件无关。

- 插件使用过程中可能会产生某些和本软件无关的版权数据，插件、以及插件产生的任何数据与本软件无关，请使用者自行斟酌，及时删除数据，本软件不提倡也不会提供任何破解行为，你可以搭建自己的离线音乐仓库使用。

### 插件使用

下载 app 之后，只需要在侧边栏设置-插件设置中安装插件即可。支持安装本地插件和从网络安装插件（支持解析.js 文件和.json 描述文件；已经写了几个示意的插件：[指路这个仓库](https://github.com/maotoumao/MusicFreePlugins)，不过可能功能不是很完善）；


你可以直接点击从网络安装插件，然后输入<https://raw.gitcode.com/maotoumao/MusicFreePlugins/raw/master/plugins.json> ，点击确认即可安装。

图文版详细使用说明可以参考公众号：[MusicFree 插件使用指南](https://mp.weixin.qq.com/s?__biz=MzkxOTM5MDI4MA==&mid=2247483875&idx=1&sn=aedf8bb909540634d927de7fd2b4b8b1&chksm=c1a390c4f6d419d233908bb781d418c6b9fd2ca82e9e93291e7c93b8ead3c50ca5ae39668212#rd)，或者站点： https://musicfree.catcat.work/usage/mobile/install-plugin.html

## 下载地址

请转到发布页查看：[指路](https://github.com/maotoumao/MusicFree/releases) (如果打不开可以把 github 换成 gitcode)，公众号回复 Musicfree 也可以。

## Q&A

使用时遇到的常见问题可以看这里：[MusicFree 使用 Q&A](https://musicfree.catcat.work/qa/common.html)

技术交流/一起写点有意思的东西/技术向的闲聊欢迎加群：[683467814](https://jq.qq.com/?_wv=1027&k=upVpi2k3)~ （不是答疑群）

闲聊可以到 [QQ 频道](https://pd.qq.com/s/cyxnf0jj1)~

## WIP

如果有需要讨论的新需求，可以在公众号后台留言/提issue/或者去discussion开个话题。

## 支持这个项目

如果你喜欢这个项目，或者希望我可以持续维护下去，你可以通过以下任何一种方式支持我;)

1. Star 这个项目，分享给你身边的人；
2. 关注公众号👇或 b 站 [不想睡觉猫头猫](https://space.bilibili.com/12866223) 获取最新信息；
3. 关注猫头猫的 [小红书](https://www.xiaohongshu.com/user/profile/5ce6085200000000050213a6?xhsshare=CopyLink&appuid=5ce6085200000000050213a6&apptime=1714394544)，虽然可能不会在这里更新软件相关的信息，但也算支持啦~

![微信公众号](./src/assets/imgs/wechat_channel.jpg)

感谢以下小伙伴的推荐，很意外也很惊喜 ~~~

来自**果核剥壳**的安利~ <https://mp.weixin.qq.com/s/F6hMbLv_a-Ty0fPA_0P0Rg>

来自**小棉袄**的安利~ <https://mp.weixin.qq.com/s/Fqe3o7vcTw0KDKoB-gsQfg>

## ChangeLog

[点击这里](./changelog.md)

---
本项目仅供学习参考使用，基于 AGPL3.0 协议开源；请在符合法律法规的情况下合理使用本项目，禁止用于商业目的使用。

## 应用截图

**以下截图仅为 UI 样例，软件内部不提供任何音源，不代表实际使用时表现如下图。**
#### 主界面

<img src="./.imgs/main-v0.6.jpg" width="320px" alt="主界面">

#### 侧边栏

- 侧边栏

<img src="./.imgs/sidebar-v0.6.jpg" width="320px" alt="侧边栏">

- 基础设置

<img src="./.imgs/basic-setting-v0.6.jpg" width="320px" alt="基础设置">

- 主题设置

<img src="./.imgs/theme-setting-v0.6.jpg" width="320px" alt="主题设置">

#### 音乐相关

- 歌单页

<img src="./.imgs/song-sheet-v0.6.jpg" width="320px" alt="歌单页">

- 歌单内检索

<img src="./.imgs/search-in-sheet-v0.6.jpg" width="320px" alt="歌单内检索">

- 播放页

<img src="./.imgs/song-cover-v0.6.jpg" width="320px" alt="播放页">

- 歌词页

<img src="./.imgs/song-lrc-v0.6.jpg" width="320px" alt="歌词页">

#### 搜索相关

- 作者信息

<img src="./.imgs/artist-detail-v0.6.jpg" width="320px" alt="作者信息">


<details>


<summary>以下是软件早期版本的 UI</summary>

#### 主界面

<img src="./.imgs/main.jpg" width="320px" alt="主界面">

#### 侧边栏

- 基础设置

<img src="./.imgs/basic-setting.jpg" width="320px" alt="基础设置">

- 主题设置

<img src="./.imgs/theme-setting.jpg" width="320px" alt="主题设置">

#### 音乐相关

- 歌单页

<img src="./.imgs/song-sheet.jpg" width="320px" alt="歌单页">

- 歌单内检索

<img src="./.imgs/search-in-sheet.jpg" width="320px" alt="歌单内检索">

- 播放页

<img src="./.imgs/song-cover.jpg" width="320px" alt="播放页">

- 歌词页

<img src="./.imgs/song-lrc.jpg" width="320px" alt="歌词页">

#### 搜索相关

- 作者信息

<img src="./.imgs/artist-detail.jpg" width="320px" alt="作者信息">


</details>


## 🌐 Web Resources & Interactive Index
- [COP SIMULATOR](https://themindplay.pages.dev/cop-simulator.html)
- [SCREW SPIN](https://thequizzone.pages.dev/screw-spin.html)
- [CATEGORY 2D1 060](https://studyquests.pages.dev/category-2d1-060.html)
- [MERGE FRUIT](https://quizverses.pages.dev/merge-fruit.html)
- [BOYFRIEND FOR HIRE](https://quizverses.github.io/boyfriend-for-hire.html)
- [2248 MUSICAL](https://quizverses.github.io/2248-musical.html)
- [CATEGORY FLASH 3](https://thelearnquesters.pages.dev/category-flash-3.html)
- [MELON DROP FRUIT MERGE MASTER](https://thelearnquester.web.app/melon-drop-fruit-merge-master.html)
- [CATEGORY INTERSTELLAR](https://thelearnquester.web.app/category-interstellar.html)
- [CATEGORY SNIPER39](https://thelearnquester.web.app/category-sniper39.html)
- [STUNT CAR EXTREME 2](https://learnquester.github.io/stunt-car-extreme-2.html)
- [LADDER MASTER COLOR RUN](https://learnquester.github.io/ladder-master-color-run.html)
- [NOOB JAILBREAK 2](https://learnquester.pages.dev/noob-jailbreak-2.html)
- [MAZE CRAZE](https://learnquester.github.io/maze-craze.html)
- [CATEGORY PROXY LIST](https://learnquester.pages.dev/category-proxy-list.html)
- [ARCHER LEGEND](https://learnquester.github.io/archer-legend.html)
- [SOLITAIRE FARM SEASONS 3](https://studyplayings.pages.dev/solitaire-farm-seasons-3.html)
- [DRAW TO SMASH ZOMBIE](https://quizverses.github.io/draw-to-smash-zombie.html)
- [TRAFFIC COP 3D](https://thelearnquester.web.app/traffic-cop-3d.html)
- [STEAL ITEMS IO](https://studyplayings.pages.dev/steal-items-io.html)
- [MERGE CAR DEFENSE](https://studyplaying.github.io/merge-car-defense.html)
- [EMOJI SMASHER SMILEY GAME](https://learnquester.github.io/emoji-smasher-smiley-game.html)
- [CATEGORY SIDE SCROLLING184](https://studyplayings.pages.dev/category-side-scrolling184.html)
- [DREAM WEDDING PLANNER](https://thelearnquester.web.app/dream-wedding-planner.html)
- [BASKETBALL RUSH](https://quizverses.github.io/basketball-rush.html)
- [DARK MYTH MONKEY MERGE](https://learnquester.github.io/dark-myth-monkey-merge.html)
- [ISLAND BATTLE 3D](https://quizverses.github.io/island-battle-3d.html)
- [REAL CAR PARKING AND STUNT](https://learnquester.github.io/real-car-parking-and-stunt.html)
- [CRYPTOGRAM](https://studyplaying.github.io/cryptogram.html)
- [CATEGORY SKILL256](https://studyplayings.pages.dev/category-skill256.html)
- [ISOMETRIC ESCAPE](https://thelearnquester.web.app/isometric-escape.html)
- [PALKOVIL THE WAY HOME](https://quizverses.github.io/palkovil-the-way-home.html)
- [CATEGORY LISTS](https://studyplayings.pages.dev/category-lists.html)
- [MERGE FLOW](https://quizverses.github.io/merge-flow.html)
- [HOME RUN BOY](https://thelearnquester.web.app/home-run-boy.html)
- [COLOR SCREW RESCUE PUZZLE](https://quizverses.github.io/color-screw-rescue-puzzle.html)
- [PAINT MASTER](https://quizverses.github.io/paint-master.html)
- [CUBE DROP PUZZLE](https://studyplaying.github.io/cube-drop-puzzle.html)
- [POLYGON SPACE](https://quizverses.github.io/polygon-space.html)
- [DUCKLINGS](https://learnquester.github.io/ducklings.html)
- [JEWEL LEGEND QUEST](https://studyplaying.github.io/jewel-legend-quest.html)
- [LIVE STAR DOLL DRESS UP](https://thelearnquester.web.app/live-star-doll-dress-up.html)
- [KINGDOM MATCH](https://learnquester.github.io/kingdom-match.html)
- [GOOD YARD](https://quizverses.github.io/good-yard.html)
- [HOLE DIGGER](https://studyplaying.github.io/hole-digger.html)
- [WINTER TETRIX TRAILS](https://quizverses.github.io/winter-tetrix-trails.html)
- [CATEGORY PARKOUR55](https://learnquester.pages.dev/category-parkour55.html)
- [MOBILE PHONE CASE DIY](https://studyplaying.github.io/mobile-phone-case-diy.html)
- [CATEGORY RACING DRIVING 2](https://learnquester.pages.dev/category-racing-driving-2.html)
- [WORM PUZZLE SNAKE APPLE](https://learnquester.github.io/worm-puzzle-snake-apple.html)
- [CATEGORY PREMIUM PERKS71](https://thelearnquester.web.app/category-premium-perks71.html)
- [DEATH BALL](https://quizverses.github.io/death-ball.html)
- [BRAWL STARS BATTLE](https://quizverses.github.io/brawl-stars-battle.html)
- [SANDWICH RUNNER](https://quizverses-9d2f2.web.app/sandwich-runner.html)
- [MOJO EMOJI](https://learnquester.github.io/mojo-emoji.html)
- [SMART DOTS RELOADED](https://studyplaying.github.io/smart-dots-reloaded.html)
- [PUSH TO GO](https://quizverses-9d2f2.web.app/push-to-go.html)
- [FOOTBALL SUPERSTARS 2026](https://studyplayings.pages.dev/football-superstars-2026.html)
- [CATEGORY POOL 2](https://learnquester.pages.dev/category-pool-2.html)
- [GOKARTS IO](https://studyplayings.pages.dev/gokarts-io.html)
- [HOTEL FEVER TYCOON](https://learnquester.github.io/hotel-fever-tycoon.html)
- [WINTER GIFTS](https://quizverses-9d2f2.web.app/winter-gifts.html)
- [POXEL IO](https://quizverses-9d2f2.web.app/poxel-io.html)
- [CATEGORY THIRD PERSON SHOOTER80](https://learnquester.pages.dev/category-third-person-shooter80.html)
- [DRESS PRINCESS](https://studyplaying.github.io/dress-princess.html)
- [BLOCK DODGER](https://studyplayings.pages.dev/block-dodger.html)
- [PUSH THE FROG](https://learnquester.github.io/push-the-frog.html)
- [CATEGORY CONTROLLER 2](https://thelearnquester.web.app/category-controller-2.html)
- [CATEGORY CARDS](https://thelearnquester.web.app/category-cards.html)
- [BUBBLE SHOOTER BILLIARDS POOL](https://thelearnquester.web.app/bubble-shooter-billiards-pool.html)
- [CATEGORY COOKING](https://thelearnquester.web.app/category-cooking.html)
- [RAINBOW FRIENDS HIDE AND SEEK](https://thelearnquester.web.app/rainbow-friends-hide-and-seek.html)
- [HORROR HOTEL SCARY ROOM](https://learnquester.github.io/horror-hotel-scary-room.html)
- [MERGE FRUIT](https://studyplaying.github.io/merge-fruit.html)
- [HORSEBACK SURVIVAL](https://quizverses-9d2f2.web.app/horseback-survival.html)
- [TONY ARCHER](https://learnquester.github.io/tony-archer.html)
- [NINJA TIME](https://studyplaying.github.io/ninja-time.html)
- [MAFIA SNIPER CRIME SHOOTING](https://quizverses-9d2f2.web.app/mafia-sniper-crime-shooting.html)
- [PUZZLE MASTERS TRAVELERS](https://quizverses.github.io/puzzle-masters-travelers.html)
- [CATEGORY SNAKE](https://learnquester.pages.dev/category-snake.html)
- [CATEGORY BOOKMARKLET](https://thelearnquester.web.app/category-bookmarklet.html)
- [DRAW TO HOME 3D](https://quizverses-9d2f2.web.app/draw-to-home-3d.html)
- [STICKMAN RAGDOLL PLAYGROUND](https://learnquester.github.io/stickman-ragdoll-playground.html)
- [STICKMAN HALLOWEEN SURVIVE](https://thelearnquester.web.app/stickman-halloween-survive.html)
- [CATEGORY THINKY](https://quizverses-9d2f2.web.app/category-thinky.html)
- [FAT CAT LIFE](https://thelearnquester.web.app/fat-cat-life.html)
- [CANDY SMASH](https://quizverses-9d2f2.web.app/candy-smash.html)
- [MAGIC TOWERS SOLITAIRE](https://thelearnquester.web.app/magic-towers-solitaire.html)
- [FRUIT BALLS JUICY FUSION](https://studyplaying.github.io/fruit-balls-juicy-fusion.html)
- [EMOJI DROP THEMES](https://learnquester.github.io/emoji-drop-themes.html)
- [CATEGORY INCREMENTAL388](https://learnquester.pages.dev/category-incremental388.html)
- [VIBE COLOURING](https://studyplaying.github.io/vibe-colouring.html)
- [GTA CAR RUSH](https://studyplaying.github.io/gta-car-rush.html)
- [CATEGORY AGILITY 2](https://thelearnquester.web.app/category-agility-2.html)
- [IDLE MARKET TYCOON](https://studyplaying.github.io/idle-market-tycoon.html)
- [EARTH DEFENDER](https://thelearnquester.web.app/earth-defender.html)
- [CATEGORY UPGRADE GAMES](https://learnquester.github.io/category-upgrade-games.html)
- [WORLD SOLITAIRE TRIPEAKS ](https://learnquester.github.io/world-solitaire-tripeaks-.html)
- [CATEGORY TANK58](https://studyplayings.pages.dev/category-tank58.html)
- [CATEGORY ESCAPE 2](https://thelearnquester.web.app/category-escape-2.html)
- [MAHJONG STACK](https://thelearnquester.web.app/mahjong-stack.html)
- [TRUE LOVE CALCULATOR NZW](https://studyplayings.pages.dev/true-love-calculator-nzw.html)
- [CATEGORY SOCCER](https://learnquester.pages.dev/category-soccer.html)
- [BUILD AN AQUAPARK](https://quizverses.github.io/build-an-aquapark.html)
- [CATEGORY BOOKMARKLETS](https://learnquester.pages.dev/category-bookmarklets.html)
- [SNAKE GO ESCAPE PUZZLE](https://studyplayings.pages.dev/snake-go-escape-puzzle.html)
- [CATEGORY SURVIVAL366](https://studyplayings.pages.dev/category-survival366.html)
- [HOSPITAL INC](https://learnquester.github.io/hospital-inc.html)
- [CUBE IN CUBE](https://studyplaying.github.io/cube-in-cube.html)
- [FEET DOCTOR URGENCY CARE](https://learnquester.github.io/feet-doctor-urgency-care.html)
- [OBBY POGO PARKOUR](https://learnquester.github.io/obby-pogo-parkour.html)
- [FEED THE PARROT](https://studyplaying.github.io/feed-the-parrot.html)
- [MURDER](https://quizverses.github.io/murder.html)
- [CATEGORY IDLE](https://learnquester.pages.dev/category-idle.html)
- [KNOCKOUT DUDES](https://studyplayings.pages.dev/knockout-dudes.html)
- [CATEGORY IDLE](https://learnquester.github.io/category-idle.html)
- [BUBBLE SHOOTER TEMPLE JEWELS](https://quizverses.github.io/bubble-shooter-temple-jewels.html)
- [PET DOCTOR BUSINESS TYCOON PET CARE GAME](https://thelearnquester.web.app/pet-doctor-business-tycoon-pet-care-game.html)
- [CATEGORY MEME BLOXY24](https://learnquester.pages.dev/category-meme-bloxy24.html)
- [CATEGORY QUIZ40](https://learnquester.pages.dev/category-quiz40.html)
- [FLICK N BOUNCE](https://quizverses.github.io/flick-n-bounce.html)
- [CATEGORY UNBLOCKED WEBSITES](https://thelearnquester.web.app/category-unblocked-websites.html)
- [MAGIC CHRISTMAS TREE MATCH 3](https://studyplayings.pages.dev/magic-christmas-tree-match-3.html)
- [BUBBLE SHOOTER VALE](https://quizverses-9d2f2.web.app/bubble-shooter-vale.html)
- [HALLOWEEN CHALLENGE](https://studyplaying.github.io/halloween-challenge.html)
- [SCREW MATCH](https://studyplaying.github.io/screw-match.html)
- [PET CONNECT MATCH](https://learnquester.pages.dev/pet-connect-match.html)
- [FASHION VALKYRIES SAGA OF STYLE](https://studyplaying.github.io/fashion-valkyries-saga-of-style.html)
- [CANDY JEWELS](https://themindzone.pages.dev/candy-jewels.html)
- [BATTLE TANKS FIRESTORM](https://learnquester.github.io/battle-tanks-firestorm.html)
