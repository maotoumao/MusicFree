import { atom, getDefaultStore, useAtomValue } from "jotai";
import getOrCreateMMKV from "@/utils/getOrCreateMMKV";
import {
    calculateSourceHealth,
    SourceHealthRecord,
    SourceOperation,
    updateSourceHealthRecord,
} from "./model";

const storage = getOrCreateMMKV("plugin.sourceHealth");
const STORAGE_KEY = "records";

function loadRecords(): Record<string, SourceHealthRecord> {
    const raw = storage.getString(STORAGE_KEY);
    if (!raw) return {};
    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

const recordsAtom = atom<Record<string, SourceHealthRecord>>(loadRecords());

function persist(records: Record<string, SourceHealthRecord>) {
    storage.set(STORAGE_KEY, JSON.stringify(records));
}

export function recordSourceOperation(
    pluginName: string,
    operation: SourceOperation,    success: boolean,
    latencyMs: number,
) {
    const store = getDefaultStore();
    const records = store.get(recordsAtom);
    const nextRecord = updateSourceHealthRecord(
        records[pluginName],
        operation,
        success,
        latencyMs,
    );
    const nextRecords = {
        ...records,
        [pluginName]: nextRecord,
    };
    store.set(recordsAtom, nextRecords);
    persist(nextRecords);
}

export function getSourceHealth(pluginName: string) {
    return getDefaultStore().get(recordsAtom)[pluginName];
}

export function getSourceHealthSummary(pluginName: string) {
    return calculateSourceHealth(getSourceHealth(pluginName));
}

export function useSourceHealthSummary(pluginName: string) {
    const records = useAtomValue(recordsAtom);
    return calculateSourceHealth(records[pluginName]);
}

export * from "./model";
