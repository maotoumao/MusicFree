import { IToastConfig, showToast } from "@/components/base/toast";

type IToastOptions = Omit<IToastConfig, "type"> & {
    type?: IToastConfig["type"];
};

function success(message: string, config?: IToastOptions) {
    showToast({
        message,
        ...config,
        type: "success",
    });
}

function warn(message: string, config?: IToastOptions) {
    showToast({
        message,
        ...config,
        type: "warn",
    });
}

const Toast = {
    success,
    warn,
};

export default Toast;
