/**
 * Per-account term and n-gram term-frequency maps for background TF-IDF
 * (§4.3.2–3). Companion to BackgroundCorpusExtractor + novelty pair extractor.
 */

import type {
  AccountFeatureExtractor,
  ExtractorInput,
  ExtractedFeature,
} from '../types';
import type { ManifestEntry } from '../../archive/types';
import { sourceMatchesHost } from '../platform';
import { tweetText, type ApifyTweetLike } from '../../ingest/apify-tweet-fields';
import { tokenize } from './text-helpers';

const NAME = 'account_term_tf_twitter';
const VERSION = '1.0.0';

const MIN_NGRAM = 3;
const MAX_NGRAM = 7;
const MAX_TERM_KEYS = 5000;
const MAX_NGRAM_KEYS = 5000;

export class TwitterAccountTermTfExtractor implements AccountFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;

  filterEntry(entry: ManifestEntry): boolean {
    const tool = entry.collectionMethod.tool.toLowerCase();
    const source = entry.source.toLowerCase();
    if (
      tool.includes('timeline') ||
      tool.includes('tweets') ||
      tool.includes('posts')
    ) {
      return true;
    }
    if (
      source.includes('/timeline') ||
      source.includes('/tweets') ||
      source.includes('/user_timeline')
    ) {
      return true;
    }
    if (tool.includes('twitter') || tool.includes('x-com')) return true;
    if (sourceMatchesHost(source, 'twitter.com', 'x.com')) return true;
    return false;
  }

  extract(input: ExtractorInput): ExtractedFeature[] {
    const posts = tryParseTimeline(input.bytes);
    if (!posts || posts.length === 0) return [];

    const termTf = new Map<string, number>();
    const ngramTf = new Map<string, number>();
    let docs = 0;

    for (const post of posts) {
      if (!post || typeof post !== 'object') continue;
      const text = tweetText(post as ApifyTweetLike).trim();
      if (text.length === 0) continue;
      docs++;
      const tokens = tokenize(text).filter((t) => t.length >= 2);
      for (const t of tokens) {
        if (t.length < 3) continue;
        termTf.set(t, (termTf.get(t) ?? 0) + 1);
      }
      for (let n = MIN_NGRAM; n <= MAX_NGRAM; n++) {
        for (let i = 0; i + n <= tokens.length; i++) {
          const slice = tokens.slice(i, i + n);
          if (slice.some((t) => t.length < 2)) continue;
          const phrase = slice.join(' ');
          ngramTf.set(phrase, (ngramTf.get(phrase) ?? 0) + 1);
        }
      }
    }

    if (docs === 0) return [];

    const termObj = topTfObject(termTf, MAX_TERM_KEYS);
    const ngramObj = topTfObject(ngramTf, MAX_NGRAM_KEYS);
    if (Object.keys(termObj).length === 0 && Object.keys(ngramObj).length === 0) {
      return [];
    }

    const confidence =
      docs < 5 ? ('marginal' as const) : ('sufficient' as const);
    const cat = 'stylometric' as const;
    const features: ExtractedFeature[] = [
      {
        category: cat,
        name: 'account_term_tf_post_count',
        value: { kind: 'numeric', value: docs },
        confidence,
      },
    ];
    if (Object.keys(termObj).length > 0) {
      features.push({
        category: cat,
        name: 'account_term_tf',
        value: { kind: 'json', value: termObj },
        confidence,
      });
    }
    if (Object.keys(ngramObj).length > 0) {
      features.push({
        category: cat,
        name: 'account_ngram_tf',
        value: { kind: 'json', value: ngramObj },
        confidence,
      });
    }
    return features;
  }
}

function topTfObject(tf: Map<string, number>, maxKeys: number): Record<string, number> {
  const entries = [...tf.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );
  const out: Record<string, number> = {};
  for (const [k, v] of entries.slice(0, maxKeys)) out[k] = v;
  return out;
}

function tryParseTimeline(bytes: Uint8Array): unknown[] | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      if (Array.isArray(obj.tweets)) return obj.tweets;
      if (Array.isArray(obj.items)) return obj.items;
    }
  } catch {
    return null;
  }
  return null;
}
