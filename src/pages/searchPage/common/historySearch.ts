import { getStorage, setStorage } from "@/utils/storage";

export async function getHistory() {
    return (await getStorage("history-search")) ?? [];
}

export async function addHistory(query: string) {
    let searchList = await getHistory();
    searchList = [query].concat(searchList.filter((_: string) => _ !== query));
    await setStorage("history-search", searchList);
}

export async function removeHistory(query: string) {
    let searchList = await getHistory();
    searchList = searchList.filter((_: string) => _ !== query);
    await setStorage("history-search", searchList);
}

export async function removeAllHistory() {
    await setStorage("history-search", []);
}
