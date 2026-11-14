export type StorageDurability = 'persistent' | 'not-persistent' | 'unknown';

/** Asks the browser to keep this site's storage. Returns what the browser decided. */
export async function requestDurability(): Promise<StorageDurability> {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.storage?.persist !== 'function') return 'unknown';
    return (await navigator.storage.persist()) ? 'persistent' : 'not-persistent';
  } catch {
    return 'unknown';
  }
}

/** Reads the current state without asking for anything. */
export async function readDurability(): Promise<StorageDurability> {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.storage?.persisted !== 'function') return 'unknown';
    return (await navigator.storage.persisted()) ? 'persistent' : 'not-persistent';
  } catch {
    return 'unknown';
  }
}
