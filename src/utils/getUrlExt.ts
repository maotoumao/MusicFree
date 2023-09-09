import {URL} from 'react-native-url-polyfill';

export default function getUrlExt(url?: string) {
    if (!url) {
        return;
    }
    const urlObj = new URL(url);
    const filePath = urlObj.pathname;

    return (
        filePath.substring(filePath.lastIndexOf('.'), filePath.length) ||
        filePath
    );
}
