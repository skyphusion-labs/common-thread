/**
 * Evidence packet builder (methodology paper §8.1).
 *
 * Assembles attribution output, cited signals, manifest extract, and
 * methodology metadata into a self-contained JSON structure with an
 * accompanying Markdown rendering. PDF/A output is produced by the
 * self-hosted pdf-worker container (§8.1.2).
 */

import type { R2Bucket } from '@cloudflare/workers-types';
import { ManifestStore } from '../archive/manifest';
import { ManifestSigner } from '../archive/signing';
import type { PacketSignature } from '../archive/signing';
import { signPacketMarkdown } from './packet-signing';
import { parseAttributionMetadata } from '../investigations/attribution-metadata';
import { listAttributionRuns, getAttributionRun } from '../attribution/query';
import { query, queryOne, resolveDatabase } from '../db';
import { readFeatureValue } from '../schema/db-types';
import type { InvestigationRow } from '../schema/db-types';
import { parseSignalId } from '../reasoner/types';
// The methodology citation, packet shape, and Markdown renderer live in the pure
// sibling module so they are unit-testable without the D1/R2 stack (issue #32).
import {
  METHODOLOGY_REFERENCE,
  collectCitedSignalIds,
  fingerprintFromHashes,
  renderMarkdown,
  type EvidencePacket,
  type SignalAppendixRow,
} from './evidence-packet-meta';
import { applyPacketRedaction, countBands, type RedactionOptions } from './redaction';

// Re-export the public surface so existing importers of this module keep working.
export {
  METHODOLOGY_REFERENCE,
  collectCitedSignalIds,
  renderMarkdown,
  type EvidencePacket,
  type SignalAppendixRow,
} from './evidence-packet-meta';

async function loadProvenanceForFeature(
  db: ReturnType<typeof resolveDatabase>,
  table: 'account_feature_provenance' | 'pair_feature_provenance' | 'event_feature_provenance',
  idColumn: 'account_feature_id' | 'pair_feature_id' | 'event_feature_id',
  featureId: number
): Promise<Array<{ artifact_hash: string; manifest_entry_hash: string | null }>> {
  const res = await db
    .prepare(
      `SELECT artifact_hash, manifest_entry_hash
       FROM ${table}
       WHERE ${idColumn} = ?`
    )
    .bind(featureId)
    .all<{ artifact_hash: string; manifest_entry_hash: string | null }>();
  return res.results ?? [];
}

