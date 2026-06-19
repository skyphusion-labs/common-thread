/**
 * Triggering-event response latency (§4.2.2).
 *
 * Reads practitioner-supplied triggering_events from investigation
 * metadata and timeline artifacts, emitting per-account latency
 * records and per-pair correlation features.
 */

import { ArchiveStore } from '../../archive/store';
import { ManifestStore } from '../../archive/manifest';
import type { DatabaseClient } from '../../db';
import { packFeatureValue } from '../../schema/db-types';
import {
  parseTriggeringEvents,
  type TriggerResponseRecord,
  type TriggeringEvent,
} from '../../investigations/triggers';
import { isApifyTweetLike, tweetText } from '../../ingest/apify-tweet-fields';
import { parseTimestamp } from './helpers';
import type { PairFeatureExtractor, AccountFeatureMap } from '../pair-types';
import type { ExtractedFeature } from '../types';

const ACCOUNT_RUNNER_NAME = 'response_latency_temporal';
const ACCOUNT_RUNNER_VERSION = '1.0.0';
const PAIR_NAME = 'response_latency_correlation_temporal';
const PAIR_VERSION = '1.0.0';

export interface RunResponseLatencyOptions {
  investigationId: string;
  accountFilter?: string[];
}

/**
 * Investigation-scoped pass: not a standard account extractor because
 * it needs metadata_json.triggering_events plus timeline artifacts.
 */
