import PluginManager from "@/core/pluginManager";
import { useCallback, useEffect, useState } from "react";

export default function (hash: string) {
    const [tags, setTags] =
        useState<IPlugin.IGetRecommendSheetTagsResult | null>(null);

    const query = useCallback(async () => {
        const plugin = PluginManager.getByHash(hash);
        if (plugin) {
            try {
                const result = await plugin.methods?.getRecommendSheetTags?.();
                if (!result) {
                    throw new Error();
                }
                setTags(result);
            } catch {
                setTags(null);
            }
        }
    }, []);

    useEffect(() => {
        query();
    }, []);

    return tags;
}
