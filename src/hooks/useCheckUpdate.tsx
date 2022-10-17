import useDialog from '@/components/dialogs/useDialog';
import checkUpdate from '@/utils/checkUpdate';
import Toast from '@/utils/toast';
import {useEffect} from 'react';

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
