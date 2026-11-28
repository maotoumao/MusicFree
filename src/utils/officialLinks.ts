/**
 * MusicFree 与作者的官方地址：全部是编译期常量，不来自用户输入或插件
 * 「关于」页与其浮层共用，故落在叶子层而非页面私有
 */
export const officialLinks = {
    /** 官方网站：下载、使用说明、插件开发、常见问题 */
    website: 'https://musicfree.catcat.work',
    /** 代码仓库首页 */
    repository: 'https://github.com/maotoumao/MusicFree',
    /** Issue 区：报问题的去处 */
    issues: 'https://github.com/maotoumao/MusicFree/issues',
    /** 开源协议全文（以仓库副本为准） */
    license: 'https://github.com/maotoumao/MusicFree/blob/master/LICENSE',
    /** 作者的 B 站主页 */
    bilibili: 'https://space.bilibili.com/12866223',
    /** 作者的小红书主页 */
    xiaohongshu:
        'https://www.xiaohongshu.com/user/profile/5ce6085200000000050213a6',
    /** QQ 频道：只在「开发者的话」原文里作为内联链接出现 */
    qqChannel:
        'https://qun.qq.com/qqweb/qunpro/share?_wv=3&_wwv=128&appChannel=share&inviteCode=1XgzeY8LfIa&businessType=9&from=246610&biz=ka&mainSourceId=share&subSourceId=others&jumpsource=shorturl',
} as const;
