export interface IPerfLogger {
    mark: (label?: string) => void;
}

export function perfLogger(): IPerfLogger {
    const s = Date.now();

    return {
        mark(label?: string) {
            console.log(`[${label || "log"}] ${Date.now() - s}ms`);
        },
    };
}
