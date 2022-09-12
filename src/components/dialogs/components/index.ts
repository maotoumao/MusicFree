import DownloadDialog from './downloadDialog';
import RadioDialog from './radioDialog';
import SimpleDialog from './simpleDialog';

const dialogs = {
    SimpleDialog,
    RadioDialog,
    DownloadDialog,
};

const dialogArray: Array<[string, (...args: any) => JSX.Element]> =
    Object.entries(dialogs);

export default dialogArray;

export type IDialogType = typeof dialogs;
export type IDialogKey = keyof IDialogType;
