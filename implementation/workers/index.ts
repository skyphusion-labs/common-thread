/**
 * Common Thread Worker entry point.
 *
 * Uses Hyperdrive (MySQL) for relational storage. See implementation/db.ts.
 *
 * Routing (issue #75): requests dispatch through a single ROUTES table walked
 * once, rather than a linear chain of `if (method && path.match(...))` blocks.
 * Each route declares its method, an anchored pattern (capture groups become
 * `ctx.params`), an optional handler, and an optional `auth` funnel. When
 * `auth` is present the dispatcher resolves the investigation id (from the
 * first capture group, or from the `?investigation=` query for the manifest/
 * signature/verify/debug routes) and runs `authorizeOrRespond` before the
 * handler, exactly as the old inline blocks did. Routes that must validate
 * input before authorizing (single run, packet: `run_id` is 400-checked ahead
 * of the token check) omit `auth` and call `authorizeOrRespond` themselves, so
 * the original ordering of status codes is preserved.
 */

import { ManifestStore } from '../archive/manifest';
import { resolveArchiveBucket } from '../archive/dual-write';
// Durable Object that serializes manifest appends per investigation (issue #70).
// Must be exported from the Worker entrypoint so wrangler can bind the class.
export { ManifestCoordinator } from '../archive/manifest-coordinator';
import { ManifestSigner } from '../archive/signing';
import { execute, query, queryOne, readCommittedRow, resolveDatabase } from '../db';
import type { InvestigationRow } from '../schema/db-types';
import {
  accessErrorStatus,
  authorizeInvestigation,
  extractAccessToken,
  generateAccessToken,
  hashAccessToken,
  InvestigationAccessError,
  publicInvestigationView,
} from '../investigations/access';
import {
  CRYPTO_VERSION,
  computeKeyCheck,
  deriveInvestigationKey,
  sealInvestigationKeyForVpcHandoff,
} from '../crypto/investigation-key';
import {
  assertInvestigationActiveForWrite,
  insertSeedIfActive,
  sealInvestigationIfActive,
  softDeleteSeedIfActive,
  updateInvestigationMetadataIfActive,
} from '../investigations/write-guard';
import { deleteInvestigationData } from '../investigations/purge';
import { purgeInvestigationArchive } from '../investigations/archive-purge';
import {
  canonicalPairCount,
  ingestCapExceeded,
  pairCapExceeded,
  resolveResourceCaps,
  seedCapExceeded,
} from './resource-caps';
import {
  DEFAULT_MAX_JSON_BODY_BYTES,
  flattenIngestItems,
  jsonBodyTooLarge,
} from '../ingest/collect-limit';
import { packTextCell, readTextCell } from '../crypto/feature-cells';
import {
  mergeInvestigationMetadata,
  publicMetadataView,
  serializeInvestigationMetadata,
  validateMetadataPatch,
  type InvestigationMetadataPatch,
} from '../investigations/metadata';
import { authorizeIngestSecret } from '../archive/manifest-remote';
import type { ManifestEntry } from '../archive/types';
import { manifestStoreFor } from '../ingest/manifest-env';
import {
  EncryptedIngestKeyRequiredError,
  EmptyApifyIngestError,
  ingestApify,
  ingestApifyInstagram,
  ingestApifyReddit,
  ingestApifyBluesky,
  ingestApifyMastodon,
  ingestApifyTikTok,
  ingestApifyYouTube,
  ingestApifyFacebook,
  ingestApifyTwitter,
  TWITTER_ACCOUNT_EXTRACTORS,
  TWITTER_PAIR_EXTRACTORS,
} from '../ingest/apify-ingest';
import { resolveAttributionCredentials, parseAllowedGatewayHosts } from '../reasoner/credentials';
import { runAttribution } from '../reasoner/runner';
import { listAttributionRuns, getAttributionRun } from '../attribution/query';
import { enqueueAttributionJob } from '../attribution/enqueue';
import { shouldRunAttributionAsync } from '../attribution/dispatch';
import {
  parseFeaturesQueryParams,
  queryInvestigationFeatures,
} from '../features/query';
import { buildEvidencePacket, buildInvestigationEvidencePacket } from '../reporting/evidence-packet';
import { packetDocumentTitle, packetMarkdownToHtml } from '../reporting/packet-html';
// Single source of truth for the version (issue #43); resolveJsonModule inlines
// this at build time, matching the evidence packet (#32).
import pkg from '../../package.json';
import { dispatchPdfRender, vpcPdfEnabled } from '../reporting/pdf-dispatch';
import {
  assertBrowserOriginAllowed,
  corsPreflightResponse,
  withCors,
} from './cors';
import {
  HOSTED_API_CONTACT_EMAIL,
  HOSTED_API_CONTACT_NOTICE,
} from './contact';

