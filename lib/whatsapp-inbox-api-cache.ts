/** Short-lived server cache to avoid hammering NocoDB on inbox polls. */
export const INBOX_NOCO_CACHE_MS = 10_000;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export function createInboxTtlCache<T>() {
  let entry: CacheEntry<T> | null = null;

  return {
    get(): T | null {
      if (!entry || entry.expiresAt <= Date.now()) return null;
      return entry.data;
    },
    getStale(): T | null {
      return entry?.data ?? null;
    },
    set(data: T, ttlMs = INBOX_NOCO_CACHE_MS) {
      entry = { data, expiresAt: Date.now() + ttlMs };
    },
    clear() {
      entry = null;
    },
  };
}

export function createInboxKeyedCache<T>() {
  const entries = new Map<string, CacheEntry<T>>();

  return {
    get(key: string): T | null {
      const entry = entries.get(key);
      if (!entry || entry.expiresAt <= Date.now()) {
        entries.delete(key);
        return null;
      }
      return entry.data;
    },
    getStale(key: string): T | null {
      return entries.get(key)?.data ?? null;
    },
    set(key: string, data: T, ttlMs = INBOX_NOCO_CACHE_MS) {
      entries.set(key, { data, expiresAt: Date.now() + ttlMs });
    },
    clear(key?: string) {
      if (key) entries.delete(key);
      else entries.clear();
    },
  };
}

export function isNocoRateLimitError(message: string): boolean {
  return /throttlerexception|too many requests|\b429\b/i.test(message);
}
