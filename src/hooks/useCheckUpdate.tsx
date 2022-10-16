import useDialog from '@/components/dialogs/useDialog';
import pathConst from '@/constants/pathConst';
import checkUpdate from '@/utils/checkUpdate';
import openUrl from '@/utils/openUrl';
import Toast from '@/utils/toast';
import {useEffect} from 'react';
import {exists, unlink} from 'react-native-fs';

export default function (callOnMount = true) {
    const {showDialog} = useDialog();

    const checkAndShowResult = (showToast = false) => {
        checkUpdate().then(updateInfo => {
            if (updateInfo?.needUpdate) {
                const {data} = updateInfo;
                showDialog('DownloadDialog', {
                    title: `发现新版本(${data.version})`,
                    content: data.changeLog,
                    fromUrl: data.download[0],
                    toFile: `${
                        pathConst.downloadPath
                    }musicfree_${data.version.replace(/\./g, '_')}.apk`,
                    afterDownload(toFile) {
                        Toast.success('下载成功');
                        openUrl(`file://${toFile}`);
                    },
                    async afterCancel(toFile) {
                        if (await exists(toFile)) {
                            await unlink(toFile);
                        }
                    },
                });
            } else {
                if (showToast) {
                    Toast.success('当前是最新版本~');
                }
            }
        });
    };

    useEffect(() => {
        if (callOnMount) {
            checkAndShowResult();
        }
    }, []);

    return checkAndShowResult;
}
