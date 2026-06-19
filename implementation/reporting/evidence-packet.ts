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
import type { ManifestEntry } from '../archive/types';
import { getAttributionRun } from '../attribution/query';
import { queryOne, resolveDatabase } from '../db';
import { readFeatureValue } from '../schema/db-types';
import type { InvestigationRow } from '../schema/db-types';
import { parseSignalId } from '../reasoner/types';

const METHODOLOGY_REFERENCE = {
  paper: 'Common Thread: Sockpuppet Attribution from Public Behavioral Signals',
  paper_section: '§8.1',
  repository: 'https://github.com/SkyPhusion/common-thread',
  implementation_version: '0.1.0',
};

export interface SignalAppendixRow {
  signal_id: string;
  scope: 'account' | 'pair' | 'event';
  feature_category: string;
  feature_name: string;
  value: unknown;
  confidence_flag: string | null;
  extractor_name: string;
  extractor_version: string;
  extracted_at: string;
  event_timestamp?: string;
  provenance: Array<{ artifact_hash: string; manifest_entry_hash: string | null }>;
  provenance_fingerprint: string;
}

export interface EvidencePacket {
  format_version: 'evidence-packet-v1';
  generated_at: string;
  investigation_id: string;
  attribution_run_id: number;
  cover: Record<string, unknown>;
  narrative: Record<string, unknown>;
  signal_appendix: SignalAppendixRow[];
  manifest_extract: ManifestEntry[];
  manifest_signature_status: {
    total_signatures: number;
    valid_signatures: number;
    signatures: Array<{
      signer_id?: string;
      signed_at: string;
      valid: boolean;
      reason?: string;
    }>;
  };
  methodology_metadata: Record<string, unknown>;
  methodology_reference: typeof METHODOLOGY_REFERENCE;
  markdown: string;
}

function fingerprintFromHashes(hashes: string[]): string {
  const unique = [...new Set(hashes)].sort();
  return unique.map((h) => h.slice(0, 8)).join(',');
}

export function collectCitedSignalIds(output: Record<string, unknown>): Set<string> {
  const ids = new Set<string>();
  const addFromCitations = (citations: unknown) => {
    if (!Array.isArray(citations)) return;
    for (const c of citations) {
      if (c && typeof c === 'object' && typeof (c as { signal_id?: string }).signal_id === 'string') {
        ids.add((c as { signal_id: string }).signal_id);
      }
    }
  };
  if (Array.isArray(output.claims)) {
    for (const claim of output.claims) {
      if (claim && typeof claim === 'object') {
        addFromCitations((claim as { citations?: unknown }).citations);
      }
    }
  }
  if (Array.isArray(output.alternative_explanations)) {
    for (const alt of output.alternative_explanations) {
      if (alt && typeof alt === 'object') {
        addFromCitations((alt as { citations?: unknown }).citations);
      }
    }
  }
  return ids;
}

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

function renderMarkdown(packet: Omit<EvidencePacket, 'markdown'>): string {
  const lines: string[] = [];
  const cover = packet.cover as {
    investigation_name?: string;
    investigation_id?: string;
    pair?: { account_a: string; account_b: string; platform_a: string; platform_b: string };
    confidence_band?: string;
    output_summary?: string;
    generated_at?: string;
    seed_count?: number;
    time_bounds?: { start: string; end: string };
  };

  lines.push('# Common Thread Evidence Packet');
  lines.push('');
  lines.push('## Cover');
  lines.push('');
  lines.push(`- **Investigation:** ${cover.investigation_name ?? cover.investigation_id}`);
  lines.push(`- **Investigation ID:** ${cover.investigation_id}`);
  lines.push(`- **Attribution run ID:** ${packet.attribution_run_id}`);
  lines.push(`- **Generated:** ${cover.generated_at ?? packet.generated_at}`);
  if (cover.pair) {
    lines.push(
      `- **Pair:** ${cover.pair.platform_a}:${cover.pair.account_a} / ${cover.pair.platform_b}:${cover.pair.account_b}`
    );
  }
  lines.push(`- **Confidence band:** ${cover.confidence_band ?? 'unknown'}`);
  if (cover.seed_count !== undefined) {
    lines.push(`- **Active seeds:** ${cover.seed_count}`);
  }
  if (cover.time_bounds) {
    lines.push(`- **Time window:** ${cover.time_bounds.start} — ${cover.time_bounds.end}`);
  }
  lines.push('');
  if (cover.output_summary) {
    lines.push('### Summary');
    lines.push('');
    lines.push(cover.output_summary);
    lines.push('');
  }

  lines.push('## Narrative');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(packet.narrative, null, 2));
  lines.push('```');
  lines.push('');

  lines.push('## Signal appendix');
  lines.push('');
  if (packet.signal_appendix.length === 0) {
    lines.push('_No cited signals._');
  } else {
    for (const row of packet.signal_appendix) {
      lines.push(`### ${row.signal_id}: ${row.feature_name}`);
      lines.push('');
      lines.push(`- Category: ${row.feature_category}`);
      lines.push(`- Extractor: ${row.extractor_name}@${row.extractor_version}`);
      lines.push(`- Confidence: ${row.confidence_flag ?? 'unknown'}`);
      lines.push(`- Extracted at: ${row.extracted_at}`);
      lines.push(`- Provenance fingerprint: ${row.provenance_fingerprint}`);
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(row.value, null, 2));
      lines.push('```');
      lines.push('');
    }
  }

  lines.push('## Manifest extract');
  lines.push('');
  lines.push(`_${packet.manifest_extract.length} entries cited by signal provenance._`);
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(packet.manifest_extract, null, 2));
  lines.push('```');
  lines.push('');

  lines.push('## Methodology metadata');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(packet.methodology_metadata, null, 2));
  lines.push('```');
  lines.push('');

  lines.push('## Methodology reference');
  lines.push('');
  lines.push(`- Paper: ${packet.methodology_reference.paper}`);
  lines.push(`- Repository: ${packet.methodology_reference.repository}`);
  lines.push(`- Implementation version: ${packet.methodology_reference.implementation_version}`);

  return lines.join('\n');
}

export async function buildEvidencePacket(
  db: Hyperdrive,
  archive: R2Bucket,
  investigationId: string,
  runId: number
): Promise<EvidencePacket | null> {
  const run = await getAttributionRun(db, investigationId, runId);
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

  const base: Omit<EvidencePacket, 'markdown'> = {
    format_version: 'evidence-packet-v1',
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

  return {
    ...base,
    markdown: renderMarkdown(base),
  };
}
