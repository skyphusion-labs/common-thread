/**
 * Investigation-level language profile (§7.6.5).
 *
 * Determines whether an investigation is non-English-primary from
 * tweet_language_distribution and profile_lang account features.
 */

import type { DatabaseClient } from '../db';
import type { FeatureValue } from '../schema/db-types';
import { readFeatureValue } from '../schema/db-types';

export interface InvestigationLanguageProfile {
  primary_language: string;
  /** True when primary language is not English (§7.6.5 cap applies). */
  is_non_english: boolean;
  /** ISO timestamp when the profile was computed. */
  determined_at: string;
}

const ENGLISH_CODES = new Set(['en', 'eng', 'en-us', 'en-gb']);

function isEnglishCode(code: string): boolean {
  const normalized = code.toLowerCase().trim();
  if (ENGLISH_CODES.has(normalized)) return true;
  return normalized.startsWith('en-');
}

function parseLanguageDistribution(value: FeatureValue): Record<string, number> {
  if (value.kind !== 'json' || !value.value || typeof value.value !== 'object') {
    return {};
  }
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value.value as Record<string, unknown>)) {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      out[key] = raw;
    }
  }
  return out;
}

function mergeDistributions(
  target: Record<string, number>,
  source: Record<string, number>
): void {
  for (const [lang, count] of Object.entries(source)) {
    target[lang] = (target[lang] ?? 0) + count;
  }
}

function primaryLanguageFromCounts(counts: Record<string, number>): string {
  let best = 'unknown';
  let bestCount = -1;
  for (const [lang, count] of Object.entries(counts)) {
    if (count > bestCount) {
      best = lang;
      bestCount = count;
    }
  }
  return best;
}

export async function determineInvestigationLanguage(
  db: DatabaseClient,
  investigationId: string
): Promise<InvestigationLanguageProfile> {
  const res = await db
    .prepare(
      `SELECT feature_name, feature_value_text, feature_value_numeric, feature_value_json
       FROM account_features
       WHERE investigation_id = ?
         AND feature_name IN ('tweet_language_distribution', 'profile_lang')`
    )
    .bind(investigationId)
    .all<{
      feature_name: string;
      feature_value_text: string | null;
      feature_value_numeric: number | null;
      feature_value_json: string | null;
    }>();

  const langCounts: Record<string, number> = {};
  const profileLangs: string[] = [];

  for (const row of res.results ?? []) {
    const value = readFeatureValue(row);
    if (row.feature_name === 'tweet_language_distribution') {
      mergeDistributions(langCounts, parseLanguageDistribution(value));
    } else if (row.feature_name === 'profile_lang' && value.kind === 'text') {
      profileLangs.push(value.value);
    }
  }

  let primary = primaryLanguageFromCounts(langCounts);
  if (primary === 'unknown' && profileLangs.length > 0) {
    const profileCounts: Record<string, number> = {};
    for (const lang of profileLangs) {
      profileCounts[lang] = (profileCounts[lang] ?? 0) + 1;
    }
    primary = primaryLanguageFromCounts(profileCounts);
  }

  return {
    primary_language: primary,
    is_non_english: primary !== 'unknown' && !isEnglishCode(primary),
    determined_at: new Date().toISOString(),
  };
}
