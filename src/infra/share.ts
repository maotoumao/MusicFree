/**
 * 系统分享：文本走 RN Share，图片走 expo-sharing（自带 FileProvider，Android 无需手工配置）
 * 用户取消不报错（两者取消都 resolve）
 */
import { shareAsync } from 'expo-sharing';
import { Share } from 'react-native';

import { localPathToUri } from '@/utils/media';

/** 打开系统分享面板分享文本；title 作为 Android chooser 标题（其他平台按 RN 支持处理） */
export async function shareText(text: string, title?: string): Promise<void> {
    await Share.share(
        { message: text },
        title ? { dialogTitle: title } : undefined,
    );
}

/** 打开系统分享面板分享本地图片；path 可为裸路径或 file:// URI */
export async function shareImage(path: string, title?: string): Promise<void> {
    await shareAsync(localPathToUri(path), {
        dialogTitle: title,
    });
}
