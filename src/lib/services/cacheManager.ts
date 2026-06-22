// ==================== CACHE MANAGER ====================
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 6000; // 6 seconds TTL (increased from 3s for production stability)
const CACHE_TTL_LONG_MS = 30000; // 30 seconds for infrequently-changing data (increased from 15s)

/** Maximum entries in the cache before eviction kicks in */
const CACHE_MAX_SIZE = 200;

/** When cache exceeds max size, evict oldest entries down to this target */
const CACHE_EVICT_TARGET = 150;

const queryCache = new Map<string, CacheEntry<any>>();

/** LRU tracking — stores keys in access order (most recently used at the end) */
const accessOrder: string[] = [];

/** Update LRU order: move key to the end (most recently used) */
function touchLru(key: string): void {
  const idx = accessOrder.indexOf(key);
  if (idx !== -1) {
    accessOrder.splice(idx, 1);
  }
  accessOrder.push(key);
}

/** Evict oldest entries when cache exceeds max size */
function enforceMaxSize(): void {
  if (queryCache.size <= CACHE_MAX_SIZE) return;
  const toEvict = queryCache.size - CACHE_EVICT_TARGET;
  const evicted = new Set<string>();
  for (const key of accessOrder) {
    if (evicted.size >= toEvict) break;
    if (queryCache.has(key)) {
      queryCache.delete(key);
      evicted.add(key);
    }
  }
  // Clean up accessOrder
  for (const key of evicted) {
    const idx = accessOrder.indexOf(key);
    if (idx !== -1) accessOrder.splice(idx, 1);
  }
}

/** Remove key from LRU tracking */
function removeFromLru(key: string): void {
  const idx = accessOrder.indexOf(key);
  if (idx !== -1) accessOrder.splice(idx, 1);
}

export const CacheManager = {
  get<T>(key: string): T | null {
    const entry = queryCache.get(key);
    if (!entry) return null;
    const isExpired = Date.now() - entry.timestamp > CACHE_TTL_MS;
    if (isExpired) {
      queryCache.delete(key);
      removeFromLru(key);
      return null;
    }
    touchLru(key);
    return entry.data as T;
  },

  /** Get with a custom TTL override (e.g., for long-lived cache) */
  getWithTtl<T>(key: string, ttlMs: number): T | null {
    const entry = queryCache.get(key);
    if (!entry) return null;
    const isExpired = Date.now() - entry.timestamp > ttlMs;
    if (isExpired) {
      queryCache.delete(key);
      removeFromLru(key);
      return null;
    }
    touchLru(key);
    return entry.data as T;
  },

  set<T>(key: string, data: T): void {
    // If the key already exists, just update it
    if (queryCache.has(key)) {
      queryCache.set(key, { data, timestamp: Date.now() });
      touchLru(key);
      return;
    }
    // Check if we need to evict before inserting
    if (queryCache.size >= CACHE_MAX_SIZE) {
      enforceMaxSize();
    }
    queryCache.set(key, { data, timestamp: Date.now() });
    touchLru(key);
  },

  /** Remove a single cache entry by exact key */
  remove(key: string): void {
    queryCache.delete(key);
    removeFromLru(key);
  },

  /** Invalidate all cache entries whose key includes the given pattern */
  invalidate(pattern: string): void {
    const toRemove: string[] = [];
    for (const key of queryCache.keys()) {
      if (key.includes(pattern)) {
        toRemove.push(key);
      }
    }
    for (const key of toRemove) {
      queryCache.delete(key);
      removeFromLru(key);
    }
  },

  /** Clear entire cache */
  clear(): void {
    queryCache.clear();
    accessOrder.length = 0;
  },

  /** Get current cache size (for debugging) */
  size(): number {
    return queryCache.size;
  },

  /** Remove all expired entries (can be called periodically) */
  prune(): number {
    const now = Date.now();
    let pruned = 0;
    const toRemove: string[] = [];
    for (const [key, entry] of queryCache.entries()) {
      if (now - entry.timestamp > CACHE_TTL_MS) {
        toRemove.push(key);
      }
    }
    for (const key of toRemove) {
      queryCache.delete(key);
      removeFromLru(key);
      pruned++;
    }
    return pruned;
  }
};