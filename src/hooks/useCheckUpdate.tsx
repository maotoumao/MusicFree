import useDialog from '@/components/dialogs/useDialog';
import Config from '@/core/config';
import checkUpdate from '@/utils/checkUpdate';
import Toast from '@/utils/toast';
import {compare} from 'compare-versions';
import {useEffect} from 'react';

export default function (callOnMount = true) {
    const {showDialog} = useDialog();

    const checkAndShowResult = (showToast = false, checkSkip = false) => {
        checkUpdate().then(updateInfo => {
            if (updateInfo?.needUpdate) {
                const {data} = updateInfo;
                const skipVersion = Config.get('status.app.skipVersion');
                console.log(skipVersion, data);
                if (
                    checkSkip &&
                    skipVersion &&
                    compare(skipVersion, data.version, '>=')
                ) {
                    return;
                }
                showDialog('DownloadDialog', {
                    version: data.version,
                    content: data.changeLog,
                    fromUrl: data.download[0],
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
            checkAndShowResult(false, true);
        }
    }, []);

    return checkAndShowResult;
}
