/**
 * In-memory fake R2 bucket for the node test project.
 *
 * The hybrid DB-backed suites (#46) run in the NODE vitest project because
 * mysql2 cannot load under the workers pool (nodejs_compat v1 / lru.min). The
 * node project has no `cloudflare:test`, so there is no miniflare R2 binding.
 * This fake stands in for `env.ARCHIVE`.
 *
 * FIDELITY TRADEOFF (recorded per #46): this implements ONLY the R2 surface the
 * archive + manifest code actually calls -- head(), get(), put() -- with just
 * enough conditional-write semantics to preserve the content-addressed store's
 * behavior:
 *
 *   - put() honors `onlyIf: { etagDoesNotMatch: '*' }` as "create only if the
 *     key is absent" (returns null when the key already exists), which is the
 *     one conditional ArchiveStore.put relies on for its race guard.
 *   - get() returns an object exposing arrayBuffer()/text() over the stored
 *     bytes; head() returns `{ size }`.
 *
 * It does NOT model: etags/versioning beyond the exists check, ranged reads,
 * list(), delete(), multipart uploads, checksums, or httpMetadata round-trips.
 * None of those are exercised by the archive/manifest/extractor/ingest paths
 * these suites drive. If a future suite needs real R2 fidelity (e.g. list or
 * range), run that subset in the workers pool instead; that is the separate
 * follow-up called out in #46. The prod path is unaffected: production uses a
 * real R2 binding; this fake exists only inside the test harness.
 */

interface StoredObject {
  bytes: Uint8Array;
  contentType?: string;
}

function toBytes(value: Uint8Array | ArrayBuffer | string): Uint8Array {
  if (typeof value === 'string') return new TextEncoder().encode(value);
  if (value instanceof Uint8Array) return value;
  return new Uint8Array(value);
}

/**
 * Build an in-memory bucket. Cast to R2Bucket at the call site: the archive
 * code depends on the narrower R2BucketLike surface, but the test env objects
 * are typed R2Bucket, so the extra R2Bucket methods are intentionally absent.
 */
export function createFakeR2(): R2Bucket {
  const store = new Map<string, StoredObject>();

  const bucket = {
    async head(key: string): Promise<{ size: number } | null> {
      const obj = store.get(key);
      return obj ? { size: obj.bytes.length } : null;
    },

    async get(
      key: string
    ): Promise<{
      arrayBuffer(): Promise<ArrayBuffer>;
      text(): Promise<string>;
    } | null> {
      const obj = store.get(key);
      if (!obj) return null;
      // Copy out so callers cannot mutate the stored bytes.
      const copy = obj.bytes.slice();
      return {
        async arrayBuffer(): Promise<ArrayBuffer> {
          return copy.buffer.slice(
            copy.byteOffset,
            copy.byteOffset + copy.byteLength
          ) as ArrayBuffer;
        },
        async text(): Promise<string> {
          return new TextDecoder().decode(copy);
        },
      };
    },

    async put(
      key: string,
      value: Uint8Array | ArrayBuffer | string,
      options?: {
        httpMetadata?: { contentType?: string };
        onlyIf?: { etagDoesNotMatch?: string };
      }
    ): Promise<unknown | null> {
      // Race guard: create-only-if-absent. Mirrors R2's etagDoesNotMatch: '*'.
      if (options?.onlyIf?.etagDoesNotMatch === '*' && store.has(key)) {
        return null;
      }
      const bytes = toBytes(value);
      store.set(key, { bytes, contentType: options?.httpMetadata?.contentType });
      return { key, size: bytes.length };
    },
  };

  return bucket as unknown as R2Bucket;
}
