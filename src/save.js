/**
 * Persistence backing for episode state (R2). Thin and dumb on purpose:
 * `readSave` hands back parsed, schema-versioned data or null, and every
 * failure path — storage unavailable, unreadable JSON, wrong version —
 * returns null so the game boots fresh instead of wedging. Callers decide
 * what a null means; here it only ever means "no usable save".
 *
 * The storage backing is injectable so dry-build checks can drive the real
 * code against an in-memory store (node has no localStorage).
 */

const KEY = "hc-save-v1";
const SCHEMA_VERSION = 1;

function defaultStorage() {
  return typeof localStorage === "undefined" ? null : localStorage;
}

function log2() {
  return typeof console === "undefined" ? { warn() {} } : console;
}

/**
 * A parsed save, or null. Null covers: no storage, no save, unparsable
 * JSON, and a foreign schema version — each logged once, never thrown.
 */
export function readSave({ storage = defaultStorage(), log = log2() } = {}) {
  if (!storage) {
    return null;
  }
  let raw = null;
  try {
    raw = storage.getItem(KEY);
  } catch (err) {
    log.warn("[save] storage read failed:", err && err.message);
    return null;
  }
  if (!raw) {
    return null;
  }
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || data.version !== SCHEMA_VERSION) {
      throw new Error(`expected schema ${SCHEMA_VERSION}`);
    }
    return data;
  } catch (err) {
    log.warn("[save] discarding unreadable save:", err && err.message);
    return null;
  }
}

/** Best-effort write. A full or blocked store drops the save, not the game. */
export function writeSave(data, { storage = defaultStorage(), log = log2() } = {}) {
  if (!storage || !data || typeof data !== "object") {
    return false;
  }
  try {
    storage.setItem(KEY, JSON.stringify({ ...data, version: SCHEMA_VERSION }));
    return true;
  } catch (err) {
    log.warn("[save] could not persist:", err && err.message);
    return false;
  }
}

export { KEY as SAVE_KEY };