export interface Env {
  DB: Hyperdrive;
  ARCHIVE: R2Bucket;
  /**
   * Optional second R2 bucket for synchronous dual-write (§5.4.4 / #154).
   * Used only when ARCHIVE_DUAL_WRITE is "true" or "1".
   */
  ARCHIVE_REPLICA?: R2Bucket;
  /** Enable dual-write to ARCHIVE_REPLICA ("true" / "1"). Default: off. */
  ARCHIVE_DUAL_WRITE?: string;
  /** Optional Durable Object namespace that serializes manifest appends per
   * investigation (issue #70). When bound, ManifestStore routes appends here to
   * close the last-write-wins race; when absent, appends fall back to inline. */
  MANIFEST_COORDINATOR?: DurableObjectNamespace;
  ENVIRONMENT: string;
  TRIAGE_MODEL?: string;
  REASONING_MODEL?: string;
  AI_GATEWAY_URL?: string;
  ANTHROPIC_API_KEY?: string;
  /** Cloudflare AI Gateway token for keyless Unified Billing (#111). When set,
   * server-side attribution authenticates with cf-aig-authorization and omits
   * x-api-key; takes precedence over ANTHROPIC_API_KEY. Per-request BYOK is
   * unaffected. */
  CF_AIG_TOKEN?: string;
  /** Comma-separated hostnames allowed for AI Gateway URLs (BYOK + server secret). */
  AI_GATEWAY_ALLOWED_HOSTS?: string;
  /**
   * BYOK-only enforcement for the public hosted Worker (#187). When "true"/"1",
   * resolveAttributionCredentials ignores ALL server-side AI credentials and
   * requires visitor BYOK, so a mistakenly-set AI secret cannot be ridden by an
   * anonymous caller. Credential-less attribution then returns 400 byok_required.
   */
  PUBLIC_BYOK_ONLY?: string;
  SIGNER_PUBLIC_KEY?: string;
  /** In-Worker Ed25519 signing key (base64 seed) for detached evidence-packet
   * signing (§8.1.3). Optional: when unset, packets export unsigned. Provide
   * via `wrangler secret put SIGNER_PRIVATE_KEY`, never a tracked file. */
  SIGNER_PRIVATE_KEY?: string;
  /** Optional signer identity recorded in packet signatures (the named
   * practitioner, §8.1.3). */
  SIGNER_ID?: string;
  INVESTIGATION_NAMESPACE?: string;
  /** Comma-separated browser origins permitted to call the API (empty = browser blocked). */
  CORS_ALLOWED_ORIGINS?: string;
  /** Workers VPC binding to the self-hosted extraction container. */
  VPC_INGEST?: Fetcher;
  /** Full URL for VPC_INGEST.fetch(), e.g. http://common-thread-ingest.internal/trigger */
  INGEST_WORKER_URL?: string;
  /** Required when delegating ingest to the VPC container (wrangler secret put INGEST_SECRET). */
  INGEST_SECRET?: string;
  /**
   * Public backend base URL for VPC callbacks (manifest append proxy, #110).
   * Example: https://common-thread-backend.skyphusion.org
   */
  PUBLIC_API_BASE_URL?: string;
  /** Workers VPC binding to the PDF/A renderer (common-thread-pdf / json-pdf). */
  VPC_PDF?: Fetcher;
  /** PDF/A renderer on VPC, e.g. http://json-pdf:8081/render */
  PDF_WORKER_URL?: string;
  /** Required for `?format=pdf` packet export (wrangler secret put PDF_SECRET). */
  PDF_SECRET?: string;
  /** Workers VPC binding to the self-hosted attribution executor (#69). */
  VPC_ATTRIBUTION?: Fetcher;
  /** Full URL for VPC_ATTRIBUTION.fetch(), e.g. http://common-thread-attribution:8082/trigger */
  ATTRIBUTION_WORKER_URL?: string;
  /** Required when delegating attribution to the VPC executor (wrangler secret put ATTRIBUTION_SECRET). */
  ATTRIBUTION_SECRET?: string;
  /**
   * Hard caps for host-funded resource surfaces (#189). Positive integers as
   * wrangler string vars; unset → public-safe defaults in resource-caps.ts.
   */
  MAX_SEED_ACCOUNTS?: string;
  MAX_INGEST_ITEMS?: string;
  MAX_ATTRIBUTION_PAIRS?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Optional §5.4.4 dual-write: when enabled, wrap ARCHIVE so every put/delete
    // mirrors to ARCHIVE_REPLICA. Default deploys leave the flag unset.
    const runtimeEnv: Env = {
      ...env,
      ARCHIVE: resolveArchiveBucket(env) as R2Bucket,
    };
    try {
      const preflight = corsPreflightResponse(request, runtimeEnv);
      if (preflight) return preflight;

      const corsDenied = assertBrowserOriginAllowed(request, runtimeEnv);
      if (corsDenied) return corsDenied;

      const response = await handle(request, runtimeEnv);
      return withCors(response, request, runtimeEnv);
    } catch (err) {
      // Log the detail server-side; never return raw error strings (which can
      // carry SQL/driver internals) to clients on a public API (#67).
      console.error('Unhandled error in worker fetch:', err);
      return withCors(
        jsonResponse({ error: 'Internal server error', code: 'internal_error' }, 500),
        request,
        runtimeEnv
      );
    }
  },
};

// ---------------------------------------------------------------------------
// Route table + dispatcher (issue #75)
// ---------------------------------------------------------------------------

/** Per-request context handed to every route handler. */
interface RouteContext {
  env: Env;
  request: Request;
  url: URL;
  /** Regex capture groups from the matched pattern, in order. */
  params: string[];
  /**
   * Investigation id resolved by the dispatcher for authed routes (from a
   * capture group or the `?investigation=` query). Empty string for routes
   * without an `auth` funnel; those handlers derive their own id from params.
   */
  investigationId: string;
  /** Authorized investigation row, set only when the route declares `auth`. */
  auth?: InvestigationRow;
  /**
   * Per-investigation encryption key (§3.5), derived from the presented token
   * for an encrypted investigation (crypto_version set); null/undefined for a
   * legacy plaintext investigation. Lives only for the request; never stored.
   */
  encKey?: CryptoKey | null;
}

type RouteHandler = (ctx: RouteContext) => Promise<Response> | Response;

interface AuthConfig {
  /** Require a write-capable token (mutating routes). Default false. */
  requireWrite?: boolean;
  /**
   * Where the investigation id comes from. 'param' (default) reads capture
   * group `idParamIndex` (default 0); 'query' reads `?investigation=` and
   * returns the standard 400 when it is missing.
   */
  idFrom?: 'param' | 'query';
  idParamIndex?: number;
}

interface Route {
  method: string;
  /** Anchored pattern; capture groups surface as ctx.params. */
  pattern: RegExp;
  /** When present, the dispatcher authorizes before invoking the handler. */
  auth?: AuthConfig;
  handler: RouteHandler;
}

/**
 * Encryption at rest (§3.5): derive the in-memory investigation key from the
 * already-validated request token when the investigation is encrypted
 * (crypto_version set); return null for a legacy plaintext investigation. The
 * token matched the stored auth hash, so the derived key is necessarily the
 * one used at creation. Used both by the auth funnel and by handlers that
 * authorize themselves (single-run, per-run packet).
 */
async function resolveEncKey(
  request: Request,
  url: URL,
  row: InvestigationRow,
  investigationId: string
): Promise<CryptoKey | null> {
  if (!row.crypto_version) return null;
  const token = extractAccessToken(request, url);
  // Fail closed: encrypted investigation without a token must not proceed with
  // encKey=null (would write/read plaintext into enc:1 columns). Auth funnel
  // already required a token; this guards self-authorize handlers and regressions.
  if (!token) {
    throw new InvestigationAccessError(
      'missing_token',
      'Encrypted investigation requires an access token to derive the encryption key'
    );
  }
  return deriveInvestigationKey(token, investigationId);
}

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname;

  for (const route of ROUTES) {
    if (route.method !== method) continue;
    const m = route.pattern.exec(path);
    if (!m) continue;

    const ctx: RouteContext = {
      env,
      request,
      url,
      params: m.slice(1),
      investigationId: '',
    };

    if (route.auth) {
      if (route.auth.idFrom === 'query') {
        const q = url.searchParams.get('investigation');
        if (!q) {
          return jsonResponse({ error: 'Missing ?investigation= parameter' }, 400);
        }
        ctx.investigationId = q;
      } else {
        ctx.investigationId = ctx.params[route.auth.idParamIndex ?? 0] ?? '';
      }

      const authed = await authorizeOrRespond(
        env,
        request,
        url,
        ctx.investigationId,
        route.auth.requireWrite ?? false
      );
      if (authed instanceof Response) return authed;
      ctx.auth = authed;
      ctx.encKey = await resolveEncKey(request, url, authed, ctx.investigationId);
    }

    return route.handler(ctx);
  }

  return jsonResponse({ error: `Not found: ${method} ${path}` }, 404);
}

