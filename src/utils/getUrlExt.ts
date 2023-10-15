import path from 'path-browserify';

export default function getUrlExt(url?: string) {
    if (!url) {
        return;
    }
    const ext = path.extname(url);

    return ext || url;
}
