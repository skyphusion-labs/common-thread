/**
 * ManifestCoordinator serialization (issue #70).
 *
 * Tests the Durable Object append serializer directly (as a plain class), not
 * through the bound DO: the class imports only the archive layer (no mysql2), so
 * it loads in the workers pool, whereas instantiating the *bound* DO would pull
 * in the Worker entrypoint and its mysql2 dependency (which cannot load in this
 * pool -- see vitest.config.mts). The serialization mechanism (an in-instance
 * promise chain) is exercised with buckets that would lose entries without it.
 */
import { describe, expect, it } from "vitest";
import { ManifestStore } from "../../implementation/archive/manifest";
import { ManifestCoordinator } from "../../implementation/archive/manifest-coordinator";
import { investigationManifestPath } from "../../implementation/archive/paths";
import type { ManifestEntry } from "../../implementation/archive/types";
import type { R2BucketLike } from "../../implementation/archive/store";

function makeEntry(investigationId: string, i: number): ManifestEntry {
  return {
    hash: i.toString(16).padStart(64, "0"),
    source: "test",
    collectedAt: new Date(1700000000000 + i * 1000).toISOString(),
    investigationId,
    collectionMethod: { tool: "test", version: "1" },
    status: "present",
  } as ManifestEntry;
}

/** In-memory R2 stand-in that yields the event loop between read and write,
 *  so an un-serialized read-modify-write would interleave and lose entries. */
class DelayBucket implements R2BucketLike {
  data = new Map<string, Uint8Array>();
  async head() {
    return null;
  }
  async get(key: string) {
    const snapshot = this.data.get(key) ?? new Uint8Array(0);
    await new Promise((resolve) => setTimeout(resolve, 1));
    return {
      arrayBuffer: async () =>
        snapshot.buffer.slice(
          snapshot.byteOffset,
          snapshot.byteOffset + snapshot.byteLength
        ) as ArrayBuffer,
      text: async () => new TextDecoder().decode(snapshot),
    };
  }
  async put(key: string, value: Uint8Array | ArrayBuffer | string) {
    const bytes =
      typeof value === "string"
        ? new TextEncoder().encode(value)
        : value instanceof ArrayBuffer
          ? new Uint8Array(value)
          : value;
    this.data.set(key, bytes);
    return {};
  }
  countLines(investigationId: string): number {
    const bytes = this.data.get(investigationManifestPath(investigationId));
    if (!bytes) return 0;
    return new TextDecoder()
      .decode(bytes)
      .split("\n")
      .filter((l) => l.trim().length > 0).length;
  }
}

/** A racy bucket that holds every concurrent get() at a gate until N reads have
 *  started, forcing them all to observe the same base. Makes the un-serialized
 *  read-modify-write race deterministic (only the last put survives). */
class GatedRacyBucket implements R2BucketLike {
  data = new Map<string, Uint8Array>();
  private started = 0;
  private release!: () => void;
  private gate: Promise<void>;
  constructor(private readonly n: number) {
    this.gate = new Promise((resolve) => {
      this.release = resolve;
    });
  }
  async head() {
    return null;
  }
  async get(key: string) {
    const snapshot = this.data.get(key) ?? new Uint8Array(0);
    this.started += 1;
    if (this.started >= this.n) this.release();
    await this.gate;
    return {
      arrayBuffer: async () =>
        snapshot.buffer.slice(
          snapshot.byteOffset,
          snapshot.byteOffset + snapshot.byteLength
        ) as ArrayBuffer,
      text: async () => new TextDecoder().decode(snapshot),
    };
  }
  async put(key: string, value: Uint8Array | ArrayBuffer | string) {
    const bytes =
      typeof value === "string"
        ? new TextEncoder().encode(value)
        : value instanceof ArrayBuffer
          ? new Uint8Array(value)
          : value;
    this.data.set(key, bytes);
    return {};
  }
}

/** Minimal DurableObjectNamespace that routes every stub to one coordinator
 *  instance, mirroring idFromName(investigationId) determinism. */
