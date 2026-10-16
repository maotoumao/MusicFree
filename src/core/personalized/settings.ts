interface Storage {
    getString(key: string): string | undefined;
    set(key: string, value: string): void;
    delete(key: string): void;
}

export class RecommendationSettings {
    constructor(private storage: Storage) {}
    read(): { enabled: boolean; apiKey: string } {
        try {
            const value = JSON.parse(this.storage.getString("lastfm") ?? "null");
            if (value?.enabled === true && typeof value.apiKey === "string" && /^[a-zA-Z0-9]{32}$/.test(value.apiKey)) {
                return { enabled: true, apiKey: value.apiKey };
            }
        } catch { /* Invalid configuration never opts a user in. */ }
        return { enabled: false, apiKey: "" };
    }
    enable(apiKey: string) {
        const key = apiKey.trim();
        if (!/^[a-zA-Z0-9]{32}$/.test(key)) throw new Error("Invalid Last.fm API key");
        this.storage.set("lastfm", JSON.stringify({ enabled: true, apiKey: key }));
    }
    disable() {
        this.storage.delete("lastfm");
    }
}
