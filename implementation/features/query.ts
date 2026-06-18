/**
 * Investigation feature queries for the HTTP API (§6.3).
 */

import type { Hyperdrive } from '@cloudflare/workers-types';
import { query } from '../db';
import { canonicalPair, readFeatureValue } from '../schema/db-types';

export type FeatureScope = 'account' | 'pair' | 'event' | 'all';

export interface FeaturesQueryOptions {
  investigationId: string;
  account?: string;
  platform?: string;
  /** Canonical account pair [a, b] when filtering pair features. */
  pair?: [string, string];
  category?: string;
  scope?: FeatureScope;
  includeProvenance?: boolean;
}

export interface FeatureProvenanceRow {
  artifact_hash: string;
  manifest_entry_hash: string | null;
}

export interface AccountFeatureResponse {
  scope: 'account';
  id: number;
  platform: string;
  account_identifier: string;
  feature_category: string;
  feature_name: string;
  value: ReturnType<typeof readFeatureValue>;
  extracted_at: string;
  extractor_name: string;
  extractor_version: string;
  extractor_run_id: number | null;
  confidence_flag: string | null;
  provenance?: FeatureProvenanceRow[];
}

export interface PairFeatureResponse {
  scope: 'pair';
  id: number;
  platform_a: string;
  platform_b: string;
  account_a: string;
  account_b: string;
  feature_category: string;
  feature_name: string;
  value: ReturnType<typeof readFeatureValue>;
  extracted_at: string;
  extractor_name: string;
  extractor_version: string;
  extractor_run_id: number | null;
  confidence_flag: string | null;
  provenance?: FeatureProvenanceRow[];
}

export interface EventFeatureResponse {
  scope: 'event';
  id: number;
  platform: string;
  account_identifier: string;
  event_timestamp: string;
  event_type: string;
  event_data: unknown;
  extracted_at: string;
  extractor_name: string;
  extractor_version: string;
  extractor_run_id: number | null;
  confidence_flag: string | null;
  provenance?: FeatureProvenanceRow[];
}

export interface FeaturesQueryResult {
  investigationId: string;
  filters: {
    account?: string;
    platform?: string;
    pair?: [string, string];
    category?: string;
    scope: FeatureScope;
  };
  account_features: AccountFeatureResponse[];
  pair_features: PairFeatureResponse[];
  event_features: EventFeatureResponse[];
  count: {
    account: number;
    pair: number;
    event: number;
    total: number;
  };
}

type AccountRow = {
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
  extractor_run_id: number | null;
  confidence_flag: string | null;
};

type PairRow = AccountRow & {
  platform_a: string;
  platform_b: string;
  account_a: string;
  account_b: string;
};

type EventRow = {
  id: number;
  platform: string;
  account_identifier: string;
  event_timestamp: string;
  event_type: string;
  event_data_json: string | null;
  extracted_at: string;
  extractor_name: string;
  extractor_version: string;
  extractor_run_id: number | null;
  confidence_flag: string | null;
};

export function parseFeaturesQueryParams(
  investigationId: string,
  searchParams: URLSearchParams
): FeaturesQueryOptions | { error: string } {
  const scopeParam = searchParams.get('scope');
  const scope: FeatureScope =
    scopeParam === 'account' || scopeParam === 'pair' || scopeParam === 'event'
      ? scopeParam
      : 'all';

  const account = searchParams.get('account')?.trim() || undefined;
  const platform = searchParams.get('platform')?.trim() || undefined;
  const category = searchParams.get('category')?.trim() || undefined;
  const includeProvenance = searchParams.get('includeProvenance') === 'true';

  let pair: [string, string] | undefined;
  const pairParam = searchParams.get('pair');
  if (pairParam) {
    const parts = pairParam.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length !== 2) {
      return { error: 'pair must be two comma-separated account identifiers' };
    }
    pair = canonicalPair(parts[0], parts[1]);
  }

  const accountA = searchParams.get('accountA')?.trim();
  const accountB = searchParams.get('accountB')?.trim();
  if (!pair && accountA && accountB) {
    pair = canonicalPair(accountA, accountB);
  }

  return {
    investigationId,
    account,
    platform,
    pair,
    category,
    scope,
    includeProvenance,
  };
}

async function loadProvenanceMap(
  db: Hyperdrive,
  table: 'account_feature_provenance' | 'pair_feature_provenance' | 'event_feature_provenance',
  idColumn: 'account_feature_id' | 'pair_feature_id' | 'event_feature_id',
  featureIds: number[]
): Promise<Map<number, FeatureProvenanceRow[]>> {
  const map = new Map<number, FeatureProvenanceRow[]>();
  if (featureIds.length === 0) return map;

  const placeholders = featureIds.map(() => '?').join(', ');
  const rows = await query<FeatureProvenanceRow & { feature_id: number }>(
    db,
    `SELECT ${idColumn} AS feature_id, artifact_hash, manifest_entry_hash
     FROM ${table}
     WHERE ${idColumn} IN (${placeholders})`,
    featureIds
  );

  for (const row of rows) {
    const list = map.get(row.feature_id) ?? [];
    list.push({
      artifact_hash: row.artifact_hash,
      manifest_entry_hash: row.manifest_entry_hash,
    });
    map.set(row.feature_id, list);
  }
  return map;
}

