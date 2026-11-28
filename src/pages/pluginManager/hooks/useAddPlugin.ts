/**
 * 「添加插件」编排 hook：文件或 URL 安装统一交给全局 busy 编排，脱离 panel 和页面生命周期后台执行
 * 页顶横幅显示进度，完成后显示汇总 toast；URL 在 panel 内校验，通过后关闭 panel 并后台安装
 */
import { useAtomValue } from 'jotai';
import { useCallback } from 'react';

import { showToast } from '@/components/overlay';
import { pluginManager } from '@/core/plugin';
import { t } from '@/i18n';
import { pickFile } from '@/infra/documentPicker';
import { normalizeHttpUrl } from '@/utils/url';
import { showActionSheetPanel } from '@/widgets/overlays/ActionSheetPanel';
import { showTextPromptPanel } from '@/widgets/overlays/TextPromptPanel';

import { summarizeInstall } from '../lib/installSummary';
import { pluginOpAtom, startPluginOp } from '../lib/pluginOp';

export function useAddPlugin(): { promptAdd: () => void; installing: boolean } {
    const installing = useAtomValue(pluginOpAtom) === 'installing';

    // 文件安装无 panel 承载 loading：选定文件后交由全局 busy 编排后台执行
    const runFileInstall = useCallback(async () => {
        let picked: Awaited<ReturnType<typeof pickFile>>;
        try {
            picked = await pickFile();
        } catch {
            showToast(t('feedback.unknownError'), { type: 'error' });
            return;
        }
        if (!picked) {
            return;
        }
        const { uri } = picked;
        const started = startPluginOp('installing', async () =>
            summarizeInstall(await pluginManager.installFromFile(uri)),
        );
        if (!started) {
            showToast(t('pluginManager.opInProgress'), { type: 'info' });
        }
    }, []);

    const promptAdd = useCallback(() => {
        showActionSheetPanel({
            title: t('pluginManager.add.title'),
            items: [
                {
                    icon: 'link',
                    label: t('pluginManager.add.fromUrl'),
                    onPress: promptUrlInstall,
                },
                {
                    icon: 'folder-open',
                    label: t('pluginManager.add.fromFile'),
                    onPress: runFileInstall,
                },
            ],
        });
    }, [runFileInstall]);

    return { promptAdd, installing };
}

/** URL 安装：在 panel 内校验；通过后关闭 panel，交由全局 busy 编排后台执行，busy 时保留 panel 提示 */
function promptUrlInstall(): void {
    showTextPromptPanel<void>({
        title: t('pluginManager.add.enterUrl'),
        placeholder: t('pluginManager.add.urlExample'),
        autoCapitalize: 'none',
        autoCorrect: false,
        inputMode: 'url',
        onSubmit: async raw => {
            // 校验与请求用同一个规范化后的串：粘贴带进来的换行 / 零宽字符不能只在校验里被宽容掉
            const url = normalizeHttpUrl(raw);
            if (!url) {
                showToast(t('pluginManager.add.invalidUrl'), { type: 'error' });
                return { ok: false };
            }
            const started = startPluginOp('installing', async () =>
                summarizeInstall(await pluginManager.installFromUrl(url)),
            );
            if (!started) {
                showToast(t('pluginManager.opInProgress'), { type: 'info' });
                return { ok: false };
            }
            return { ok: true, result: undefined };
        },
    });
}
