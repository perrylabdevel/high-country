/**
 * Targets three@0.185.1.
 *
 * Per-browser cache for the baked splat map.
 *
 * bakeSplatMap walks 2048 x 2560 = 5.24 M pixels calling biomeAt, creekFactor,
 * lakeFactor, lakeWaterSignedDistance and the road polyline search at each one.
 * Measured standalone in node: 17.0 s, with no caching of any kind — the boot
 * profile attributed ~10.8 s of main-thread blocking to it and its callees.
 *
 * The result is a pure function of the authored world (map polylines, biome
 * rectangles, the lake ellipse and the heightfield), so it is identical on
 * every boot for every player. Cache the raw RGBA bytes in IndexedDB and the
 * second and later boots skip the bake entirely.
 *
 * localStorage is not an option: the payload is 20.97 MB and the usual quota
 * is ~5 MB. IndexedDB stores the Uint8Array as a structured clone.
 *
 * Every path is guarded and degrades to "just bake it" — a private window, a
 * blocked store, a quota refusal or a corrupt record must cost a slow boot,
 * never a broken one. This mirrors src/save.js, which treats storage as
 * best-effort for the same reason.
 */

const DB_NAME = "hc-splat";
const DB_VERSION = 1;
const STORE = "splat";

/**
 * Bump when anything the bake reads changes: map.js polylines/biomes, the lake
 * ellipse, splatMap.ts weights, or the heightfield. A stale cache would pin the
 * terrain to the old world, and that failure is silent and very confusing —
 * the ground simply disagrees with the geometry. Keyed rather than hashed
 * because hashing the inputs means loading them, which is the cost we are
 * avoiding.
 */
export const SPLAT_CACHE_VERSION = "v1-2026-09-11";

function idb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

export type CachedSplat = { data: Uint8Array; width: number; height: number };

/** The cached bake, or null. Null always means "bake it yourself". */
export async function readSplatCache(
  key: string,
  width: number,
  height: number
): Promise<CachedSplat | null> {
  const db = await idb();
  if (!db) {
    return null;
  }
  try {
    const rec = await new Promise<any>((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
      tx.onerror = () => resolve(null);
    });
    if (!rec || !rec.data) {
      return null;
    }
    const data: Uint8Array = rec.data instanceof Uint8Array ? rec.data : new Uint8Array(rec.data);
    // Dimensions must match what the caller is about to build. A cache written
    // at a different splat resolution is not a texture we can substitute.
    if (rec.width !== width || rec.height !== height || data.length !== width * height * 4) {
      return null;
    }
    return { data, width: rec.width, height: rec.height };
  } catch {
    return null;
  } finally {
    db.close();
  }
}

/** Best-effort write. A full or blocked store drops the cache, not the boot. */
export async function writeSplatCache(
  key: string,
  data: Uint8Array,
  width: number,
  height: number
): Promise<void> {
  const db = await idb();
  if (!db) {
    return;
  }
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      // Drop any older version's entry so the store cannot grow without bound
      // as the version key changes across releases.
      const keys = store.getAllKeys();
      keys.onsuccess = () => {
        for (const k of keys.result || []) {
          if (k !== key) {
            store.delete(k);
          }
        }
        store.put({ data, width, height, written: Date.now() }, key);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // Quota, private mode, or a store that refuses writes: not fatal.
  } finally {
    db.close();
  }
}
