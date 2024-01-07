export default function <T = any>(raw: string) {
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}
