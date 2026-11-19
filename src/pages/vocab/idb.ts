import type { VocabApiResponse } from "@shared/types";
import type { VocabEntry } from "./types";

export const D1_VOCAB_API = "/api/vocab";
export const DATA_VOCAB_URL = "./data/vocab.json";
export const STORAGE_KEY_BASELINE_CACHE = "pep_vocab_baseline_cache_v2";
export const STORAGE_KEY_BASELINE_VERSION = "pep_vocab_baseline_ver_v2";
export const STORAGE_KEY_CUSTOM_VOCAB = "pep_iphone_vocab_custom_v2";
export const STORAGE_KEY_HISTORY = "pep_iphone_vocab_history_v1";

const IDB_NAME = "pep_vocab_offline_db_v2";
const IDB_STORE = "vocab_store";

export function openVocabIDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      resolve(null);
      return;
    }
    try {
      const req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function getIdbCachedVocab(): Promise<VocabEntry[] | null> {
  try {
    const db = await openVocabIDB();
    if (!db) return null;
    return await new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, "readonly");
        const store = tx.objectStore(IDB_STORE);
        const req = store.get("words");
        req.onsuccess = () => resolve((req.result as VocabEntry[] | undefined) ?? null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

export async function setIdbCachedVocab(words: VocabEntry[]): Promise<boolean> {
  try {
    const db = await openVocabIDB();
    if (!db) return false;
    return await new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, "readwrite");
        const store = tx.objectStore(IDB_STORE);
        store.put(words, "words");
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  } catch {
    return false;
  }
}

export interface BaselineVocabFetchResult {
  words: VocabEntry[];
  version?: string;
  fromD1: boolean;
}

export async function fetchBaselineVocabData(): Promise<BaselineVocabFetchResult | null> {
  let res: Response | null = null;
  let fromD1 = false;

  try {
    res = await fetch(D1_VOCAB_API);
    if (res.ok) fromD1 = true;
  } catch {
    res = null;
  }

  if (!res || !res.ok) {
    res = await fetch(DATA_VOCAB_URL);
    fromD1 = false;
  }

  if (!res.ok) {
    throw new Error(`HTTP error ${res.status}`);
  }

  const data = (await res.json()) as VocabApiResponse;
  if (!data || !Array.isArray(data.words) || data.words.length === 0) {
    return null;
  }

  const words = data.words.map((w) => ({ ...w })) as VocabEntry[];
  void setIdbCachedVocab(words);
  try {
    window.localStorage.setItem(STORAGE_KEY_BASELINE_CACHE, JSON.stringify(words));
    if (data.version) {
      window.localStorage.setItem(STORAGE_KEY_BASELINE_VERSION, data.version);
    }
  } catch {
    // ignore storage quota errors
  }

  return { words, version: data.version, fromD1 };
}
