/**
 * Worker-side cap on unauthenticated POST /investigations (#282).
 *
 * WAF is the first line; this is defense-in-depth so a missed WAF rule
 * cannot mint unbounded investigations. Count is per client IP over a
 * sliding window. Cache API when present; in-memory otherwise (tests).
 */

import {
  DEFAULT_INVESTIGATION_CREATE_WINDOW_SECONDS,
  DEFAULT_MAX_INVESTIGATION_CREATES_PER_WINDOW,
  createCapExceeded,
  parsePositiveIntCap,
  type ResourceCapErrorBody,
} from './resource-caps';

export interface CreateCapStore {
  increment(key: string, windowSec: number): Promise<number>;
}

const memorySlots = new Map<string, { count: number; resetAt: number }>();

export function memoryCreateCapStore(
  map: Map<string, { count: number; resetAt: number }> = memorySlots
): CreateCapStore {
  return {
    async increment(key, windowSec) {
      const now = Date.now();
      const slot = map.get(key);
      if (!slot || slot.resetAt <= now) {
        map.set(key, { count: 1, resetAt: now + windowSec * 1000 });
        return 1;
      }
      slot.count += 1;
      return slot.count;
    },
  };
}

export function cacheCreateCapStore(cache: Cache): CreateCapStore {
  return {
    async increment(key, windowSec) {
      const req = new Request(`https://create-cap.invalid/${encodeURIComponent(key)}`);
      const existing = await cache.match(req);
      let count = 0;
      if (existing) {
        const n = Number(await existing.text());
        if (Number.isFinite(n) && n >= 0) count = n;
      }
      count += 1;
      await cache.put(
        req,
        new Response(String(count), {
          headers: { 'Cache-Control': `max-age=${windowSec}` },
        })
      );
      return count;
    },
  };
}

export function defaultCreateCapStore(): CreateCapStore {
  const cachesObj = (globalThis as { caches?: { default?: Cache } }).caches;
  if (cachesObj?.default) return cacheCreateCapStore(cachesObj.default);
  return memoryCreateCapStore();
}

export function clientIp(request: Request): string {
  const cf = request.headers.get('CF-Connecting-IP')?.trim();
  if (cf) return cf;
  const forwarded = request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  return 'unknown';
}

export async function checkInvestigationCreateCap(
  request: Request,
  env: {
    MAX_INVESTIGATION_CREATES_PER_WINDOW?: string;
    INVESTIGATION_CREATE_WINDOW_SECONDS?: string;
  },
  store: CreateCapStore = defaultCreateCapStore()
): Promise<{ allowed: true } | { allowed: false; body: ResourceCapErrorBody }> {
  const limit = parsePositiveIntCap(
    env.MAX_INVESTIGATION_CREATES_PER_WINDOW,
    DEFAULT_MAX_INVESTIGATION_CREATES_PER_WINDOW
  );
  const windowSec = parsePositiveIntCap(
    env.INVESTIGATION_CREATE_WINDOW_SECONDS,
    DEFAULT_INVESTIGATION_CREATE_WINDOW_SECONDS
  );
  const used = await store.increment(clientIp(request), windowSec);
  if (used > limit) {
    return { allowed: false, body: createCapExceeded(limit, used) };
  }
  return { allowed: true };
}