export async function queryInvestigationFeatures(
  db: Hyperdrive,
  options: FeaturesQueryOptions
): Promise<FeaturesQueryResult> {
  const scope = options.scope ?? 'all';
  const accountFeatures: AccountFeatureResponse[] = [];
  const pairFeatures: PairFeatureResponse[] = [];
  const eventFeatures: EventFeatureResponse[] = [];

  if (scope === 'all' || scope === 'account') {
    const conditions = ['investigation_id = ?'];
    const params: unknown[] = [options.investigationId];
    if (options.account) {
      conditions.push('account_identifier = ?');
      params.push(options.account);
    }
    if (options.platform) {
      conditions.push('platform = ?');
      params.push(options.platform);
    }
    if (options.category) {
      conditions.push('feature_category = ?');
      params.push(options.category);
    }
    const rows = await query<AccountRow>(
      db,
      `SELECT id, platform, account_identifier, feature_category, feature_name,
              feature_value_text, feature_value_numeric, feature_value_json,
              extracted_at, extractor_name, extractor_version, extractor_run_id,
              confidence_flag
       FROM account_features
       WHERE ${conditions.join(' AND ')}
       ORDER BY account_identifier, feature_category, feature_name`,
      params
    );
    const provMap = options.includeProvenance
      ? await loadProvenanceMap(db, 'account_feature_provenance', 'account_feature_id', rows.map((r) => r.id))
      : new Map();
    for (const row of rows) {
      accountFeatures.push({
        scope: 'account',
        id: row.id,
        platform: row.platform,
        account_identifier: row.account_identifier,
        feature_category: row.feature_category,
        feature_name: row.feature_name,
        value: readFeatureValue(row),
        extracted_at: row.extracted_at,
        extractor_name: row.extractor_name,
        extractor_version: row.extractor_version,
        extractor_run_id: row.extractor_run_id,
        confidence_flag: row.confidence_flag,
        provenance: options.includeProvenance ? provMap.get(row.id) : undefined,
      });
    }
  }

  if (scope === 'all' || scope === 'pair') {
    const conditions = ['investigation_id = ?'];
    const params: unknown[] = [options.investigationId];
    if (options.pair) {
      conditions.push('account_a = ?', 'account_b = ?');
      params.push(options.pair[0], options.pair[1]);
    }
    if (options.category) {
      conditions.push('feature_category = ?');
      params.push(options.category);
    }
    if (options.account && !options.pair) {
      conditions.push('(account_a = ? OR account_b = ?)');
      params.push(options.account, options.account);
    }
    const rows = await query<PairRow>(
      db,
      `SELECT id, platform_a, platform_b, account_a, account_b, feature_category, feature_name,
              feature_value_text, feature_value_numeric, feature_value_json,
              extracted_at, extractor_name, extractor_version, extractor_run_id,
              confidence_flag
       FROM pair_features
       WHERE ${conditions.join(' AND ')}
       ORDER BY account_a, account_b, feature_category, feature_name`,
      params
    );
    const provMap = options.includeProvenance
      ? await loadProvenanceMap(db, 'pair_feature_provenance', 'pair_feature_id', rows.map((r) => r.id))
      : new Map();
    for (const row of rows) {
      pairFeatures.push({
        scope: 'pair',
        id: row.id,
        platform_a: row.platform_a,
        platform_b: row.platform_b,
        account_a: row.account_a,
        account_b: row.account_b,
        feature_category: row.feature_category,
        feature_name: row.feature_name,
        value: readFeatureValue(row),
        extracted_at: row.extracted_at,
        extractor_name: row.extractor_name,
        extractor_version: row.extractor_version,
        extractor_run_id: row.extractor_run_id,
        confidence_flag: row.confidence_flag,
        provenance: options.includeProvenance ? provMap.get(row.id) : undefined,
      });
    }
  }

  if (scope === 'all' || scope === 'event') {
    const conditions = ['investigation_id = ?'];
    const params: unknown[] = [options.investigationId];
    if (options.account) {
      conditions.push('account_identifier = ?');
      params.push(options.account);
    }
    if (options.platform) {
      conditions.push('platform = ?');
      params.push(options.platform);
    }
    const rows = await query<EventRow>(
      db,
      `SELECT id, platform, account_identifier, event_timestamp, event_type,
              event_data_json, extracted_at, extractor_name, extractor_version,
              extractor_run_id, confidence_flag
       FROM event_features
       WHERE ${conditions.join(' AND ')}
       ORDER BY account_identifier, event_timestamp, event_type`,
      params
    );
    const provMap = options.includeProvenance
      ? await loadProvenanceMap(db, 'event_feature_provenance', 'event_feature_id', rows.map((r) => r.id))
      : new Map();
    for (const row of rows) {
      let eventData: unknown = null;
      if (row.event_data_json) {
        try {
          eventData = JSON.parse(row.event_data_json);
        } catch {
          eventData = row.event_data_json;
        }
      }
      eventFeatures.push({
        scope: 'event',
        id: row.id,
        platform: row.platform,
        account_identifier: row.account_identifier,
        event_timestamp: row.event_timestamp,
        event_type: row.event_type,
        event_data: eventData,
        extracted_at: row.extracted_at,
        extractor_name: row.extractor_name,
        extractor_version: row.extractor_version,
        extractor_run_id: row.extractor_run_id,
        confidence_flag: row.confidence_flag,
        provenance: options.includeProvenance ? provMap.get(row.id) : undefined,
      });
    }
  }

  return {
    investigationId: options.investigationId,
    filters: {
      account: options.account,
      platform: options.platform,
      pair: options.pair,
      category: options.category,
      scope,
    },
    account_features: accountFeatures,
    pair_features: pairFeatures,
    event_features: eventFeatures,
    count: {
      account: accountFeatures.length,
      pair: pairFeatures.length,
      event: eventFeatures.length,
      total: accountFeatures.length + pairFeatures.length + eventFeatures.length,
    },
  };
}
