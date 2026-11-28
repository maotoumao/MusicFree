/**
 * 下载目录设置行的行为：选目录 / 恢复默认 / 消费目录浏览器的回传
 *
 * 权限门在进浏览器**之前**过：自定义目录要写在 app 私有区之外，没有全文件访问
 * 一路走到落盘才失败，用户已经白挑了一遍目录
 */
import { useNavigation, useRoute } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';

import { showToast } from '@/components/overlay';
import { useConfig } from '@/core/config';
import { download } from '@/core/download';
import { useT } from '@/i18n';
import {
    openStorageSettings,
    requestStorageWriteAccess,
} from '@/infra/permission';
import { showConfirmDialog } from '@/widgets/overlays/ConfirmDialog';

import type { SetDownloadDirResult } from '@/core/download';
import type { PlainKey } from '@/i18n';
import type { StorageAccessStatus } from '@/infra/permission';
import type { RouteProp } from '@react-navigation/native';

/**
 * 结果码 → 提示文案；ok 也给一句，否则用户只看到路径变了、不知道是否真的生效
 * `unsupported` 在当前 UI 到不了（无下载引擎的平台整个分区不渲染），
 * 留着是为了让映射对端口的返回值保持完备，端口加了新码时编译期就能发现
 */
const RESULT_MESSAGE: Record<SetDownloadDirResult, PlainKey> = {
    ok: 'settings.download.dirChanged',
    changing: 'settings.download.dirChanging',
    invalid: 'settings.download.dirInvalid',
    pinFailed: 'settings.download.dirPinFailed',
    notWritable: 'settings.download.dirNotWritable',
    staleFiles: 'settings.download.dirStaleFiles',
    unsupported: 'settings.download.dirUnsupported',
};

export function useDownloadDirSetting() {
    const t = useT();
    const navigation = useNavigation();
    const route =
        useRoute<
            RouteProp<
                { Settings: { pickedDownloadDir?: string } | undefined },
                'Settings'
            >
        >();
    // 订阅配置键而非只读一次：改完目录这一行要立刻显示新路径
    useConfig('basic.downloadPath');
    const dir = download.getDownloadDir();
    const isDefault = download.isUsingDefaultDownloadDir();
    /**
     * 两行各一个忙碌位——**两件事就是两个开关**
     *
     * 不能合成一个「正在跑哪一个」的枚举：那样第二行开始时会覆盖第一行的值，
     * 第二行结束时又把它清掉，于是第一行明明还在跑却显示空闲（读屏也报错了态）。
     * 两行确实可能同时在跑：并发由 core 兜（`#changeDownloadDir` 有 in-flight 闸，
     * 后一趟拿到 `changing` 并如实提示），这里只负责别让**同一行**被连点
     */
    const [choosing, setChoosing] = useState(false);
    const [resetting, setResetting] = useState(false);
    /**
     * 本次回传是否已落地。去重的是「这一次回传」，不是「这个路径」——
     * 参数清空后就复位，故用户再选同一个目录（比如上次因 busy 失败、处理完再来）照样生效
     */
    const appliedRef = useRef<string | undefined>(undefined);

    const apply = useCallback(
        (
            setBusy: (busy: boolean) => void,
            run: () => Promise<SetDownloadDirResult>,
        ) => {
            setBusy(true);
            run()
                .then(result => {
                    showToast(t(RESULT_MESSAGE[result]), {
                        type: result === 'ok' ? 'success' : 'info',
                    });
                })
                .catch(() => {
                    showToast(t('settings.download.dirNotWritable'), {
                        type: 'info',
                    });
                })
                .finally(() => setBusy(false));
        },
        [t],
    );

    // 消费目录浏览器的回传：拿到就落地，随后清 param 防重复触发
    const picked = route.params?.pickedDownloadDir;
    useEffect(() => {
        if (picked === undefined) {
            appliedRef.current = undefined; // 参数已清空：下一次回传（哪怕同一个目录）要能再落地
            return;
        }
        if (appliedRef.current === picked) {
            return; // locale 切换等重渲染让 effect 又跑了一次，同一次回传不重复落地
        }
        appliedRef.current = picked;
        navigation.setParams({ pickedDownloadDir: undefined });
        apply(setChoosing, () => download.setDownloadDir(picked));
    }, [picked, navigation, apply]);

    /**
     * 去挑目录：先拿到文件写权限，再进浏览器
     *
     * 直接 request 而不先 check：request 对已授予的情况会直接返回、不重复打扰
     * （见 infra/permission），少一次分支；≤10 上 WRITE 与 READ 同属 STORAGE 组，
     * READ 已授予时系统静默通过
     *
     * 两种没拿到：`blocked`（≤10 被永久拒绝）只能去系统设置页，故直接带他过去；
     * R+ 的 request 会跳系统设置页并返回即时快照（通常仍未授予），此时不进浏览器，
     * 提示用户授权后回来再点一次
     */
    const choose = useCallback(() => {
        setChoosing(true);
        requestStorageWriteAccess()
            // 请求本身失败（桥故障等）与「没授予」对用户是一回事
            .catch((): StorageAccessStatus => 'denied')
            .then(status => {
                if (status === 'granted') {
                    navigation.navigate('DirectoryBrowser', {
                        purpose: 'downloadDir',
                    });
                    return;
                }
                showToast(t('settings.download.dirNeedsPermission'), {
                    type: 'info',
                });
                if (status === 'blocked') {
                    // 打不开设置页也别再弹第二条同样的提示（那句已经说过了）
                    openStorageSettings().catch(() => undefined);
                }
            })
            .finally(() => setChoosing(false));
    }, [navigation, t]);

    /**
     * 恢复默认要过二次确认：这一行就挨着「选目录」，误点的代价是下载位置被换掉、
     * 而它不像选目录那样还有一步目录浏览器可以退出——点下去就直接生效了
     *
     * 文案只讲用户真正会担心的那件事（已下载的文件动不动），不吓唬人：
     * 换回默认**不搬也不删**任何已完成的文件（`#applyDownloadDir` 全程无搬移/删除，
     * 两趟清理落到原生后只删文件名匹配 `^[0-9a-f]{64}\.part$` 的孤儿断点），
     * 已开始的传输也因 destDir 钉在传输身份上而继续在原目录下完。故不用 danger 色
     *
     * **文案里刻意没提的一种间接后果**：`includeDownloadDir` 开着时下载目录同时被当作扫描根，
     * 换回默认后旧目录不再是根；**且仅当它也不被其他扫描根覆盖时**（全盘模式下卷根仍覆盖它；
     * 「指定目录」模式下若它不在 includedDirs 里就不覆盖），下次扫描才会把那里的歌
     * 从「本地音乐」里移除——文件与下载记录都还在，把它加回扫描目录即恢复。
     * 不写进正文是因为这个条件很窄，一两句话里写不准，写不准就会夸大影响；
     * 也没去 hook 里读扫描设置做条件文案——那点精确度不值这个耦合
     */
    const reset = useCallback(() => {
        showConfirmDialog({
            title: t('settings.download.dirResetConfirmTitle'),
            message: t('settings.download.dirResetConfirmMessage'),
            confirmText: t('common.reset'),
        })
            .then(ok => {
                if (ok) {
                    apply(setResetting, () => download.resetDownloadDir());
                }
            })
            .catch(() => undefined);
    }, [apply, t]);

    return { dir, isDefault, choosing, resetting, choose, reset };
}
