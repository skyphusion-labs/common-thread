/**
 * Evidence packet metadata + rendering (methodology paper §8.1).
 *
 * The pure, court-facing half of the evidence packet: the methodology citation,
 * the packet shape, and the Markdown renderer. Split out from evidence-packet.ts
 * (the builder, which touches D1/R2/Hyperdrive) so the citation + rendering are
 * unit-testable without standing up the database stack (issue #32).
 */

import type { ManifestEntry } from '../archive/types';
import type { PacketSignature } from '../archive/signing';
// Source the implementation version from the single source of truth (the root
// package.json) rather than a hardcoded literal, so the evidence packet's
// reproducibility envelope tracks the real build. resolveJsonModule is enabled
// and the bundler inlines this at build time (issue #32).
import pkg from '../../package.json';

export const METHODOLOGY_REFERENCE = {
  paper: 'Common Thread: Sockpuppet Attribution from Public Behavioral Signals',
  paper_section: '§8.1',
  repository: 'https://github.com/skyphusion-labs/common-thread',
  implementation_version: pkg.version,
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
  format_version: 'evidence-packet-v1' | 'evidence-packet-v2';
  /** pair (default v1) or investigation-level (v2). */
  scope?: 'pair' | 'investigation';
  generated_at: string;
  investigation_id: string;
  attribution_run_id: number | null;
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
  /** Present when redaction was applied (§8.3.5). */
  redaction?: {
    applied_at: string;
    entries: Array<{
      kind: string;
      original: string;
      replacement: string;
    }>;
    notes: string[];
  };
  markdown: string;
  /** Detached Ed25519 signature over the canonical Markdown (8.1.3), or
   * null when no signing key is configured. */
  packet_signature: PacketSignature | null;
}

export function fingerprintFromHashes(hashes: string[]): string {
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

export function renderMarkdown(packet: Omit<EvidencePacket, 'markdown' | 'packet_signature'>): string {
  const lines: string[] = [];
  const cover = packet.cover as {
    investigation_name?: string;
    investigation_id?: string;
    practitioner_identity?: string;
    pair?: { account_a: string; account_b: string; platform_a: string; platform_b: string };
    confidence_band?: string;
    confidence_band_summary?: Record<string, number>;
    output_summary?: string;
    generated_at?: string;
    seed_count?: number;
    time_bounds?: { start: string; end: string };
    investigation_status?: string;
    attribution_run_count?: number;
  };

  lines.push('# Common Thread Evidence Packet');
  lines.push('');
  lines.push('## Cover');
  lines.push('');
  lines.push(`- **Investigation:** ${cover.investigation_name ?? cover.investigation_id}`);
  lines.push(`- **Investigation ID:** ${cover.investigation_id}`);
  if (cover.practitioner_identity) {
    lines.push(`- **Practitioner:** ${cover.practitioner_identity}`);
  }
  if (packet.scope === 'investigation' || packet.format_version === 'evidence-packet-v2') {
    lines.push(`- **Scope:** investigation-level (§8.1.1)`);
    if (cover.attribution_run_count !== undefined) {
      lines.push(`- **Attribution runs:** ${cover.attribution_run_count}`);
    }
  } else if (packet.attribution_run_id !== null) {
    lines.push(`- **Attribution run ID:** ${packet.attribution_run_id}`);
  }
  lines.push(`- **Generated:** ${cover.generated_at ?? packet.generated_at}`);
  if (cover.pair) {
    lines.push(
      `- **Pair:** ${cover.pair.platform_a}:${cover.pair.account_a} / ${cover.pair.platform_b}:${cover.pair.account_b}`
    );
  }
  if (cover.confidence_band_summary) {
    const summary = cover.confidence_band_summary;
    lines.push(
      `- **Confidence band summary:** insufficient=${summary.insufficient ?? 0}, consistent=${summary.consistent ?? 0}, strongly_consistent=${summary.strongly_consistent ?? 0}`
    );
  } else {
    lines.push(`- **Confidence band:** ${cover.confidence_band ?? 'unknown'}`);
  }
  if (cover.seed_count !== undefined) {
    lines.push(`- **Active seeds:** ${cover.seed_count}`);
  }
  if (cover.time_bounds) {
    lines.push(`- **Time window:** ${cover.time_bounds.start} to ${cover.time_bounds.end}`);
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

  if (packet.redaction && packet.redaction.entries.length > 0) {
    lines.push('');
    lines.push('## Redaction');
    lines.push('');
    for (const note of packet.redaction.notes) {
      lines.push(`- ${note}`);
    }
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(packet.redaction.entries, null, 2));
    lines.push('```');
  }

  return lines.join('\n');
}
