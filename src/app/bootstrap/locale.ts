/**
 * 界面语言的启动恢复：config 有值即用，否则一次性迁移 legacy 的旧存储位置
 */
import { config } from '@/core/config';
import { setLocale } from '@/i18n';
import { getObject, getOrCreateMMKV } from '@/infra/storage';

/** legacy 把语言存在播放态那个 store 里（键名相同）；仅在新键从未写过时回看 */
const APP_PERSIST_STATUS_STORE_ID = 'App.PersistStatus';
const LEGACY_LANGUAGE_KEY = 'app.language';

/** 恢复用户所选界面语言；无有效持久值则保持 i18n 默认 */
export function restoreLocale(): void {
    // 用 getStored 不回落默认：新键已写过就以它为准，值非法也只回默认，不让 legacy 旧值盖回来
    const stored = config.getStored('app.language');
    if (stored !== undefined) {
        // config.get / getStored 都不校验值域，脏值（手改备份 / 更高版本写入）不能直接进 localeAtom
        if (config.isValid('app.language', stored)) {
            setLocale(stored);
        }
        return;
    }
    const legacy = getObject(
        getOrCreateMMKV(APP_PERSIST_STATUS_STORE_ID),
        LEGACY_LANGUAGE_KEY,
    );
    if (config.isValid('app.language', legacy)) {
        // 迁到 config 后不再回看 legacy
        config.set('app.language', legacy);
        setLocale(legacy);
    }
}
