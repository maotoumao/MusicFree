export interface Storage { getString(key: string): string | undefined; set(key: string, value: string): void; delete?(key: string): void }
export class Cache {
    constructor(private storage: Storage, private prefix: string, private maxEntries = 1200) {}
    read<T>(key: string, maxAge = Infinity): T | undefined {
        try {
            const item = JSON.parse(this.storage.getString(`${this.prefix}.${key}`) ?? "null");
            if (item && Date.now() - item.at < maxAge) return item.value as T;
        } catch { /* Invalid or unavailable storage is a cache miss. */ }
        return undefined;
    }
    write(key: string, value: unknown) {
        try {
            this.storage.set(`${this.prefix}.${key}`, JSON.stringify({ at: Date.now(), value }));
            // A compact index bounds persistent values even with the minimal storage interface.
            const indexKey = `${this.prefix}.index`;
            const index: string[] = JSON.parse(this.storage.getString(indexKey) ?? "[]");
            const next = [...index.filter(k => k !== key), key];
            for (const old of next.splice(0, Math.max(0, next.length - this.maxEntries))) {
                if (this.storage.delete) this.storage.delete(`${this.prefix}.${old}`);
                else this.storage.set(`${this.prefix}.${old}`, "null");
            }
            this.storage.set(indexKey, JSON.stringify(next));
        } catch { /* Storage failure must not prevent listening. */ }
    }
}
