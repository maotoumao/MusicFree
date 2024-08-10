import DownloadDialog from './downloadDialog';
import EditSheetDetailDialog from './editSheetDetail';
import LoadingDialog from './loadingDialog';
import RadioDialog from './radioDialog';
import SimpleDialog from './simpleDialog';
import SubscribePluginDialog from './subscribePluginDialog';
import CheckStorage from '@/components/dialogs/components/checkStorage.tsx';

const dialogs = {
    SimpleDialog,
    RadioDialog,
    DownloadDialog,
    SubscribePluginDialog,
    LoadingDialog,
    EditSheetDetailDialog,
    CheckStorage,
};

export default dialogs;

export type IDialogType = typeof dialogs;
export type IDialogKey = keyof IDialogType;
