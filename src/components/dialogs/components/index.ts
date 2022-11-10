import DownloadDialog from './downloadDialog';
import LoadingDialog from './loadingDialog';
import RadioDialog from './radioDialog';
import SimpleDialog from './simpleDialog';
import SubscribePluginDialog from './subscribePluginDialog';

const dialogs = {
    SimpleDialog,
    RadioDialog,
    DownloadDialog,
    SubscribePluginDialog,
    LoadingDialog,
};

const dialogArray: Array<[string, (...args: any) => JSX.Element]> =
    Object.entries(dialogs);

export default dialogArray;

export type IDialogType = typeof dialogs;
export type IDialogKey = keyof IDialogType;
