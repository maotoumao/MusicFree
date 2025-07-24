import path from "path-browserify";

export default function getUrlExt(url?: string) {
    if (!url) {
        return;
    }
    const ext = path.extname(url);

    const extraTag = ext.indexOf("?");

    if (ext) {
        if (extraTag !== -1) {
            return ext.slice(0, extraTag);
        } else {
            return ext;
        }
    }
    return url;
}
