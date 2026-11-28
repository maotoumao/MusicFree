/** 剪贴板：包 expo-clipboard 写入纯文本（复制歌曲 ID / 作者 / 专辑等） */
import * as Clipboard from 'expo-clipboard';

/** 复制纯文本到系统剪贴板 */
export async function copyText(text: string): Promise<void> {
    await Clipboard.setStringAsync(text);
}
