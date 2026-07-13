/**
 * Attribution-derived investigation metadata persisted in metadata_json.
 */

import type { DatabaseClient } from '../db';
import type { InvestigationComposition } from '../reasoner/cluster-composition';
import type { InvestigationLanguageProfile } from '../reasoner/investigation-language';

export interface AttributionMetadataFields {
  investigation_language?: InvestigationLanguageProfile;
  cluster_composition?: InvestigationComposition;
}

export function mergeAttributionMetadataJson(
  existingJson: string | null,
  fields: AttributionMetadataFields
): string {
  let base: Record<string, unknown> = {};
  if (existingJson) {
    try {
      base = JSON.parse(existingJson) as Record<string, unknown>;
    } catch {
      base = {};
    }
  }

  if (fields.investigation_language) {
    base.investigation_language = fields.investigation_language;
  }
  if (fields.cluster_composition) {
    base.cluster_composition = fields.cluster_composition;
  }

  return JSON.stringify(base);
}

export function parseAttributionMetadata(
  metadataJson: string | null
): AttributionMetadataFields {
  if (!metadataJson) return {};
  try {
    const parsed = JSON.parse(metadataJson) as Record<string, unknown>;
    const out: AttributionMetadataFields = {};
    if (parsed.investigation_language && typeof parsed.investigation_language === 'object') {
      out.investigation_language = parsed.investigation_language as InvestigationLanguageProfile;
    }
    if (parsed.cluster_composition && typeof parsed.cluster_composition === 'object') {
      out.cluster_composition = parsed.cluster_composition as InvestigationComposition;
    }
    return out;
  } catch {
    return {};
  }
}

export async function persistAttributionMetadata(
  db: DatabaseClient,
  investigationId: string,
  fields: AttributionMetadataFields
): Promise<void> {
  const row = await db
    .prepare('SELECT metadata_json FROM investigations WHERE id = ?')
    .bind(investigationId)
    .first<{ metadata_json: string | null }>();
  if (!row) return;

  const merged = mergeAttributionMetadataJson(row.metadata_json, fields);
  const now = new Date().toISOString();
  await db
    .prepare('UPDATE investigations SET metadata_json = ?, updated_at = ? WHERE id = ?')
    .bind(merged, now, investigationId)
    .run();
}
