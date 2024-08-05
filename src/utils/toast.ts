import {IToastConfig, showToast} from '@/components/base/toast';

function success(message: string, config?: IToastConfig) {
    showToast({
        message,
        ...config,
        type: 'success',
    });
}

function warn(message: string, config?: IToastConfig) {
    showToast({
        message,
        ...config,
        type: 'warn',
    });
}

const Toast = {
    success,
    warn,
};

export default Toast;
