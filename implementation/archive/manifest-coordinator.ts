/**
 * ManifestCoordinator: a Durable Object that serializes manifest appends per
 * investigation, closing the last-write-wins race in ManifestStore.append
 * (issue #70).
 *
 * The manifest is the chain-of-custody log (§3.1.2, §5.4.3). R2 has no native
 * append, so ManifestStore appends by read-modify-write (GET, concatenate, PUT).
 * Two concurrent writers for the same investigation can both read the same base
 * object and the later PUT silently drops the earlier writer entry, undermining
 * the reproducibility contract (§3.4).
 *
 * This DO is keyed by investigationId (idFromName), so every append for one
 * investigation is routed to a single instance. Within that instance appends are
 * run strictly one at a time via an in-memory promise chain (a mutex), so the
 * read-modify-write is serialized and no entry is lost. The manifest bytes stay
 * canonical in R2 exactly as before, so ManifestStore.list() and
 * ManifestStore.manifestHash() are unchanged and the §3.4 hash contract holds
 * byte-for-byte; only the write path is gated.
 *
 * The DO holds no durable storage of its own: the serialization guarantee comes
 * from the single-instance routing plus the promise chain, not from DO storage.
 */

import { appendManifestLine } from './manifest';
import { investigationManifestPath } from './paths';

/** Minimal env subset the coordinator needs (structural subset of the Worker Env). */
interface ManifestCoordinatorEnv {
  ARCHIVE: R2Bucket;
}

interface AppendRequestBody {
  investigationId: string;
  line: string;
}

export class ManifestCoordinator {
  /**
   * Tail of the append chain. Each incoming append awaits the previous one
   * before running its own read-modify-write, so appends never interleave.
   */
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: ManifestCoordinatorEnv
  ) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    let body: AppendRequestBody;
    try {
      body = (await request.json()) as AppendRequestBody;
    } catch {
      return new Response("Invalid JSON body", { status: 400 });
    }

    if (!body || typeof body.investigationId !== "string" || typeof body.line !== "string") {
      return new Response("Missing investigationId or line", { status: 400 });
    }

    const path = investigationManifestPath(body.investigationId);

    // Serialize: take the current tail as our predecessor, install a fresh
    // barrier as the new tail, then release it once we finish (success OR
    // failure) so a failed append never wedges the queue.
    const predecessor = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });

    try {
      await predecessor;
      await appendManifestLine(this.env.ARCHIVE, path, body.line);
      return new Response(null, { status: 204 });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return new Response(`Manifest append failed: ${message}`, { status: 500 });
    } finally {
      release();
    }
  }
}