function fakeNamespace(coordinator: ManifestCoordinator): DurableObjectNamespace {
  const stub = {
    fetch: (input: RequestInfo | URL, init?: RequestInit) =>
      coordinator.fetch(new Request(input as string, init)),
  };
  return {
    idFromName: (name: string) => ({ toString: () => name }),
    get: () => stub,
  } as unknown as DurableObjectNamespace;
}

function coordinatorFor(bucket: R2BucketLike): ManifestCoordinator {
  return new ManifestCoordinator({} as DurableObjectState, { ARCHIVE: bucket as R2Bucket });
}

async function postAppend(
  coordinator: ManifestCoordinator,
  investigationId: string,
  entry: ManifestEntry
): Promise<Response> {
  const line = JSON.stringify(entry) + "\n";
  return coordinator.fetch(
    new Request("https://manifest-coordinator/append", {
      method: "POST",
      body: JSON.stringify({ investigationId, line }),
    })
  );
}

describe("ManifestCoordinator serialization (issue #70)", () => {
  it("serializes concurrent appends so no entry is lost", async () => {
    const investigationId = "concurrent";
    const bucket = new DelayBucket();
    const coordinator = coordinatorFor(bucket);

    const N = 25;
    const responses = await Promise.all(
      Array.from({ length: N }, (_unused, i) =>
        postAppend(coordinator, investigationId, makeEntry(investigationId, i))
      )
    );

    expect(responses.every((r) => r.status === 204)).toBe(true);
    expect(bucket.countLines(investigationId)).toBe(N);
  });

  it("returns 500 on a failing append without wedging the queue", async () => {
    const investigationId = "recovers";
    const bucket = new DelayBucket();
    const coordinator = coordinatorFor(bucket);

    // First append succeeds.
    expect((await postAppend(coordinator, investigationId, makeEntry(investigationId, 1))).status).toBe(204);

    // Force the next append to fail inside the DO.
    const originalPut = bucket.put.bind(bucket);
    let failNext = true;
    bucket.put = async (k: string, v: Uint8Array | ArrayBuffer | string) => {
      if (failNext) {
        failNext = false;
        throw new Error("simulated R2 put failure");
      }
      return originalPut(k, v);
    };

    const failed = await postAppend(coordinator, investigationId, makeEntry(investigationId, 2));
    expect(failed.status).toBe(500);

    // The queue is not wedged: a subsequent append still completes.
    expect((await postAppend(coordinator, investigationId, makeEntry(investigationId, 3))).status).toBe(204);
    expect(bucket.countLines(investigationId)).toBe(2);
  });

  it("rejects non-POST with 405 and a malformed body with 400", async () => {
    const coordinator = coordinatorFor(new DelayBucket());
    expect(
      (await coordinator.fetch(new Request("https://manifest-coordinator/append", { method: "GET" }))).status
    ).toBe(405);
    expect(
      (
        await coordinator.fetch(
          new Request("https://manifest-coordinator/append", { method: "POST", body: "not json" })
        )
      ).status
    ).toBe(400);
  });

  it("ManifestStore.append delegates to the coordinator and preserves all entries", async () => {
    const investigationId = "delegated";
    const bucket = new DelayBucket();
    const coordinator = coordinatorFor(bucket);
    const store = new ManifestStore({
      bucket,
      investigationId,
      coordinator: fakeNamespace(coordinator),
    });

    const N = 20;
    await Promise.all(
      Array.from({ length: N }, (_unused, i) => store.append(makeEntry(investigationId, i)))
    );

    const entries = await store.list();
    expect(entries.length).toBe(N);
    expect(new Set(entries.map((e) => e.hash)).size).toBe(N);
  });

  it("demonstrates the hazard: the un-coordinated inline path loses entries under a forced interleave", async () => {
    const investigationId = "racy";
    const N = 10;
    const bucket = new GatedRacyBucket(N);
    // No coordinator: exercises the inline read-modify-write fallback.
    const store = new ManifestStore({ bucket, investigationId });

    await Promise.all(
      Array.from({ length: N }, (_unused, i) => store.append(makeEntry(investigationId, i)))
    );

    const entries = await store.list();
    expect(entries.length).toBeLessThan(N);
  });
});