async function loadSignalAppendixRow(
  db: ReturnType<typeof resolveDatabase>,
  investigationId: string,
  signalId: string
): Promise<SignalAppendixRow | null> {
  const parsed = parseSignalId(signalId);
  if (!parsed) return null;

  if (parsed.table === 'account_features') {
    const row = await db
      .prepare(
        `SELECT id, platform, account_identifier, feature_category, feature_name,
                feature_value_text, feature_value_numeric, feature_value_json,
                extracted_at, extractor_name, extractor_version, confidence_flag
         FROM account_features
         WHERE id = ? AND investigation_id = ?`
      )
      .bind(parsed.rowId, investigationId)
      .first<{
        id: number;
        platform: string;
        account_identifier: string;
        feature_category: string;
        feature_name: string;
        feature_value_text: string | null;
        feature_value_numeric: number | null;
        feature_value_json: string | null;
        extracted_at: string;
        extractor_name: string;
        extractor_version: string;
        confidence_flag: string | null;
      }>();
    if (!row) return null;
    const provenance = await loadProvenanceForFeature(
      db,
      'account_feature_provenance',
      'account_feature_id',
      row.id
    );
    const hashes = provenance.map((p) => p.artifact_hash);
    return {
      signal_id: signalId,
      scope: 'account',
      feature_category: row.feature_category,
      feature_name: row.feature_name,
      value: readFeatureValue(row),
      confidence_flag: row.confidence_flag,
      extractor_name: row.extractor_name,
      extractor_version: row.extractor_version,
      extracted_at: row.extracted_at,
      provenance,
      provenance_fingerprint: fingerprintFromHashes(hashes),
    };
  }

  if (parsed.table === 'pair_features') {
    const row = await db
      .prepare(
        `SELECT id, platform_a, platform_b, account_a, account_b, feature_category, feature_name,
                feature_value_text, feature_value_numeric, feature_value_json,
                extracted_at, extractor_name, extractor_version, confidence_flag
         FROM pair_features
         WHERE id = ? AND investigation_id = ?`
      )
      .bind(parsed.rowId, investigationId)
      .first<{
        id: number;
        platform_a: string;
        platform_b: string;
        account_a: string;
        account_b: string;
        feature_category: string;
        feature_name: string;
        feature_value_text: string | null;
        feature_value_numeric: number | null;
        feature_value_json: string | null;
        extracted_at: string;
        extractor_name: string;
        extractor_version: string;
        confidence_flag: string | null;
      }>();
    if (!row) return null;
    const provenance = await loadProvenanceForFeature(
      db,
      'pair_feature_provenance',
      'pair_feature_id',
      row.id
    );
    const hashes = provenance.map((p) => p.artifact_hash);
    return {
      signal_id: signalId,
      scope: 'pair',
      feature_category: row.feature_category,
      feature_name: row.feature_name,
      value: readFeatureValue(row),
      confidence_flag: row.confidence_flag,
      extractor_name: row.extractor_name,
      extractor_version: row.extractor_version,
      extracted_at: row.extracted_at,
      provenance,
      provenance_fingerprint: fingerprintFromHashes(hashes),
    };
  }

  const row = await db
    .prepare(
      `SELECT id, platform, account_identifier, event_timestamp, event_type,
              event_data_json, extracted_at, extractor_name, extractor_version, confidence_flag
       FROM event_features
       WHERE id = ? AND investigation_id = ?`
    )
    .bind(parsed.rowId, investigationId)
    .first<{
      id: number;
      platform: string;
      account_identifier: string;
      event_timestamp: string;
      event_type: string;
      event_data_json: string | null;
      extracted_at: string;
      extractor_name: string;
      extractor_version: string;
      confidence_flag: string | null;
    }>();
  if (!row) return null;
  const provenance = await loadProvenanceForFeature(
    db,
    'event_feature_provenance',
    'event_feature_id',
    row.id
  );
  const hashes = provenance.map((p) => p.artifact_hash);
  let eventData: unknown = null;
  if (row.event_data_json) {
    try {
      eventData = JSON.parse(row.event_data_json);
    } catch {
      eventData = row.event_data_json;
    }
  }
  return {
    signal_id: signalId,
    scope: 'event',
    feature_category: 'event',
    feature_name: row.event_type,
    value: { event_timestamp: row.event_timestamp, event_type: row.event_type, event_data: eventData },
    confidence_flag: row.confidence_flag,
    extractor_name: row.extractor_name,
    extractor_version: row.extractor_version,
    extracted_at: row.extracted_at,
    event_timestamp: row.event_timestamp,
    provenance,
    provenance_fingerprint: fingerprintFromHashes(hashes),
  };
}

