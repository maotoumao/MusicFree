export function safeStringify(raw: any): string {
    try {
        return JSON.stringify(raw);
    } catch {
        return "";
    }
}


export function safeParse<T = any>(raw?: string) {
    try {
        if (!raw) {
            return null;
        }
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}
