export default function (raw: any): string {
    try {
        return JSON.stringify(raw);
    } catch {
        return '';
    }
}
