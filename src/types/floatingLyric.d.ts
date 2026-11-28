/**
 * 悬浮歌词的呈现形态；两者互斥，同一时刻只挂一个浮层
 * desktop=桌面歌词卡（两行、可拖、带播放控制）；statusBar=状态栏单行条（零触摸、位置在设置里调）
 */
export type FloatingLyricMode = 'desktop' | 'statusBar';
