/**
 * In-memory R2 bucket for the node test project (#46).
 *
 * The DB-backed suites used to get a real R2 binding (env.ARCHIVE) from
 * `cloudflare:test`, but mysql2 cannot load in the workers vitest pool (the pool
 * forces nodejs_compat v1; see vitest.config.mts + #46), so those suites run in
 * the node project instead. This is the R2 surface the archive/manifest code
 * actually uses -- put / get / head -- with the one load-bearing semantic the
 * store relies on: `onlyIf: { etagDoesNotMatch: '*' }` makes put() return null
 * when the key already exists (the content-addressed race guard in
 * ArchiveStore.put). Plain put() overwrites (ManifestStore's read-modify-write).
 *
 * Not a full R2 implementation -- just the members exercised by these tests.
 */

interface PutOptions {
  httpMetadata?: { contentType?: string };
  onlyIf?: { etagDoesNotMatch?: string };
}

interface FakeR2Object {
  key: string;
  size: number;
  httpMetadata?: { contentType?: string };
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
}

function toUint8(value: ArrayBuffer | ArrayBufferView | string): Uint8Array {
  if (typeof value === 'string') return new TextEncoder().encode(value);
  if (value instanceof Uint8Array) return value;
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return new Uint8Array(value);
}

function makeObject(key: string, bytes: Uint8Array, httpMetadata?: { contentType?: string }): FakeR2Object {
  return {
    key,
    size: bytes.length,
    httpMetadata,
    async arrayBuffer() {
      // Return a fresh copy so callers can't mutate the stored bytes.
      return bytes.slice().buffer;
    },
    async text() {
      return new TextDecoder().decode(bytes);
    },
  };
}

export class FakeR2Bucket {
  private store = new Map<string, { bytes: Uint8Array; httpMetadata?: { contentType?: string } }>();

  async put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string,
    options?: PutOptions
  ): Promise<FakeR2Object | null> {
    // Honor the content-addressed race guard: etagDoesNotMatch '*' means
    // "only write if the key does not already exist". On a hit, R2 returns null.
    if (options?.onlyIf?.etagDoesNotMatch === '*' && this.store.has(key)) {
      return null;
    }
    const bytes = toUint8(value);
    this.store.set(key, { bytes, httpMetadata: options?.httpMetadata });
    return makeObject(key, bytes, options?.httpMetadata);
  }

  async get(key: string): Promise<FakeR2Object | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    return makeObject(key, entry.bytes, entry.httpMetadata);
  }

  async head(key: string): Promise<{ key: string; size: number } | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    return { key, size: entry.bytes.length };
  }
}

/** Build a fresh in-memory R2 bucket typed as the R2Bucket the code expects. */
export function fakeR2(): R2Bucket {
  return new FakeR2Bucket() as unknown as R2Bucket;
}
