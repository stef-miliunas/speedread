/** IndexedDB persistence. Book metadata and full text live in separate
 * stores so listing the library never loads book bodies. */

export interface BookMeta {
  id: string;
  title: string;
  wordCount: number;
  /** Word index of the reading position. */
  position: number;
  addedAt: number;
  updatedAt: number;
}

const DB_NAME = 'speedread';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('books')) {
          db.createObjectStore('books', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('texts')) {
          db.createObjectStore('texts');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listBooks(): Promise<BookMeta[]> {
  const db = await openDb();
  const store = db.transaction('books').objectStore('books');
  const books = await requestToPromise(store.getAll() as IDBRequest<BookMeta[]>);
  return books.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getBook(id: string): Promise<BookMeta | undefined> {
  const db = await openDb();
  const store = db.transaction('books').objectStore('books');
  return requestToPromise(store.get(id) as IDBRequest<BookMeta | undefined>);
}

export async function getText(id: string): Promise<string | undefined> {
  const db = await openDb();
  const store = db.transaction('texts').objectStore('texts');
  return requestToPromise(store.get(id) as IDBRequest<string | undefined>);
}

export async function addBook(title: string, text: string, wordCount: number): Promise<BookMeta> {
  const db = await openDb();
  const now = Date.now();
  const meta: BookMeta = {
    id: crypto.randomUUID(),
    title,
    wordCount,
    position: 0,
    addedAt: now,
    updatedAt: now,
  };
  const tx = db.transaction(['books', 'texts'], 'readwrite');
  tx.objectStore('books').put(meta);
  tx.objectStore('texts').put(text, meta.id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return meta;
}

export async function updatePosition(id: string, position: number): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('books', 'readwrite');
  const store = tx.objectStore('books');
  const meta = await requestToPromise(store.get(id) as IDBRequest<BookMeta | undefined>);
  if (!meta) return;
  meta.position = position;
  meta.updatedAt = Date.now();
  store.put(meta);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteBook(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(['books', 'texts'], 'readwrite');
  tx.objectStore('books').delete(id);
  tx.objectStore('texts').delete(id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
