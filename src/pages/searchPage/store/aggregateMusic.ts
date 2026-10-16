import { RequestStateCode } from "@/constants/commonConst";
import { aggregatePage, selectedSources } from "@/core/aggregateSearch/service";
import type { Plugin } from "@/core/pluginManager";
import { getDefaultStore } from "jotai";
import { aggregateSearchResultsAtom, PageStatus, pageStatusAtom } from "./atoms";

let nextRequestId = 0;

/** Search state is separate from the existing per-plugin results. */
export async function searchAggregateMusic(
    plugins: Plugin[],
    query?: string,
    queryPage?: number,
    expand = false,
) {
    const store = getDefaultStore();
    const previous = store.get(aggregateSearchResultsAtom).music;
    const newSearch = !expand && (queryPage === 1 || !previous ||
        (query !== undefined && query !== previous.query));
    if (!expand && !newSearch && previous && (
        previous.state === RequestStateCode.PENDING_FIRST_PAGE ||
        previous.state === RequestStateCode.PENDING_REST_PAGE ||
        previous.state === RequestStateCode.FINISHED
    )) return;

    const searchQuery = query ?? previous?.query ?? "";
    const page = newSearch || expand ? 1 : queryPage ?? (previous?.page ?? 0) + 1;
    const requestId = ++nextRequestId;
    const sourcePages = newSearch ? {} : { ...previous?.sourcePages };
    store.set(aggregateSearchResultsAtom, {
        music: {
            state: newSearch
                ? RequestStateCode.PENDING_FIRST_PAGE
                : RequestStateCode.PENDING_REST_PAGE,
            data: newSearch ? [] : previous?.data ?? [],
            query: searchQuery,
            page,
            endedPlugins: newSearch ? [] : previous?.endedPlugins ?? [],
            requestId,
            expanded: expand || (!newSearch && previous?.expanded) || false,
            sourcePages,
        },
    });

    const isCurrent = () =>
        store.get(aggregateSearchResultsAtom).music?.requestId === requestId;
    const activePlugins = plugins.filter(plugin =>
        newSearch || !previous?.endedPlugins.includes(plugin.hash),
    );
    const byPage = new Map<number, Plugin[]>();
    for (const plugin of activePlugins) {
        const nextPage = newSearch || expand ? 1 : (sourcePages[plugin.hash] ?? previous?.page ?? 0) + 1;
        byPage.set(nextPage, [...(byPage.get(nextPage) ?? []), plugin]);
    }
    let data = newSearch ? [] : previous?.data ?? [];
    const pages: Awaited<ReturnType<typeof aggregatePage>>["pages"] = [];
    for (const [nextPage, batchPlugins] of byPage) {
        const result = await aggregatePage(batchPlugins, searchQuery, nextPage, data, isCurrent);
        if (!isCurrent()) return;
        data = result.data;
        pages.push(...result.pages);
        batchPlugins.forEach(plugin => {
            sourcePages[plugin.hash] = nextPage;
        });
    }
    if (!isCurrent()) return;

    const endedPlugins = new Set(newSearch ? [] : previous?.endedPlugins ?? []);
    pages.forEach(({ plugin, result }) => {
        if (!result || result.isEnd !== false || !result.data?.length) {
            endedPlugins.add(plugin.hash);
        }
    });
    const allFailed = pages.length > 0 && pages.every(({ result }) => !result);
    let state = RequestStateCode.PARTLY_DONE;
    if (allFailed && !data.length) {
        state = RequestStateCode.ERROR;
    } else if (plugins.every(plugin => endedPlugins.has(plugin.hash)) &&
        !(expand && previous?.state === RequestStateCode.PARTLY_DONE)) {
        state = RequestStateCode.FINISHED;
    }
    store.set(aggregateSearchResultsAtom, {
        music: {
            state,
            data,
            query: searchQuery,
            page,
            endedPlugins: [...endedPlugins],
            requestId,
            expanded: expand || (!newSearch && previous?.expanded) || false,
            sourcePages,
        },
    });
    if (store.get(pageStatusAtom) !== PageStatus.EDITING) {
        store.set(pageStatusAtom, PageStatus.RESULT);
    }
}

export async function expandAggregateMusic() {
    const previous = getDefaultStore().get(aggregateSearchResultsAtom).music;
    if (!previous || previous.expanded || [RequestStateCode.PENDING_FIRST_PAGE, RequestStateCode.PENDING_REST_PAGE].includes(previous.state)) return;
    await searchAggregateMusic(await selectedSources("backup"), previous.query, 1, true);
}
