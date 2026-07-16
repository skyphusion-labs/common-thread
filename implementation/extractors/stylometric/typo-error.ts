/**
 * Typo-and-error-pattern account extractor (§4.3.5).
 *
 * Emits hard-error category distributions, per-token error rate, and
 * confusion-form fingerprints from Twitter timeline text.
 *
 * False-positive / false-negative modes: see typo-patterns.ts header
 * (shared autocorrect, L1 transfer; editorial cleanup / AI assistants).
 */

import type {
  AccountFeatureExtractor,
  ExtractorInput,
  ExtractedFeature,
} from '../types';
import type { ManifestEntry } from '../../archive/types';
import { sourceMatchesHost } from '../platform';
import { tweetText, type ApifyTweetLike } from '../../ingest/apify-tweet-fields';
import {
  scanTypos,
  sparsePositiveCounts,
  totalHardErrors,
  type HardErrorCategory,
  HARD_ERROR_CATEGORIES,
} from './typo-patterns';

const NAME = 'typo_error_twitter';
const VERSION = '1.0.0';

export class TwitterTypoErrorExtractor implements AccountFeatureExtractor {
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

    const hardTotals = Object.fromEntries(
      HARD_ERROR_CATEGORIES.map((c) => [c, 0])
    ) as Record<HardErrorCategory, number>;
    const confusionTotals: Record<string, number> = {};
    let tokenCount = 0;
    let postCount = 0;

    for (const post of posts) {
      if (!post || typeof post !== 'object') continue;
      const text = tweetText(post as ApifyTweetLike).trim();
      if (text.length === 0) continue;
      postCount++;
      const scan = scanTypos(text);
      tokenCount += scan.tokenCount;
      for (const c of HARD_ERROR_CATEGORIES) {
        hardTotals[c] += scan.hardErrors[c];
      }
      for (const [k, v] of Object.entries(scan.confusionForms)) {
        confusionTotals[k] = (confusionTotals[k] ?? 0) + v;
      }
    }

    if (postCount === 0 || tokenCount === 0) return [];

    const hardHits = totalHardErrors(hardTotals);
    const hardSparse = sparsePositiveCounts(hardTotals);
    const confusionSparse = sparsePositiveCounts(confusionTotals);
    const confidence =
      postCount < 5 || tokenCount < 40
        ? ('marginal' as const)
        : ('sufficient' as const);
    const cat = 'stylometric' as const;

    const features: ExtractedFeature[] = [
      {
        category: cat,
        name: 'typo_error_rate',
        value: { kind: 'numeric', value: hardHits / tokenCount },
        confidence,
      },
      {
        category: cat,
        name: 'typo_error_count',
        value: { kind: 'numeric', value: hardHits },
      },
      {
        category: cat,
        name: 'typo_token_count',
        value: { kind: 'numeric', value: tokenCount },
      },
    ];

    if (Object.keys(hardSparse).length > 0) {
      features.push({
        category: cat,
        name: 'typo_error_distribution',
        value: { kind: 'json', value: hardSparse },
        confidence,
      });
    }

    if (Object.keys(confusionSparse).length > 0) {
      features.push({
        category: cat,
        name: 'confusion_form_distribution',
        value: { kind: 'json', value: confusionSparse },
        confidence,
      });
    }

    return features;
  }
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