export async function runResponseLatencyExtraction(
  env: { DB: DatabaseClient; ARCHIVE: R2Bucket },
  options: RunResponseLatencyOptions
): Promise<{ featuresWritten: number; extractorRunId: number }> {
  const meta = await env.DB.prepare(
    'SELECT metadata_json FROM investigations WHERE id = ?'
  )
    .bind(options.investigationId)
    .first<{ metadata_json: string | null }>();

  const triggers = parseTriggeringEvents(meta?.metadata_json ?? null);
  if (triggers.length === 0) {
    return { featuresWritten: 0, extractorRunId: 0 };
  }

  const manifest = new ManifestStore({ bucket: env.ARCHIVE, investigationId: options.investigationId });
  const manifestHash = (await manifest.manifestHash()) ?? '';
  const startedAt = new Date().toISOString();

  const runRes = await env.DB.prepare(
    `INSERT INTO extractor_runs (
       investigation_id, extractor_name, extractor_version,
       manifest_hash_at_run, started_at, status
     ) VALUES (?, ?, ?, ?, ?, 'running')`
  )
    .bind(
      options.investigationId,
      ACCOUNT_RUNNER_NAME,
      ACCOUNT_RUNNER_VERSION,
      manifestHash,
      startedAt
    )
    .run();
  const extractorRunId = runRes.meta.last_row_id as number;

  const archive = new ArchiveStore({ bucket: env.ARCHIVE });
  const entries = await manifest.list({
    investigationId: options.investigationId,
    status: 'present',
  });

  const filter = options.accountFilter ? new Set(options.accountFilter) : null;
  let featuresWritten = 0;

  try {
    for (const entry of entries) {
      if (!entry.account) continue;
      if (filter && !filter.has(entry.account)) continue;

      const tool = entry.collectionMethod.tool.toLowerCase();
      if (!tool.includes('timeline') && !tool.includes('tweets')) continue;

      const artifact = await archive.get(entry.hash, undefined);
      if (!artifact) continue;

      const tweets = parseTimelineBytes(artifact.bytes);
      const latencies = computeLatenciesForAccount(tweets, triggers);
      const platform = inferPlatform(entry);

      const packed = packFeatureValue({
        kind: 'json',
        value: latencies,
      });
      const extractedAt = new Date().toISOString();
      const confidence = latencies.length === 0 ? 'insufficient' : 'sufficient';

      const ins = await env.DB.prepare(
        `INSERT INTO account_features (
           investigation_id, platform, account_identifier,
           feature_category, feature_name,
           feature_value_text, feature_value_numeric, feature_value_json,
           extracted_at, extractor_name, extractor_version, extractor_run_id,
           confidence_flag
         ) VALUES (?, ?, ?, 'temporal', 'trigger_response_latencies', ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          options.investigationId,
          platform,
          entry.account,
          packed.feature_value_text,
          packed.feature_value_numeric,
          packed.feature_value_json,
          extractedAt,
          ACCOUNT_RUNNER_NAME,
          ACCOUNT_RUNNER_VERSION,
          extractorRunId,
          confidence
        )
        .run();

      const featureId = ins.meta.last_row_id as number;
      await env.DB.prepare(
        `INSERT INTO account_feature_provenance (account_feature_id, artifact_hash)
         VALUES (?, ?)`
      )
        .bind(featureId, entry.hash)
        .run();

      featuresWritten++;
    }

    await env.DB.prepare(
      `UPDATE extractor_runs SET completed_at = ?, status = 'completed',
         input_artifact_count = ?, output_feature_count = ?
       WHERE id = ?`
    )
      .bind(new Date().toISOString(), entries.length, featuresWritten, extractorRunId)
      .run();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await env.DB.prepare(
      `UPDATE extractor_runs SET completed_at = ?, status = 'failed', error_message = ? WHERE id = ?`
    )
      .bind(new Date().toISOString(), message, extractorRunId)
      .run();
    throw err;
  }

  return { featuresWritten, extractorRunId };
}

export class ResponseLatencyPairExtractor implements PairFeatureExtractor {
  readonly name = PAIR_NAME;
  readonly version = PAIR_VERSION;
  readonly category = 'temporal' as const;
  readonly requiredAccountFeatures = ['trigger_response_latencies'] as const;

  extract(
    _a: string,
    _b: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap
  ): ExtractedFeature[] {
    const latA = parseLatencies(featuresA.get('trigger_response_latencies'));
    const latB = parseLatencies(featuresB.get('trigger_response_latencies'));
    if (latA.size === 0 || latB.size === 0) return [];

    const sharedEvents = [...latA.keys()].filter(id => latB.has(id));
    if (sharedEvents.length === 0) return [];

    const diffs: number[] = [];
    const valsA: number[] = [];
    const valsB: number[] = [];
    for (const id of sharedEvents) {
      const a = latA.get(id)!;
      const b = latB.get(id)!;
      diffs.push(Math.abs(a - b));
      valsA.push(a);
      valsB.push(b);
    }

    const meanDiff = diffs.reduce((s, x) => s + x, 0) / diffs.length;
    const corr = pearson(valsA, valsB);

    const features: ExtractedFeature[] = [
      {
        category: 'temporal',
        name: 'shared_trigger_event_count',
        value: { kind: 'numeric', value: sharedEvents.length },
      },
      {
        category: 'temporal',
        name: 'response_latency_mean_abs_diff_ms',
        value: { kind: 'numeric', value: meanDiff },
      },
    ];

    if (corr !== null) {
      features.push({
        category: 'temporal',
        name: 'response_latency_pearson_r',
        value: { kind: 'numeric', value: corr },
      });
    }

    return features;
  }
}

function parseTimelineBytes(bytes: Uint8Array): unknown[] {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      if (Array.isArray(obj.tweets)) return obj.tweets;
    }
  } catch {
    return [];
  }
  return [];
}

function computeLatenciesForAccount(
  tweets: unknown[],
  triggers: TriggeringEvent[]
): TriggerResponseRecord[] {
  const records: TriggerResponseRecord[] = [];

  for (const trigger of triggers) {
    const triggerMs = Date.parse(trigger.timestamp);
    if (!Number.isFinite(triggerMs)) continue;

    let best: TriggerResponseRecord | null = null;

    for (const tweet of tweets) {
      if (!isApifyTweetLike(tweet) && typeof tweet !== 'object') continue;
      const obj = tweet as Record<string, unknown>;
      const rawTs = (obj.createdAt ?? obj.created_at ?? obj.Posted_Time) as
        | string
        | number
        | undefined;
      const ts = rawTs != null ? parseTimestamp(rawTs) : null;
      if (ts === null || ts <= triggerMs) continue;

      if (!tweetMatchesTrigger(obj, trigger)) continue;

      const latency = ts - triggerMs;
      const actionType = detectActionType(obj);
      const candidate: TriggerResponseRecord = {
        event_id: trigger.id,
        latency_ms: latency,
        action_type: actionType,
        action_timestamp: new Date(ts).toISOString(),
      };

      if (!best || candidate.latency_ms < best.latency_ms) {
        best = candidate;
      }
    }

    if (best) records.push(best);
  }

  records.sort((a, b) => a.event_id.localeCompare(b.event_id));
  return records;
}

function tweetMatchesTrigger(tweet: Record<string, unknown>, trigger: TriggeringEvent): boolean {
  const text = tweetText(tweet as never).toLowerCase();
  const match = trigger.match;
  if (!match) return true;

  if (match.urls?.length) {
    const hay = text + ' ' + JSON.stringify(tweet).toLowerCase();
    if (!match.urls.some(u => hay.includes(u.toLowerCase()))) return false;
  }
  if (match.hashtags?.length) {
    if (!match.hashtags.some(h => text.includes(`#${h.toLowerCase().replace(/^#/, '')}`))) {
      return false;
    }
  }
  if (match.mentions?.length) {
    if (!match.mentions.some(m => text.includes(`@${m.toLowerCase().replace(/^@/, '')}`))) {
      return false;
    }
  }
  if (match.text_contains?.length) {
    if (!match.text_contains.some(t => text.includes(t.toLowerCase()))) return false;
  }
  return true;
}

function detectActionType(tweet: Record<string, unknown>): TriggerResponseRecord['action_type'] {
  if (tweet.isReply === true || tweet.in_reply_to_status_id) return 'reply';
  if (tweet.isRetweet === true || tweet.retweeted_status || tweet.retweetedTweet) return 'repost';
  if (tweet.isQuote === true || tweet.quoted_status_id) return 'quote';
  return 'post';
}

function parseLatencies(
  value: import('../../schema/db-types').FeatureValue | undefined
): Map<string, number> {
  const out = new Map<string, number>();
  if (!value || value.kind !== 'json' || !Array.isArray(value.value)) return out;
  for (const item of value.value) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const id = obj.event_id;
    const ms = obj.latency_ms;
    if (typeof id === 'string' && typeof ms === 'number' && Number.isFinite(ms)) {
      out.set(id, ms);
    }
  }
  return out;
}

function pearson(a: number[], b: number[]): number | null {
  if (a.length < 2 || a.length !== b.length) return null;
  const n = a.length;
  const meanA = a.reduce((s, x) => s + x, 0) / n;
  const meanB = b.reduce((s, x) => s + x, 0) / n;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  if (den === 0) return null;
  return num / den;
}

function inferPlatform(entry: { collectionMethod: { tool: string }; source: string }): string {
  const tool = entry.collectionMethod.tool.toLowerCase();
  if (tool.includes('twitter') || tool.includes('x-com')) return 'twitter';
  if (entry.source.includes('twitter.com') || entry.source.includes('x.com')) return 'twitter';
  return 'unknown';
}
