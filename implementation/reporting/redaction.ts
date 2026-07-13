/**
 * Evidence packet redaction (§8.3.5).
 */

import type { ConfidenceBand } from '../schema/db-types';
import type { EvidencePacket, SignalAppendixRow } from './evidence-packet-meta';

export interface RedactionEntry {
  kind: 'control_pseudonym' | 'practitioner_supplied' | 'account_identifier';
  original: string;
  replacement: string;
}

export interface RedactionMetadata {
  applied_at: string;
  entries: RedactionEntry[];
  notes: string[];
}

export interface RedactionOptions {
  /** Control accounts to pseudonymize as control-1, control-2, ... */
  controlAccounts?: Array<{ account: string; platform: string }>;
  /** Additional account identifiers to redact (exact match). */
  practitionerRedactions?: string[];
  /** When false, skip automatic control pseudonymization. Default true. */
  pseudonymizeControls?: boolean;
}

function accountAliases(account: string, platform: string): string[] {
  return [account, `${platform}:${account}`, `${account} (${platform})`];
}

function replaceInString(input: string, replacements: Map<string, string>): string {
  let out = input;
  const sorted = [...replacements.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of sorted) {
    if (!from) continue;
    out = out.split(from).join(to);
  }
  return out;
}

function buildReplacementMap(options: RedactionOptions): {
  map: Map<string, string>;
  entries: RedactionEntry[];
  notes: string[];
} {
  const map = new Map<string, string>();
  const entries: RedactionEntry[] = [];
  const notes: string[] = [];

  if (options.pseudonymizeControls !== false && options.controlAccounts) {
    const sorted = [...options.controlAccounts].sort((a, b) => {
      const ak = `${a.platform}:${a.account}`;
      const bk = `${b.platform}:${b.account}`;
      return ak.localeCompare(bk);
    });
    sorted.forEach((control, index) => {
      const replacement = `control-${index + 1}`;
      for (const alias of accountAliases(control.account, control.platform)) {
        map.set(alias, replacement);
      }
      entries.push({
        kind: 'control_pseudonym',
        original: `${control.platform}:${control.account}`,
        replacement,
      });
    });
    if (sorted.length > 0) {
      notes.push('Control account identifiers pseudonymized per §8.3.5.');
    }
  }

  for (const id of options.practitionerRedactions ?? []) {
    const trimmed = id.trim();
    if (!trimmed) continue;
    map.set(trimmed, '[redacted]');
    entries.push({
      kind: 'practitioner_supplied',
      original: trimmed,
      replacement: '[redacted]',
    });
  }
  if ((options.practitionerRedactions ?? []).length > 0) {
    notes.push('Practitioner-supplied identifiers redacted.');
  }

  return { map, entries, notes };
}

function redactUnknown(value: unknown, replacements: Map<string, string>): unknown {
  if (typeof value === 'string') {
    return replaceInString(value, replacements);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item, replacements));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = redactUnknown(child, replacements);
    }
    return out;
  }
  return value;
}

export function applyPacketRedaction<T extends Omit<EvidencePacket, 'markdown' | 'packet_signature'>>(
  packet: T,
  options: RedactionOptions
): { packet: T & { redaction: RedactionMetadata }; redaction: RedactionMetadata } {
  const { map, entries, notes } = buildReplacementMap(options);
  if (map.size === 0) {
    const empty: RedactionMetadata = {
      applied_at: new Date().toISOString(),
      entries: [],
      notes: ['No redaction rules applied.'],
    };
    return { packet: { ...packet, redaction: empty }, redaction: empty };
  }

  const cover = redactUnknown(packet.cover, map) as Record<string, unknown>;
  const narrative = redactUnknown(packet.narrative, map) as Record<string, unknown>;
  const signal_appendix = packet.signal_appendix.map((row) =>
    redactSignalRow(row, map)
  );

  const redaction: RedactionMetadata = {
    applied_at: new Date().toISOString(),
    entries,
    notes,
  };

  const redacted = {
    ...packet,
    cover: { ...cover, redaction },
    narrative,
    signal_appendix,
    redaction,
  };

  return { packet: redacted, redaction };
}

function redactSignalRow(row: SignalAppendixRow, replacements: Map<string, string>): SignalAppendixRow {
  return {
    ...row,
    feature_name: replaceInString(row.feature_name, replacements),
    value: redactUnknown(row.value, replacements),
  };
}

export function countBands(
  bands: ConfidenceBand[]
): Record<ConfidenceBand, number> {
  return {
    insufficient: bands.filter((b) => b === 'insufficient').length,
    consistent: bands.filter((b) => b === 'consistent').length,
    strongly_consistent: bands.filter((b) => b === 'strongly_consistent').length,
  };
}