export async function buildEvidencePacket(
  db: Hyperdrive,
  archive: R2Bucket,
  investigationId: string,
  runId: number,
  packetSigner?: { privateKey: string; signerId?: string },
  // Encryption at rest (§3.5): decrypts the attribution output for an encrypted
  // investigation. Null for a legacy plaintext investigation.
  encKey: CryptoKey | null = null
): Promise<EvidencePacket | null> {
  const run = await getAttributionRun(db, investigationId, runId, encKey);
  if (!run) return null;

  const investigation = await queryOne<InvestigationRow>(
    db,
    'SELECT * FROM investigations WHERE id = ?',
    [investigationId]
  );
  if (!investigation) return null;

  const seedCount = await queryOne<{ count: number }>(
    db,
    `SELECT COUNT(*) AS count FROM seed_accounts
     WHERE investigation_id = ? AND removed_at IS NULL`,
    [investigationId]
  );

  let timeBounds: { start: string; end: string } | undefined;
  if (investigation.metadata_json) {
    try {
      const meta = JSON.parse(investigation.metadata_json) as Record<string, unknown>;
      const tb = meta.time_bounds as Record<string, unknown> | undefined;
      if (tb && typeof tb.start === 'string' && typeof tb.end === 'string') {
        timeBounds = { start: tb.start, end: tb.end };
      }
    } catch {
      // ignore malformed metadata
    }
  }

  const generatedAt = new Date().toISOString();
  const citedIds = collectCitedSignalIds(run.output);
  const client = resolveDatabase(db);
  const signalAppendix: SignalAppendixRow[] = [];
  for (const signalId of [...citedIds].sort()) {
    const row = await loadSignalAppendixRow(client, investigationId, signalId);
    if (row) signalAppendix.push(row);
  }

  const artifactHashes = new Set<string>();
  for (const row of signalAppendix) {
    for (const p of row.provenance) {
      artifactHashes.add(p.artifact_hash);
    }
  }

  const manifest = new ManifestStore({ bucket: archive, investigationId });
  const allEntries = await manifest.list();
  const manifestExtract = allEntries.filter((e) => artifactHashes.has(e.hash));

  const signer = new ManifestSigner({ bucket: archive, investigationId });
  const signatureResults = await signer.verifyAll();

  const narrative = {
    claims: run.output.claims ?? [],
    alternative_explanations: run.output.alternative_explanations ?? [],
    declined_pairs: run.output.declined_pairs ?? [],
    triage: run.output.triage ?? null,
  };

  const methodologyMetadata = {
    ...(typeof run.output.methodology_metadata === 'object' && run.output.methodology_metadata
      ? (run.output.methodology_metadata as Record<string, unknown>)
      : {}),
    model_name: run.model_name,
    model_version: run.model_version,
    reasoning_prompt_version: run.reasoning_prompt_version,
    manifest_hash_at_run: run.manifest_hash_at_run,
    input_feature_count: run.input_feature_count,
    run_started_at: run.started_at,
    run_completed_at: run.completed_at,
  };

  const cover = {
    investigation_id: investigationId,
    investigation_name: investigation.name,
    investigation_status: investigation.status,
    generated_at: generatedAt,
    pair: {
      account_a: run.account_a,
      account_b: run.account_b,
      platform_a: run.platform_a,
      platform_b: run.platform_b,
    },
    confidence_band: run.confidence_band,
    output_summary: run.output_summary,
    seed_count: seedCount?.count ?? 0,
    time_bounds: timeBounds,
  };

  const base: Omit<EvidencePacket, 'markdown' | 'packet_signature'> = {
    format_version: 'evidence-packet-v1',
    scope: 'pair',
    generated_at: generatedAt,
    investigation_id: investigationId,
    attribution_run_id: runId,
    cover,
    narrative,
    signal_appendix: signalAppendix,
    manifest_extract: manifestExtract,
    manifest_signature_status: {
      total_signatures: signatureResults.length,
      valid_signatures: signatureResults.filter((r) => r.valid).length,
      signatures: signatureResults.map((r) => ({
        signer_id: r.signature.signerId,
        signed_at: r.signature.signedAt,
        valid: r.valid,
        reason: r.reason,
      })),
    },
    methodology_metadata: methodologyMetadata,
    methodology_reference: METHODOLOGY_REFERENCE,
  };

  const markdown = renderMarkdown(base);

  // Detached Ed25519 signature over the canonical Markdown (paper 8.1.3),
  // produced only when an in-Worker signing key is configured; otherwise the
  // packet is exported unsigned (null) and can be signed offline instead.
  let packetSignature: PacketSignature | null = null;
  if (packetSigner?.privateKey) {
    packetSignature = await signPacketMarkdown(packetSigner.privateKey, markdown, {
      signerId: packetSigner.signerId,
    });
  }

  return {
    ...base,
    markdown,
    packet_signature: packetSignature,
  };
}

export interface BuildInvestigationPacketOptions {
  practitionerIdentity?: string;
  redaction?: RedactionOptions;
  packetSigner?: { privateKey: string; signerId?: string };
}

/**
 * Investigation-level evidence packet (§8.1.1): aggregates all attribution
 * runs, cluster composition, and band counts.
 */