const ROUTES: Route[] = [
  // Health check
  { method: 'GET', pattern: /^\/$/, handler: handleHealth },

  // Investigations are capability-gated; there is no public listing.
  { method: 'GET', pattern: /^\/investigations$/, handler: handleListingDisabled },

  // Create investigation (returns capability token once)
  { method: 'POST', pattern: /^\/investigations$/, handler: handleCreateInvestigation },

  // Get investigation metadata (requires capability token)
  { method: 'GET', pattern: /^\/investigations\/([^/]+)$/, auth: {}, handler: handleGetInvestigation },

  // Hard-delete an active investigation (MySQL graph + manifest sidecars)
  {
    method: 'DELETE',
    pattern: /^\/investigations\/([^/]+)$/,
    auth: { requireWrite: true },
    handler: handleDeleteInvestigation,
  },

  // Update investigation metadata (triggering events, time bounds; §4.2.2, §5.2.1)
  {
    method: 'PATCH',
    pattern: /^\/investigations\/([^/]+)\/metadata$/,
    auth: { requireWrite: true },
    handler: handlePatchInvestigationMetadata,
  },

  // VPC ingest container manifest append proxy (issue #110; INGEST_SECRET auth)
  {
    method: 'POST',
    pattern: /^\/internal\/manifest\/([^/]+)\/append$/,
    handler: handleInternalManifestAppend,
  },

  // Seal investigation (read-only thereafter; requires capability token)
  { method: 'POST', pattern: /^\/investigations\/([^/]+)\/seal$/, auth: { requireWrite: true }, handler: handleSeal },

  // List seed accounts
  { method: 'GET', pattern: /^\/investigations\/([^/]+)\/seeds$/, auth: {}, handler: handleListSeeds },

  // Summary
  { method: 'GET', pattern: /^\/investigations\/([^/]+)\/summary$/, auth: {}, handler: handleSummary },

  // List manifest entries (requires capability token and investigation scope)
  { method: 'GET', pattern: /^\/manifest$/, auth: { idFrom: 'query' }, handler: handleListManifest },

  // List signatures for one investigation's manifest
  { method: 'GET', pattern: /^\/signatures$/, auth: { idFrom: 'query' }, handler: handleListSignatures },

  // Verify signatures for one investigation's manifest
  { method: 'GET', pattern: /^\/verify$/, auth: { idFrom: 'query' }, handler: handleVerify },

  // === DEBUG: Ingest / Extractor visibility ===
  { method: 'GET', pattern: /^\/debug\/ingest$/, auth: { idFrom: 'query' }, handler: handleDebugIngest },

  // === DEBUG: Raw manifest inspection ===
  { method: 'GET', pattern: /^\/debug\/manifest$/, auth: { idFrom: 'query' }, handler: handleDebugManifest },

  // Add seed account
  { method: 'POST', pattern: /^\/investigations\/([^/]+)\/seeds$/, auth: { requireWrite: true }, handler: handleAddSeed },

  // Soft-delete seed account (§5.1; preserves row for audit trail)
  { method: 'DELETE', pattern: /^\/investigations\/([^/]+)\/seeds$/, auth: { requireWrite: true }, handler: handleDeleteSeed },

  // Investigation features (§6.3)
  { method: 'GET', pattern: /^\/investigations\/([^/]+)\/features$/, auth: {}, handler: handleFeatures },

  // Run attribution
  { method: 'POST', pattern: /^\/investigations\/([^/]+)\/attribute$/, auth: { requireWrite: true }, handler: handleAttribute },

  // List attribution runs (canonical + legacy path)
  { method: 'GET', pattern: /^\/investigations\/([^/]+)\/(?:runs|attribution-runs)$/, auth: {}, handler: handleListRuns },

  // Single attribution run with full output (validates run_id before auth)
  { method: 'GET', pattern: /^\/investigations\/([^/]+)\/runs\/([^/]+)$/, handler: handleSingleRun },

  // Investigation-level evidence packet (§8.1.1)
  { method: 'GET', pattern: /^\/investigations\/([^/]+)\/packet$/, auth: {}, handler: handleInvestigationPacket },

  // Evidence packet for an attribution run (§8.1; validates run_id before auth)
  { method: 'GET', pattern: /^\/investigations\/([^/]+)\/packet\/([^/]+)$/, handler: handlePacket },

  // === Apify ingest (Twitter, Instagram, Reddit) ===
  { method: 'POST', pattern: /^\/investigations\/([^/]+)\/ingest\/apify$/, auth: { requireWrite: true }, handler: handleIngestApifyAuto },
  { method: 'POST', pattern: /^\/investigations\/([^/]+)\/ingest\/apify-twitter$/, auth: { requireWrite: true }, handler: handleIngestApify },
  { method: 'POST', pattern: /^\/investigations\/([^/]+)\/ingest\/apify-instagram$/, auth: { requireWrite: true }, handler: handleIngestApifyInstagram },
  { method: 'POST', pattern: /^\/investigations\/([^/]+)\/ingest\/apify-reddit$/, auth: { requireWrite: true }, handler: handleIngestApifyReddit },
  { method: 'POST', pattern: /^\/investigations\/([^/]+)\/ingest\/apify-bluesky$/, auth: { requireWrite: true }, handler: handleIngestApifyBluesky },
  { method: 'POST', pattern: /^\/investigations\/([^/]+)\/ingest\/apify-mastodon$/, auth: { requireWrite: true }, handler: handleIngestApifyMastodon },
  { method: 'POST', pattern: /^\/investigations\/([^/]+)\/ingest\/apify-tiktok$/, auth: { requireWrite: true }, handler: handleIngestApifyTikTok },
  { method: 'POST', pattern: /^\/investigations\/([^/]+)\/ingest\/apify-youtube$/, auth: { requireWrite: true }, handler: handleIngestApifyYouTube },
  { method: 'POST', pattern: /^\/investigations\/([^/]+)\/ingest\/apify-facebook$/, auth: { requireWrite: true }, handler: handleIngestApifyFacebook },

  // Ingest job status
  { method: 'GET', pattern: /^\/investigations\/([^/]+)\/ingest-jobs\/([^/]+)$/, auth: {}, handler: handleIngestJobStatus },

  // Async attribution job status (#69)
  { method: 'GET', pattern: /^\/investigations\/([^/]+)\/attribution-jobs\/([^/]+)$/, auth: {}, handler: handleAttributionJobStatus },
];

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

function handleHealth(ctx: RouteContext): Response {
  const { env } = ctx;
  const body: Record<string, unknown> = {
    name: 'common-thread',
    version: pkg.version,
    environment: env.ENVIRONMENT,
    status: 'ok',
  };
  if (env.ENVIRONMENT === 'production') {
    body.hosted_api_notice = HOSTED_API_CONTACT_NOTICE;
    body.contact = HOSTED_API_CONTACT_EMAIL;
  }
  return jsonResponse(body);
}

function handleListingDisabled(): Response {
  return jsonResponse(
    {
      error:
        'Investigation listing is not available. Create an investigation (POST /investigations) and retain the access_token returned once.',
      code: 'listing_disabled',
    },
    404
  );
}

