import ToastMessage from 'react-native-toast-message';

const Toast = {
    success(msg: string) {
        ToastMessage.show({
            type: 'success',
            text1: msg,
        });
    },
    warn(msg: string) {
        ToastMessage.show({
            type: 'warn',
            text1: msg,
        });
    },
};

export default Toast;
