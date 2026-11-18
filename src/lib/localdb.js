// A small promise wrapper around IndexedDB — the on-device copy of everything.
// One database per signed-in user, so two accounts on one device never mix.

const VERSION = 1;

const STORES = {
  books: { keyPath: "id" },
  book_chapters: { keyPath: "id", indexes: ["book_id"] },
  book_words: { keyPath: "id", indexes: ["book_id"] },
  saved_words: { keyPath: "id", indexes: ["lemma"] },
  reading_progress: { keyPath: "book_id" },
  bookmarks: { keyPath: "id", indexes: ["book_id"] },
  outbox: { keyPath: "key" },        // changes waiting to sync
  files: { keyPath: "path" },        // PDFs, audio, covers (Blobs)
  translations: { keyPath: "key" },  // words tapped in the reader
  meta: { keyPath: "key" },
};

const req = (r) => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});

const done = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
});

export function openLocal(name) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(name, VERSION);
    open.onupgradeneeded = () => {
      const idb = open.result;
      for (const [store, { keyPath, indexes = [] }] of Object.entries(STORES)) {
        if (idb.objectStoreNames.contains(store)) continue;
        const os = idb.createObjectStore(store, { keyPath });
        for (const ix of indexes) os.createIndex(ix, ix);
      }
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => resolve(wrap(open.result));
  });
}

function wrap(idb) {
  const store = (name, mode = "readonly") => idb.transaction(name, mode).objectStore(name);

  return {
    close: () => idb.close(),

    get: (s, key) => req(store(s).get(key)),
    all: (s) => req(store(s).getAll()),
    byIndex: (s, index, value) => req(store(s).index(index).getAll(value)),
    countByIndex: (s, index, value) => req(store(s).index(index).count(value)),

    async put(s, value) {
      const tx = idb.transaction(s, "readwrite");
      tx.objectStore(s).put(value);
      await done(tx);
      return value;
    },

    async putMany(s, values) {
      if (!values.length) return;
      const tx = idb.transaction(s, "readwrite");
      const os = tx.objectStore(s);
      for (const v of values) os.put(v);
      await done(tx);
    },

    async del(s, key) {
      const tx = idb.transaction(s, "readwrite");
      tx.objectStore(s).delete(key);
      await done(tx);
    },

    async delMany(s, keys) {
      if (!keys.length) return;
      const tx = idb.transaction(s, "readwrite");
      const os = tx.objectStore(s);
      for (const k of keys) os.delete(k);
      await done(tx);
    },

    async delByIndex(s, index, value) {
      const tx = idb.transaction(s, "readwrite");
      const os = tx.objectStore(s);
      const keys = await req(os.index(index).getAllKeys(value));
      for (const k of keys) os.delete(k);
      await done(tx);
    },

    async replaceByIndex(s, index, value, rows) {
      const tx = idb.transaction(s, "readwrite");
      const os = tx.objectStore(s);
      const keys = await req(os.index(index).getAllKeys(value));
      for (const k of keys) os.delete(k);
      for (const r of rows) os.put(r);
      await done(tx);
    },
  };
}
