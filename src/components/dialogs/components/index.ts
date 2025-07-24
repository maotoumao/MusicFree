import CheckStorage from "@/components/dialogs/components/checkStorage.tsx";
import DownloadDialog from "./downloadDialog";
import EditSheetDetailDialog from "./editSheetDetail";
import LoadingDialog from "./loadingDialog";
import MarkdownDialog from "./markdownDialog";
import RadioDialog from "./radioDialog";
import SimpleDialog from "./simpleDialog";
import SubscribePluginDialog from "./subscribePluginDialog";
import SetScheduleCloseTimeDialog from "./setScheduleCloseTimeDialog";

const dialogs = {
    SimpleDialog,
    RadioDialog,
    DownloadDialog,
    SubscribePluginDialog,
    LoadingDialog,
    EditSheetDetailDialog,
    CheckStorage,
    MarkdownDialog,
    SetScheduleCloseTimeDialog,
};

export default dialogs;

export type IDialogType = typeof dialogs;
export type IDialogKey = keyof IDialogType;