async function handleCreateInvestigation(ctx: RouteContext): Promise<Response> {
  const { env, request } = ctx;
  const body = await parseJsonBody<{
    id?: string;
    name?: string;
    description?: string;
  }>(request);
  if (body instanceof Response) return body;

  if (!body.id || !body.name) {
    return jsonResponse({ error: 'id and name are required' }, 400);
  }

  const now = new Date().toISOString();
  const accessToken = generateAccessToken();
  const accessTokenHash = await hashAccessToken(accessToken);

  // Encryption at rest (§3.5): every new investigation is encrypted. The key is
  // derived from the access token (never stored); key_check lets a later request
  // prove its token derives the right key. Losing the token = unrecoverable.
  const encKey = await deriveInvestigationKey(accessToken, body.id);
  const keyCheck = await computeKeyCheck(encKey);

  await execute(
    env.DB,
    `INSERT INTO investigations (
       id, name, description, status, created_at, updated_at, access_token_hash,
       crypto_version, key_check
     ) VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
    [
      body.id,
      body.name,
      body.description ?? null,
      now,
      now,
      accessTokenHash,
      CRYPTO_VERSION,
      keyCheck,
    ]
  );

  return jsonResponse(
    {
      id: body.id,
      name: body.name,
      description: body.description,
      status: 'active',
      created_at: now,
      access_token: accessToken,
      access_notice:
        'Store access_token securely. It is shown only at creation and cannot be recovered.',
    },
    201
  );
}

function handleGetInvestigation(ctx: RouteContext): Response {
  return jsonResponse({
    investigation: publicInvestigationView(ctx.auth!),
    metadata: publicMetadataView(ctx.auth!.metadata_json),
  });
}

async function handleDeleteInvestigation(ctx: RouteContext): Promise<Response> {
  const { env } = ctx;
  const investigationId = ctx.investigationId;

  try {
    // Assert committed-active before touching R2. Purging first then failing
    // the seal check would delete a sealed investigation's manifest (#277).
    await assertInvestigationActiveForWrite(env.DB, investigationId);
    const archive = await purgeInvestigationArchive(env.ARCHIVE, investigationId);
    const result = await deleteInvestigationData(env.DB, investigationId);
    if (!result.deleted) {
      return jsonResponse({ error: `Investigation not found: ${investigationId}` }, 404);
    }
    return jsonResponse({
      investigationId,
      deleted: true,
      tables_purged: result.tablesPurged,
      archive_keys_deleted: archive.deletedKeys,
      archive_policy:
        'Content-addressed sha256/ blobs are retained (global deduplicated storage).',
    });
  } catch (err) {
    if (err instanceof InvestigationAccessError) {
      return jsonResponse({ error: err.message, code: err.code }, accessErrorStatus(err.code));
    }
    throw err;
  }
}

/** VPC callback payload bound; a sealed investigation must not grow its log. */
export const MAX_MANIFEST_ENTRY_BYTES = 64 * 1024;

async function handlePatchInvestigationMetadata(ctx: RouteContext): Promise<Response> {
  const { env, request } = ctx;
  const investigationId = ctx.investigationId;
  const body = await parseJsonBody<InvestigationMetadataPatch>(request);
  if (body instanceof Response) return body;

  const validationError = validateMetadataPatch(body);
  if (validationError) {
    return jsonResponse({ error: validationError }, 400);
  }

  try {
    await assertInvestigationActiveForWrite(env.DB, investigationId);

    const row = await queryOne<{ metadata_json: string | null }>(
      env.DB,
      'SELECT metadata_json FROM investigations WHERE id = ?',
      [investigationId]
    );

    const existingPlain = await readTextCell(row?.metadata_json ?? null, {
      key: ctx.encKey ?? null,
      investigationId,
      column: 'investigations.metadata_json',
    });
    const merged = mergeInvestigationMetadata(existingPlain, body);
    const serialized = serializeInvestigationMetadata(merged);
    const metadataJson =
      serialized.length > 0
        ? await packTextCell(serialized, {
            key: ctx.encKey ?? null,
            investigationId,
            column: 'investigations.metadata_json',
          })
        : null;
    const now = new Date().toISOString();

    const updated = await updateInvestigationMetadataIfActive(
      env.DB,
      investigationId,
      metadataJson,
      now
    );
    if (!updated) {
      return readOnlyResponse();
    }

    return jsonResponse({
      investigation: {
        ...publicInvestigationView(ctx.auth!),
        updated_at: now,
      },
      metadata: merged,
    });
  } catch (err) {
    if (err instanceof InvestigationAccessError) {
      return jsonResponse({ error: err.message, code: err.code }, accessErrorStatus(err.code));
    }
    throw err;
  }
}

async function handleInternalManifestAppend(ctx: RouteContext): Promise<Response> {
  const { env, request } = ctx;
  const investigationId = ctx.params[0] ?? '';
  if (!investigationId) {
    return jsonResponse({ error: 'investigation id required' }, 400);
  }

  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
  if (!authorizeIngestSecret(token, env.INGEST_SECRET)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  try {
    await assertInvestigationActiveForWrite(env.DB, investigationId);
  } catch (err) {
    if (err instanceof InvestigationAccessError) {
      return jsonResponse({ error: err.message, code: err.code }, accessErrorStatus(err.code));
    }
    throw err;
  }

  const body = await parseJsonBody<{ entry?: ManifestEntry }>(request);
  if (body instanceof Response) return body;
  if (!body.entry || typeof body.entry !== 'object') {
    return jsonResponse({ error: 'entry is required' }, 400);
  }
  if (body.entry.investigationId !== investigationId) {
    return jsonResponse({ error: 'entry.investigationId mismatch' }, 400);
  }

  const entryBytes = new TextEncoder().encode(JSON.stringify(body.entry)).byteLength;
  if (entryBytes > MAX_MANIFEST_ENTRY_BYTES) {
    return jsonResponse(
      {
        error: 'entry too large',
        code: 'entry_too_large',
        limit: MAX_MANIFEST_ENTRY_BYTES,
        attempted: entryBytes,
      },
      400
    );
  }

  const manifest = manifestStoreFor(
    { ARCHIVE: env.ARCHIVE, MANIFEST_COORDINATOR: env.MANIFEST_COORDINATOR },
    investigationId
  );
  await manifest.append(body.entry);
  return new Response(null, { status: 204 });
}

async function handleSeal(ctx: RouteContext): Promise<Response> {
  const { env } = ctx;
  const auth = ctx.auth!;
  const investigationId = ctx.investigationId;
  const now = new Date().toISOString();

  // Seal transactionally: the UPDATE only fires when the row is still active at
  // the origin, so a stale-active cache read (the requireWrite guard reads
  // status through Hyperdrive's query cache) can neither re-seal nor otherwise
  // mutate an already-sealed investigation. Idempotent when already sealed
  // (§3.1 chain of custody; §3.1.1 immutable archival).
  const sealed = await sealInvestigationIfActive(env.DB, investigationId, now);
  if (!sealed) {
    const current = await readCommittedRow<{ status: string; updated_at: string }>(
      env.DB,
      'SELECT status, updated_at FROM investigations WHERE id = ? FOR UPDATE',
      [investigationId]
    );
    return jsonResponse({
      investigation: {
        ...publicInvestigationView(auth),
        status: current?.status ?? auth.status,
        updated_at: current?.updated_at ?? auth.updated_at,
      },
      message: 'Investigation is already sealed (read-only).',
    });
  }

  return jsonResponse({
    investigation: {
      ...publicInvestigationView(auth),
      status: 'sealed',
      updated_at: now,
    },
    message:
      'Investigation sealed. Data remains readable with the access token; ingest and attribution are disabled.',
  });
}

async function handleListSeeds(ctx: RouteContext): Promise<Response> {
  const { env, url } = ctx;
  const investigationId = ctx.investigationId;
  const includeRemoved = url.searchParams.get('includeRemoved') === 'true';

  const rows = await query(
    env.DB,
    `SELECT * FROM seed_accounts 
     WHERE investigation_id = ?
       ${includeRemoved ? '' : 'AND removed_at IS NULL'}
     ORDER BY added_at DESC`,
    [investigationId]
  );

  const seeds = [];
  for (const row of rows as Array<Record<string, unknown>>) {
    const basis = await readTextCell(
      typeof row.basis_statement === 'string' ? row.basis_statement : null,
      {
        key: ctx.encKey ?? null,
        investigationId,
        column: 'seed_accounts.basis_statement',
      }
    );
    const removed = await readTextCell(
      typeof row.removed_reason === 'string' ? row.removed_reason : null,
      {
        key: ctx.encKey ?? null,
        investigationId,
        column: 'seed_accounts.removed_reason',
      }
    );
    seeds.push({
      ...row,
      basis_statement: basis,
      removed_reason: removed,
    });
  }

  return jsonResponse({ investigationId, seeds, count: seeds.length });
}

async function handleSummary(ctx: RouteContext): Promise<Response> {
  const { env } = ctx;
  const investigationId = ctx.investigationId;

  const seedResult = await queryOne<{ count: number }>(
    env.DB,
    `SELECT COUNT(*) as count FROM seed_accounts
     WHERE investigation_id = ? AND removed_at IS NULL`,
    [investigationId]
  );

  const manifest = new ManifestStore({ bucket: env.ARCHIVE, investigationId });
  const artifacts = await manifest.list();

  return jsonResponse({
    investigationId,
    seeds: seedResult?.count ?? 0,
    artifacts: artifacts.length,
  });
}

async function handleListManifest(ctx: RouteContext): Promise<Response> {
  const { env } = ctx;
  const investigationId = ctx.investigationId;
  const entries = await new ManifestStore({
    bucket: env.ARCHIVE,
    investigationId,
  }).list();
  return jsonResponse({ investigationId, entries, count: entries.length });
}

async function handleListSignatures(ctx: RouteContext): Promise<Response> {
  const { env } = ctx;
  const investigationId = ctx.investigationId;
  const signatures = await new ManifestSigner({
    bucket: env.ARCHIVE,
    investigationId,
  }).listSignatures();
  return jsonResponse({ investigationId, signatures, count: signatures.length });
}

async function handleVerify(ctx: RouteContext): Promise<Response> {
  const { env } = ctx;
  const investigationId = ctx.investigationId;
  const results = await new ManifestSigner({
    bucket: env.ARCHIVE,
    investigationId,
  }).verifyAll();
  const validCount = results.filter((r) => r.valid).length;

  return jsonResponse({
    investigationId,
    totalSignatures: results.length,
    validSignatures: validCount,
    allValid: results.length > 0 && validCount === results.length,
  });
}

async function handleDebugIngest(ctx: RouteContext): Promise<Response> {
  const { env } = ctx;
  const investigationId = ctx.investigationId;

  const manifest = new ManifestStore({ bucket: env.ARCHIVE, investigationId });
  const allEntries = await manifest.list();
  const entriesWithAccount = allEntries.filter((e) => e.account);

  const accountVisibility: Record<string, any> = {};
  const pairVisibility: Record<string, any> = {};

  for (const ex of TWITTER_ACCOUNT_EXTRACTORS) {
    const matching = entriesWithAccount.filter((e) => {
      try { return ex.filterEntry?.(e) ?? false; } catch { return false; }
    });
    accountVisibility[ex.name] = { count: matching.length };
  }

  for (const ex of TWITTER_PAIR_EXTRACTORS) {
    pairVisibility[ex.name] = { count: entriesWithAccount.length };
  }

  return jsonResponse({
    investigationId,
    totalEntries: allEntries.length,
    entriesWithAccount: entriesWithAccount.length,
    entriesWithoutAccount: allEntries.length - entriesWithAccount.length,
    sampleEntry: entriesWithAccount[0] || null,
    extractorVisibility: { account: accountVisibility, pair: pairVisibility },
  });
}

async function handleDebugManifest(ctx: RouteContext): Promise<Response> {
  const { env } = ctx;
  const investigationId = ctx.investigationId;

  const entries = await new ManifestStore({
    bucket: env.ARCHIVE,
    investigationId,
  }).list();
  const withAccount = entries.filter((e) => e.account);
  const withoutAccount = entries.filter((e) => !e.account);

  return jsonResponse({
    investigationId,
    total: entries.length,
    withAccount: withAccount.length,
    withoutAccount: withoutAccount.length,
    sampleWithAccount: withAccount.slice(0, 3),
    sampleWithoutAccount: withoutAccount.slice(0, 3),
  });
}

async function handleAddSeed(ctx: RouteContext): Promise<Response> {
  const { env, request } = ctx;
  const investigationId = ctx.investigationId;

  const body = await parseJsonBody<{
    platform?: string;
    account?: string;
    basis_statement?: string;
    basisStatement?: string;
    is_control?: boolean;
    added_by?: string;
  }>(request);
  if (body instanceof Response) return body;

  if (!body.account || !body.platform) {
    return jsonResponse({ error: 'platform and account are required' }, 400);
  }

  const caps = resolveResourceCaps(env);
  const activeCount = await queryOne<{ count: number }>(
    env.DB,
    `SELECT COUNT(*) AS count FROM seed_accounts
     WHERE investigation_id = ? AND removed_at IS NULL`,
    [investigationId]
  );
  const current = Number(activeCount?.count ?? 0);
  if (current >= caps.maxSeedAccounts) {
    // Idempotent re-add of an existing active seed is not a new row; allow
    // insertSeedIfActive to no-op. Only block net-new accounts past the cap.
    const existing = await queryOne<{ count: number }>(
      env.DB,
      `SELECT COUNT(*) AS count FROM seed_accounts
       WHERE investigation_id = ?
         AND platform = ?
         AND account_identifier = ?
         AND removed_at IS NULL`,
      [investigationId, body.platform, body.account]
    );
    if (!existing?.count) {
      return jsonResponse(seedCapExceeded(caps.maxSeedAccounts, current), 400);
    }
  }

  const now = new Date().toISOString();
  const basisPlain = body.basis_statement ?? body.basisStatement ?? 'Added via API';
  const basis = await packTextCell(basisPlain, {
    key: ctx.encKey ?? null,
    investigationId,
    column: 'seed_accounts.basis_statement',
  });
  const isControl = body.is_control ? 1 : 0;

  // Gate the INSERT on committed-active status inside the write statement so a
  // stale-active cache read cannot admit a seed onto a sealed investigation
  // (§3.1 immutable archival). No insert => not active => refuse.
  const inserted = await insertSeedIfActive(env.DB, {
    investigationId,
    platform: body.platform,
    account: body.account,
    basis,
    now,
    addedBy: body.added_by ?? 'api',
    isControl,
  });
  if (!inserted) {
    // Existing active seed under a full cap: treat as success (no new row).
    if (current >= caps.maxSeedAccounts) {
      return jsonResponse(
        {
          investigationId,
          platform: body.platform,
          account: body.account,
          is_control: Boolean(isControl),
          added_at: now,
          already_present: true,
        },
        200
      );
    }
    return readOnlyResponse();
  }

  return jsonResponse(
    {
      investigationId,
      platform: body.platform,
      account: body.account,
      is_control: Boolean(isControl),
      added_at: now,
    },
    201
  );
}

async function handleDeleteSeed(ctx: RouteContext): Promise<Response> {
  const { env, request } = ctx;
  const investigationId = ctx.investigationId;

  const body = await parseJsonBody<{
    platform?: string;
    account?: string;
    removed_reason?: string;
    removedReason?: string;
  }>(request);
  if (body instanceof Response) return body;

  if (!body.account || !body.platform) {
    return jsonResponse({ error: 'platform and account are required' }, 400);
  }

  const active = await queryOne<{ count: number }>(
    env.DB,
    `SELECT COUNT(*) AS count FROM seed_accounts
     WHERE investigation_id = ?
       AND platform = ?
       AND account_identifier = ?
       AND removed_at IS NULL`,
    [investigationId, body.platform, body.account]
  );
  if (!active?.count) {
    return jsonResponse(
      {
        error: `Active seed not found: ${body.platform}:${body.account}`,
      },
      404
    );
  }

  const now = new Date().toISOString();
  const reasonPlain =
    body.removed_reason ?? body.removedReason ?? 'Removed via API';
  const reason = await packTextCell(reasonPlain, {
    key: ctx.encKey ?? null,
    investigationId,
    column: 'seed_accounts.removed_reason',
  });

  // The soft-delete UPDATE (§5.1) is gated on committed-active status via an
  // EXISTS predicate so a stale-active cache read cannot mutate a sealed
  // investigation (§3.1). The precheck above already confirmed an active seed
  // exists, so 0 rows changed here means the investigation was sealed/archived
  // at write time: refuse rather than silently no-op.
  const changes = await softDeleteSeedIfActive(env.DB, {
    investigationId,
    platform: body.platform,
    account: body.account,
    now,
    reason,
  });
  if (changes === 0) {
    return readOnlyResponse();
  }

  return jsonResponse({
    investigationId,
    platform: body.platform,
    account: body.account,
    removed_at: now,
    removed_reason: reasonPlain,
    removed_count: changes,
  });
}

async function handleFeatures(ctx: RouteContext): Promise<Response> {
  const { env, url } = ctx;
  const investigationId = ctx.investigationId;

  const parsed = parseFeaturesQueryParams(investigationId, url.searchParams);
  if ('error' in parsed) {
    return jsonResponse({ error: parsed.error }, 400);
  }

  const result = await queryInvestigationFeatures(env.DB, {
    ...parsed,
    encKey: ctx.encKey ?? null,
  });
  return jsonResponse(result);
}

async function handleAttribute(ctx: RouteContext): Promise<Response> {
  const { env, request, url } = ctx;
  const investigationId = ctx.investigationId;

  // Attribution has no single gating statement (it fans out into many writes,
  // or dispatches an async job), so re-check status at write time against an
  // uncached committed read before doing any work. A stale-active cache read
  // in the requireWrite guard must not launch a run on a sealed investigation
  // (§3.1 immutable archival; observed as a seal-then-attribute race).
  const guard = await guardWriteOrRespond(env, investigationId);
  if (guard) return guard;

  let body: Record<string, unknown> = {};
  if (request.headers.get('content-type')?.includes('application/json')) {
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
  }

  const accountFilterParam = url.searchParams.get('accountFilter');
  const accountFilter =
    (Array.isArray(body.account_filter) ? (body.account_filter as string[]) : undefined) ??
    (Array.isArray(body.accountFilter) ? (body.accountFilter as string[]) : undefined) ??
    (accountFilterParam ? accountFilterParam.split(',').map(s => s.trim()).filter(Boolean) : undefined);

  // Pair fan-out ceiling before credential work or LLM spend (#189).
  const caps = resolveResourceCaps(env);
  const accountCount = await countAttributionAccounts(
    env,
    investigationId,
    accountFilter
  );
  const pairs = canonicalPairCount(accountCount);
  if (pairs > caps.maxAttributionPairs) {
    return jsonResponse(pairCapExceeded(caps.maxAttributionPairs, pairs), 400);
  }

  const credentials = resolveAttributionCredentials({
    envAiGatewayUrl: env.AI_GATEWAY_URL,
    envAnthropicApiKey: env.ANTHROPIC_API_KEY,
    envCfAigToken: env.CF_AIG_TOKEN,
    requestHeaders: request.headers,
    body,
    allowedGatewayHosts: parseAllowedGatewayHosts(env.AI_GATEWAY_ALLOWED_HOSTS),
    publicByokOnly: isTruthyFlag(env.PUBLIC_BYOK_ONLY),
  });
  if ('error' in credentials) {
    // BYOK-only with no visitor credentials is a client precondition, not a
    // server fault: emit a stable machine-readable code (the web UI and API
    // clients branch on `error`, not the prose) with HTTP 400. All other
    // credential-resolution failures stay 503.
    if (credentials.code === 'byok_required') {
      return jsonResponse({ error: 'byok_required', message: credentials.error }, 400);
    }
    return jsonResponse({ error: credentials.error }, 503);
  }

  const skipTriage =
    url.searchParams.get('skipTriage') === 'true' || body.skipTriage === true;

  const maxRetriesRaw = body.maxRetries ?? body.max_retries;
  const maxRetries =
    typeof maxRetriesRaw === 'number' ? maxRetriesRaw : undefined;

  const randomizationSeed =
    typeof body.randomizationSeed === 'string'
      ? body.randomizationSeed
      : typeof body.randomization_seed === 'string'
        ? body.randomization_seed
        : undefined;

  // Async path (#69): server-credentials-only runs delegate to the VPC
  // executor and return 202 + a job id. BYOK requests (credential source
  // 'request') stay synchronous so a user AI key never reaches the executor.
  // Encrypted investigations (#246) may async when the access token is present:
  // investigation key is envelope-sealed under ATTRIBUTION_SECRET into the VPC
  // handoff only (never options_json / jobs table). Missing token/key on an
  // encrypted inv would write plaintext conclusions -- refuse that path.
  if (shouldRunAttributionAsync(env, credentials.source)) {
    if (ctx.auth?.crypto_version && !ctx.encKey) {
      return jsonResponse(
        {
          error: 'encryption_key_required',
          message:
            'Encrypted investigation requires the access token to derive the encryption key for async attribution.',
        },
        400
      );
    }
    let encryptionKeyMaterial: string | undefined;
    if (ctx.auth?.crypto_version) {
      const token = extractAccessToken(request, url);
      if (!token || !env.ATTRIBUTION_SECRET) {
        return jsonResponse(
          {
            error: 'encryption_key_required',
            message:
              'Encrypted async attribution requires access token and ATTRIBUTION_SECRET for key-on-dispatch sealing.',
          },
          400
        );
      }
      encryptionKeyMaterial = await sealInvestigationKeyForVpcHandoff(
        token,
        investigationId,
        env.ATTRIBUTION_SECRET
      );
    }
    const { jobId, status } = await enqueueAttributionJob(
      env,
      investigationId,
      {
        accountFilter,
        skipTriage,
        maxRetries,
        randomizationSeed,
      },
      encryptionKeyMaterial
    );
    return jsonResponse({ investigationId, jobId, status, mode: 'async' }, 202);
  }

  const db = resolveDatabase(env.DB);
  const summaries = await runAttribution(
    {
      DB: db,
      ARCHIVE: env.ARCHIVE,
      AI_GATEWAY_URL: credentials.aiGatewayUrl,
      ANTHROPIC_API_KEY: credentials.anthropicApiKey,
      CF_AIG_TOKEN: credentials.cfAigToken,
      TRIAGE_MODEL: env.TRIAGE_MODEL ?? 'claude-haiku-4-5',
      REASONING_MODEL: env.REASONING_MODEL ?? 'claude-opus-4-8',
    },
    {
      investigationId,
      accountFilter,
      skipTriage,
      maxRetries,
      randomizationSeed,
      encKey: ctx.encKey ?? null,
    }
  );

  return jsonResponse({
    investigationId,
    pair_count: summaries.length,
    credential_source: credentials.source,
    runs: summaries,
    mode: 'sync',
  });
}

async function handleListRuns(ctx: RouteContext): Promise<Response> {
  const { env } = ctx;
  const investigationId = ctx.investigationId;
  const rows = await listAttributionRuns(env.DB, investigationId, ctx.encKey ?? null);
  return jsonResponse({ investigationId, runs: rows, count: rows.length });
}

async function handleSingleRun(ctx: RouteContext): Promise<Response> {
  const { env, request, url, params } = ctx;
  const investigationId = params[0] ?? '';
  const runId = Number(params[1]);

  if (!Number.isInteger(runId) || runId < 1) {
    return jsonResponse({ error: 'run_id must be a positive integer' }, 400);
  }

  const auth = await authorizeOrRespond(env, request, url, investigationId);
  if (auth instanceof Response) return auth;

  const encKey = await resolveEncKey(request, url, auth, investigationId);
  const run = await getAttributionRun(env.DB, investigationId, runId, encKey);
  if (!run) {
    return jsonResponse({ error: `Attribution run not found: ${runId}` }, 404);
  }

  return jsonResponse({ investigationId, run });
}

async function handleInvestigationPacket(ctx: RouteContext): Promise<Response> {
  const { env, request, url, params } = ctx;
  const investigationId = params[0] ?? '';

  const auth = await authorizeOrRespond(env, request, url, investigationId);
  if (auth instanceof Response) return auth;

  const practitioner = url.searchParams.get('practitioner')?.trim() || undefined;
  const redactParam = url.searchParams.get('redact');
  const practitionerRedactions = url.searchParams
    .getAll('redact_account')
    .map((v) => v.trim())
    .filter(Boolean);

  const encKey = await resolveEncKey(request, url, auth, investigationId);
  const packet = await buildInvestigationEvidencePacket(
    env.DB,
    env.ARCHIVE,
    investigationId,
    {
      practitionerIdentity: practitioner,
      redaction: {
        pseudonymizeControls: redactParam !== 'false',
        practitionerRedactions:
          practitionerRedactions.length > 0 ? practitionerRedactions : undefined,
      },
      packetSigner: env.SIGNER_PRIVATE_KEY
        ? { privateKey: env.SIGNER_PRIVATE_KEY, signerId: env.SIGNER_ID }
        : undefined,
    },
    encKey
  );

  if (!packet) {
    return jsonResponse(
      { error: 'No attribution runs found for investigation-level packet' },
      404
    );
  }

  if (url.searchParams.get('format') === 'markdown') {
    return new Response(packet.markdown + '\n', {
      status: 200,
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    });
  }

  return jsonResponse(packet);
}

async function handlePacket(ctx: RouteContext): Promise<Response> {
  const { env, request, url, params } = ctx;
  const investigationId = params[0] ?? '';
  const runId = Number(params[1]);

  if (!Number.isInteger(runId) || runId < 1) {
    return jsonResponse({ error: 'run_id must be a positive integer' }, 400);
  }

  const auth = await authorizeOrRespond(env, request, url, investigationId);
  if (auth instanceof Response) return auth;

  const encKey = await resolveEncKey(request, url, auth, investigationId);
  const packet = await buildEvidencePacket(
    env.DB,
    env.ARCHIVE,
    investigationId,
    runId,
    env.SIGNER_PRIVATE_KEY
      ? { privateKey: env.SIGNER_PRIVATE_KEY, signerId: env.SIGNER_ID }
      : undefined,
    encKey
  );
  if (!packet) {
    return jsonResponse({ error: `Attribution run not found: ${runId}` }, 404);
  }

  if (url.searchParams.get('format') === 'markdown') {
    return new Response(packet.markdown + '\n', {
      status: 200,
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    });
  }

  if (url.searchParams.get('format') === 'pdf') {
    if (!vpcPdfEnabled(env)) {
      return jsonResponse(
        {
          error: 'PDF rendering requires VPC_PDF, PDF_WORKER_URL, and PDF_SECRET',
          hint: 'Set PDF_SECRET via wrangler secret put PDF_SECRET and deploy containers/pdf-worker',
        },
        503
      );
    }

    const title = packetDocumentTitle(investigationId, runId);
    const html = await packetMarkdownToHtml(packet.markdown, title);
    const pdfResponse = await dispatchPdfRender(env, {
      investigationId,
      attributionRunId: runId,
      html,
      pdfaProfile: '2b',
    });

    if (!pdfResponse.ok) {
      const detail = await pdfResponse.text();
      return jsonResponse(
        {
          error: 'PDF renderer failed',
          status: pdfResponse.status,
          detail: detail.slice(0, 2000),
        },
        502
      );
    }

    const pdfBytes = await pdfResponse.arrayBuffer();
    const filename = `common-thread-${investigationId}-run-${runId}.pdf`;
    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-PDF-A-Profile': '2b',
      },
    });
  }

  return jsonResponse(packet);
}

async function handleIngestApify(ctx: RouteContext): Promise<Response> {
  return runIngestUpload(ctx, ingestApifyTwitter);
}

async function handleIngestApifyAuto(ctx: RouteContext): Promise<Response> {
  return runIngestUpload(ctx, ingestApify);
}

async function handleIngestApifyInstagram(ctx: RouteContext): Promise<Response> {
  return runIngestUpload(ctx, ingestApifyInstagram);
}

async function handleIngestApifyReddit(ctx: RouteContext): Promise<Response> {
  return runIngestUpload(ctx, ingestApifyReddit);
}

async function handleIngestApifyBluesky(ctx: RouteContext): Promise<Response> {
  return runIngestUpload(ctx, ingestApifyBluesky);
}

async function handleIngestApifyMastodon(ctx: RouteContext): Promise<Response> {
  return runIngestUpload(ctx, ingestApifyMastodon);
}

async function handleIngestApifyTikTok(ctx: RouteContext): Promise<Response> {
  return runIngestUpload(ctx, ingestApifyTikTok);
}

async function handleIngestApifyYouTube(ctx: RouteContext): Promise<Response> {
  return runIngestUpload(ctx, ingestApifyYouTube);
}

async function handleIngestApifyFacebook(ctx: RouteContext): Promise<Response> {
  return runIngestUpload(ctx, ingestApifyFacebook);
}

async function runIngestUpload(
  ctx: RouteContext,
  ingest: typeof ingestApify
): Promise<Response> {
  const { env, request } = ctx;
  const investigationId = ctx.investigationId;
  const guard = await guardWriteOrRespond(env, investigationId);
  if (guard) return guard;

  const parsed = await parseIngestItems(request);
  if (parsed instanceof Response) return parsed;

  const caps = resolveResourceCaps(env);
  const flattened = flattenIngestItems(parsed, caps.maxIngestItems);
  if (flattened.truncated || flattened.items.length > caps.maxIngestItems) {
    return jsonResponse(
      ingestCapExceeded(
        caps.maxIngestItems,
        Math.max(flattened.items.length, caps.maxIngestItems + 1)
      ),
      400
    );
  }

  try {
    const result = await ingest(env, investigationId, flattened.items, {
      encKey: ctx.encKey ?? null,
      accessToken: extractAccessToken(ctx.request, ctx.url) ?? undefined,
    });
    return jsonResponse(result, result.delegatedToContainer ? 202 : 200);
  } catch (err) {
    return mapIngestError(err);
  }
}

function mapIngestError(err: unknown): Response {
  if (err instanceof EncryptedIngestKeyRequiredError) {
    return jsonResponse(
      {
        error: 'encryption_key_required',
        message: err.message,
      },
      400
    );
  }
  if (err instanceof EmptyApifyIngestError) {
    return jsonResponse({ error: 'unsupported_export', message: err.message }, 400);
  }
  throw err;
}

async function parseIngestItems(request: Request): Promise<unknown[] | Response> {
  const contentType = request.headers.get('content-type') || '';
  const allItems: unknown[] = [];

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const fileEntries = formData.getAll('file');

    for (const entry of fileEntries) {
      if (entry && typeof entry !== 'string' && 'text' in entry) {
        const file = entry as File;
        if (typeof file.size === 'number' && jsonBodyTooLarge(file.size)) {
          return jsonResponse(
            {
              error: 'Request body exceeds the ingest size limit',
              code: 'body_too_large',
              limit: DEFAULT_MAX_JSON_BODY_BYTES,
              attempted: file.size,
            },
            413
          );
        }
        try {
          const text = await file.text();
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) allItems.push(...parsed);
          else if (Array.isArray(parsed?.items)) allItems.push(...parsed.items);
          else if (Array.isArray(parsed?.data)) allItems.push(...parsed.data);
          else allItems.push(parsed);
        } catch {
          return jsonResponse({ error: 'Invalid JSON in uploaded file' }, 400);
        }
      }
    }

    if (allItems.length === 0) return jsonResponse({ error: 'No valid files uploaded' }, 400);
    return allItems;
  }

  const parsedBody = await parseJsonBody<unknown>(request);
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as { items?: unknown[]; data?: unknown[] };
  return Array.isArray(parsedBody)
    ? parsedBody
    : Array.isArray(body?.items)
      ? body.items
      : Array.isArray(body?.data)
        ? body.data
        : [parsedBody];
}

async function handleIngestJobStatus(ctx: RouteContext): Promise<Response> {
  const { env, params } = ctx;
  const investigationId = ctx.investigationId;
  const jobId = params[1] ?? '';

  const row = await readCommittedRow(
    env.DB,
    `SELECT job_id, investigation_id, provider, status, item_count,
            manifest_hashes, raw_file_hashes, container_name,
            started_at, completed_at, error_message, created_at
     FROM ingest_jobs
     WHERE job_id = ? AND investigation_id = ?`,
    [jobId, investigationId]
  );

  if (!row) {
    return jsonResponse({ error: `Ingest job not found: ${jobId}` }, 404);
  }

  return jsonResponse({ job: row });
}

async function handleAttributionJobStatus(ctx: RouteContext): Promise<Response> {
  const { env, params } = ctx;
  const investigationId = ctx.investigationId;
  const jobId = params[1] ?? '';

  const row = await readCommittedRow(
    env.DB,
    `SELECT job_id, investigation_id, status, pair_count,
            container_name, started_at, completed_at, error_message, created_at
     FROM attribution_jobs
     WHERE job_id = ? AND investigation_id = ?`,
    [jobId, investigationId]
  );

  if (!row) {
    return jsonResponse({ error: `Attribution job not found: ${jobId}` }, 404);
  }

  return jsonResponse({ job: row });
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function authorizeOrRespond(
  env: Env,
  request: Request,
  url: URL,
  investigationId: string,
  requireWrite = false
): Promise<InvestigationRow | Response> {
  try {
    return await authorizeInvestigation(env.DB, request, url, investigationId, {
      requireWrite,
    });
  } catch (err) {
    if (err instanceof InvestigationAccessError) {
      return jsonResponse({ error: err.message, code: err.code }, accessErrorStatus(err.code));
    }
    throw err;
  }
}

/**
 * Write-time seal enforcement for mutations that cannot be expressed as one
 * status-gated statement (attribution, ingest). Reads committed status through
 * an uncached transactional read; returns a 403 read_only Response when the
 * investigation is not active, or null to proceed (§3.1).
 */
async function guardWriteOrRespond(
  env: Env,
  investigationId: string
): Promise<Response | null> {
  try {
    await assertInvestigationActiveForWrite(env.DB, investigationId);
    return null;
  } catch (err) {
    if (err instanceof InvestigationAccessError) {
      return jsonResponse({ error: err.message, code: err.code }, accessErrorStatus(err.code));
    }
    throw err;
  }
}

/** Uniform 403 for a write refused because the investigation is not active. */
function readOnlyResponse(): Response {
  return jsonResponse(
    {
      error:
        'Investigation is not active (sealed or archived) and cannot be modified. Unseal is not supported; create a new investigation to continue work.',
      code: 'read_only',
    },
    accessErrorStatus('read_only')
  );
}

/**
 * Parse a JSON request body, returning a 400 with a typed error code rather
 * than letting a malformed body bubble up as a generic 500 (#67).
 */
async function parseJsonBody<T>(request: Request): Promise<T | Response> {
  const buf = await request.arrayBuffer();
  if (jsonBodyTooLarge(buf.byteLength)) {
    return jsonResponse(
      {
        error: 'Request body exceeds the ingest size limit',
        code: 'body_too_large',
        limit: DEFAULT_MAX_JSON_BODY_BYTES,
        attempted: buf.byteLength,
      },
      413
    );
  }
  try {
    return JSON.parse(new TextDecoder().decode(buf)) as T;
  } catch {
    return jsonResponse(
      { error: 'Request body must be valid JSON', code: 'invalid_json_body' },
      400
    );
  }
}

/** Parse a wrangler string var as a boolean flag ("true"/"1", case-insensitive). */
function isTruthyFlag(value: string | undefined): boolean {
  const flag = (value ?? '').trim().toLowerCase();
  return flag === 'true' || flag === '1';
}

/**
 * Count accounts that would enter the attribution pair loop (#189).
 * With accountFilter: distinct active seeds whose account_identifier is in
 * the filter. Without: all active seeds. Matches loadSeedAccounts /
 * resolveAccountPlatforms cardinality for the pair-ceiling check.
 */
async function countAttributionAccounts(
  env: Env,
  investigationId: string,
  accountFilter: string[] | undefined
): Promise<number> {
  if (accountFilter && accountFilter.length > 0) {
    const unique = [...new Set(accountFilter.map((s) => s.trim()).filter(Boolean))];
    if (unique.length === 0) return 0;
    const placeholders = unique.map(() => '?').join(', ');
    const row = await queryOne<{ count: number }>(
      env.DB,
      `SELECT COUNT(*) AS count FROM seed_accounts
       WHERE investigation_id = ?
         AND removed_at IS NULL
         AND account_identifier IN (${placeholders})`,
      [investigationId, ...unique]
    );
    return Number(row?.count ?? 0);
  }

  const row = await queryOne<{ count: number }>(
    env.DB,
    `SELECT COUNT(*) AS count FROM seed_accounts
     WHERE investigation_id = ? AND removed_at IS NULL`,
    [investigationId]
  );
  return Number(row?.count ?? 0);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2) + '\n', {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