export async function buildInvestigationEvidencePacket(
  db: Hyperdrive,
  archive: R2Bucket,
  investigationId: string,
  options: BuildInvestigationPacketOptions = {},
  // Encryption at rest (§3.5): decrypts attribution output for an encrypted
  // investigation. Null for a legacy plaintext investigation.
  encKey: CryptoKey | null = null
): Promise<EvidencePacket | null> {
  const investigation = await queryOne<InvestigationRow>(
    db,
    'SELECT * FROM investigations WHERE id = ?',
    [investigationId]
  );
  if (!investigation) return null;

  const runSummaries = await listAttributionRuns(db, investigationId, encKey);
  if (runSummaries.length === 0) return null;

  const seedCount = await queryOne<{ count: number }>(
    db,
    `SELECT COUNT(*) AS count FROM seed_accounts
     WHERE investigation_id = ? AND removed_at IS NULL`,
    [investigationId]
  );

  const controlRows = await query<{ account_identifier: string; platform: string }>(
    db,
    `SELECT account_identifier, MIN(platform) AS platform
     FROM seed_accounts
     WHERE investigation_id = ? AND removed_at IS NULL AND is_control = 1
     GROUP BY account_identifier`,
    [investigationId]
  );

  let timeBounds: { start: string; end: string } | undefined;
  if (investigation.metadata_json) {
    try {
      const meta = JSON.parse(investigation.metadata_json) as Record<string, unknown>;
      const tb = meta.time_bounds as Record<string, unknown> | undefined;
      if (tb && typeof tb.start === 'string' && typeof tb.end === 'string') {
        timeBounds = { start: tb.start, end: tb.end };
      }
    } catch {
      // ignore malformed metadata
    }
  }

  const attributionMeta = parseAttributionMetadata(investigation.metadata_json);
  const generatedAt = new Date().toISOString();
  const client = resolveDatabase(db);

  const pairRuns: Array<Record<string, unknown>> = [];
  const citedIds = new Set<string>();
  const controlComparisons: unknown[] = [];
  let latestMethodology: Record<string, unknown> = {};

  for (const summary of runSummaries) {
    const run = await getAttributionRun(db, investigationId, summary.id, encKey);
    if (!run) continue;

    for (const id of collectCitedSignalIds(run.output)) {
      citedIds.add(id);
    }

    if (Array.isArray(run.output.control_comparisons)) {
      controlComparisons.push(...run.output.control_comparisons);
    }

    if (
      run.output.methodology_metadata &&
      typeof run.output.methodology_metadata === 'object'
    ) {
      latestMethodology = run.output.methodology_metadata as Record<string, unknown>;
    }

    pairRuns.push({
      attribution_run_id: run.id,
      pair: {
        account_a: run.account_a,
        account_b: run.account_b,
        platform_a: run.platform_a,
        platform_b: run.platform_b,
      },
      confidence_band: run.confidence_band,
      output_summary: run.output_summary,
      claims: run.output.claims ?? [],
      alternative_explanations: run.output.alternative_explanations ?? [],
      declined_pairs: run.output.declined_pairs ?? [],
      unreliable_claim_indices: run.output.unreliable_claim_indices ?? [],
    });
  }

  const signalAppendix: SignalAppendixRow[] = [];
  for (const signalId of [...citedIds].sort()) {
    const row = await loadSignalAppendixRow(client, investigationId, signalId);
    if (row) signalAppendix.push(row);
  }

  const artifactHashes = new Set<string>();
  for (const row of signalAppendix) {
    for (const p of row.provenance) {
      artifactHashes.add(p.artifact_hash);
    }
  }

  const manifest = new ManifestStore({ bucket: archive, investigationId });
  const allEntries = await manifest.list();
  const manifestExtract = allEntries.filter((e) => artifactHashes.has(e.hash));

  const signer = new ManifestSigner({ bucket: archive, investigationId });
  const signatureResults = await signer.verifyAll();

  const bandSummary = countBands(runSummaries.map((r) => r.confidence_band));

  const narrative = {
    pair_runs: pairRuns,
    cluster_claims: attributionMeta.cluster_composition?.cluster_claims ?? [],
    control_comparisons: controlComparisons,
    investigation_language: attributionMeta.investigation_language ?? null,
  };

  const methodologyMetadata = {
    ...latestMethodology,
    investigation_language: attributionMeta.investigation_language ?? null,
    cluster_composition_at: attributionMeta.cluster_composition?.composed_at ?? null,
    attribution_run_count: runSummaries.length,
  };

  const cover = {
    investigation_id: investigationId,
    investigation_name: investigation.name,
    investigation_status: investigation.status,
    generated_at: generatedAt,
    practitioner_identity: options.practitionerIdentity ?? null,
    confidence_band_summary: bandSummary,
    seed_count: seedCount?.count ?? 0,
    time_bounds: timeBounds,
    attribution_run_count: runSummaries.length,
    output_summary: `Investigation-level packet covering ${runSummaries.length} attribution run(s).`,
  };

  let base: Omit<EvidencePacket, 'markdown' | 'packet_signature'> = {
    format_version: 'evidence-packet-v2',
    scope: 'investigation',
    generated_at: generatedAt,
    investigation_id: investigationId,
    attribution_run_id: null,
    cover,
    narrative,
    signal_appendix: signalAppendix,
    manifest_extract: manifestExtract,
    manifest_signature_status: {
      total_signatures: signatureResults.length,
      valid_signatures: signatureResults.filter((r) => r.valid).length,
      signatures: signatureResults.map((r) => ({
        signer_id: r.signature.signerId,
        signed_at: r.signature.signedAt,
        valid: r.valid,
        reason: r.reason,
      })),
    },
    methodology_metadata: methodologyMetadata,
    methodology_reference: METHODOLOGY_REFERENCE,
  };

  if (options.redaction) {
    const redacted = applyPacketRedaction(base, {
      ...options.redaction,
      controlAccounts:
        options.redaction.controlAccounts ??
        controlRows.map((r) => ({
          account: r.account_identifier,
          platform: r.platform,
        })),
    });
    base = redacted.packet;
  }

  const markdown = renderMarkdown(base);

  let packetSignature: PacketSignature | null = null;
  if (options.packetSigner?.privateKey) {
    packetSignature = await signPacketMarkdown(
      options.packetSigner.privateKey,
      markdown,
      { signerId: options.packetSigner.signerId }
    );
  }

  return {
    ...base,
    markdown,
    packet_signature: packetSignature,
  };
}
