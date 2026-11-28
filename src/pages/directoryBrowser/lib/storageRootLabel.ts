/**
 * 存储根的展示名：内置存储用我们自己的固定文案（各 ROM 的系统描述五花八门、还常带机型名）；
 * SD 卡等外部卷优先用系统给的卷名（已本地化，如「SD 卡」），拿不到才兜底文案
 */
import type { t } from '@/i18n';
import type { DirEntry } from '@/infra/fileBrowser';

export function storageRootLabel(entry: DirEntry, translate: typeof t): string {
    if (entry.volume?.isPrimary) {
        return translate('scanSettings.picker.internalStorage');
    }
    if (entry.name) {
        return entry.name;
    }
    // 兜底带上卷标识（路径末段，如 1A2B-3C4D）：两张都没名字的卡否则会显示成同一行
    const id = entry.path.slice(entry.path.lastIndexOf('/') + 1);
    return id
        ? translate('scanSettings.picker.externalStorageNamed', { id })
        : translate('scanSettings.picker.externalStorage');
}
