export function perfLogger() {
    const s = Date.now();

    return {
        mark(label?: string) {
            console.log(`[${label || 'log'}] ${Date.now() - s}ms`);
        },
    };
}
