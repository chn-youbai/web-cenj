import type { RawWordTuple } from "./raw-words";
import type { ReciteWord } from "./types";

const CLOUD_VOCAB_URLS = ["/data/gaokao_2050.json", "./data/gaokao_2050.json", "/api/recite-vocab"];
const IDB_NAME = "gaokao_2050_db_v1";
const IDB_STORE = "vocab_store";

export function parseRawWords(raw: RawWordTuple[]): ReciteWord[] {
  return raw.map((item) => ({
    id: item[0],
    freq: item[1],
    word: item[2],
    meaning: item[3],
    forms: item[4]
      ? item[4]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
  }));
}

export function openVocabDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      resolve(null);
      return;
    }
    let resolved = false;
    const finish = (db: IDBDatabase | null) => {
      if (!resolved) {
        resolved = true;
        window.clearTimeout(timer);
        resolve(db);
      }
    };
    const timer = window.setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    }, 1500);

    try {
      const req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => finish(req.result);
      req.onerror = () => finish(null);
      req.onblocked = () => finish(null);
    } catch {
      finish(null);
    }
  });
}

export async function loadVocabFromIdb(db: IDBDatabase | null): Promise<ReciteWord[] | null> {
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readonly");
      const store = tx.objectStore(IDB_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const result = req.result as ReciteWord[] | undefined;
        if (result && result.length >= 2000) {
          resolve(result);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveVocabToIdb(db: IDBDatabase | null, words: ReciteWord[]): Promise<void> {
  if (!db || !words.length) return;
  try {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    for (const w of words) {
      store.put(w);
    }
  } catch (err) {
    console.warn("IDB write failed:", err);
  }
}

export async function fetchVocabFromCloud(): Promise<ReciteWord[] | null> {
  for (const url of CLOUD_VOCAB_URLS) {
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 4000);
      const resp = await fetch(url, { signal: controller.signal });
      window.clearTimeout(timeoutId);
      if (resp.ok) {
        const cType = resp.headers.get("content-type") || "";
        if (cType.includes("text/html")) continue;
        const data = (await resp.json()) as
          | { words?: RawWordTuple[]; raw?: RawWordTuple[] }
          | RawWordTuple[];
        const raw = Array.isArray(data) ? data : data.words || data.raw || [];
        if (Array.isArray(raw) && raw.length >= 2000) {
          return parseRawWords(raw);
        }
      }
    } catch {
      // try next URL
    }
  }
  return null;
}
