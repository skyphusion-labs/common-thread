/**
 * Code-switching and register-pattern account extractor (§4.3.4).
 *
 * Per-post register (formal / neutral / informal) and intra-post
 * code-switch classification, then account-level distributions and
 * switch rates. Platform language codes (when present) drive the
 * inter-post language switch rate.
 *
 * Auxiliary tooling: rule-based classifiers in register-classify.ts
 * (extractor version records the tooling configuration).
 */

import type {
  AccountFeatureExtractor,
  ExtractorInput,
  ExtractedFeature,
} from '../types';
import type { ManifestEntry } from '../../archive/types';
import { sourceMatchesHost } from '../platform';
import {
  tweetLanguage,
  tweetText,
  type ApifyTweetLike,
} from '../../ingest/apify-tweet-fields';
import {
  classifyRegister,
  classifyIntraPostCodeSwitch,
  registerSwitchRate,
  languageSwitchRate,
  type RegisterLabel,
} from './register-classify';

const NAME = 'code_switching_twitter';
const VERSION = '1.0.0';

export class TwitterCodeSwitchingExtractor implements AccountFeatureExtractor {
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

    const registerDist: Record<RegisterLabel, number> = {
      formal: 0,
      neutral: 0,
      informal: 0,
    };
    const patternDist: Record<string, number> = {};
    const labels: RegisterLabel[] = [];
    const langs: Array<string | null> = [];
    let codeSwitchPosts = 0;
    let classified = 0;

    for (const post of posts) {
      if (!post || typeof post !== 'object') continue;
      const tweet = post as ApifyTweetLike;
      const text = tweetText(tweet).trim();
      if (text.length === 0) continue;

      classified++;
      const register = classifyRegister(text);
      registerDist[register]++;
      labels.push(register);

      langs.push(tweetLanguage(tweet));

      const intra = classifyIntraPostCodeSwitch(text);
      if (intra.switched) {
        codeSwitchPosts++;
        if (intra.patternKey) {
          patternDist[intra.patternKey] = (patternDist[intra.patternKey] ?? 0) + 1;
        }
      }
    }

    if (classified === 0) return [];

    const confidence =
      classified < 5 ? ('marginal' as const) : ('sufficient' as const);
    const cat = 'stylometric' as const;

    const features: ExtractedFeature[] = [
      {
        category: cat,
        name: 'register_distribution',
        value: { kind: 'json', value: registerDist },
        confidence,
      },
      {
        category: cat,
        name: 'register_switch_rate',
        value: { kind: 'numeric', value: registerSwitchRate(labels) },
        confidence,
      },
      {
        category: cat,
        name: 'code_switch_post_rate',
        value: {
          kind: 'numeric',
          value: codeSwitchPosts / classified,
        },
        confidence,
      },
      {
        category: cat,
        name: 'inter_post_language_switch_rate',
        value: { kind: 'numeric', value: languageSwitchRate(langs) },
        confidence,
      },
      {
        category: cat,
        name: 'code_switch_post_count',
        value: { kind: 'numeric', value: codeSwitchPosts },
      },
      {
        category: cat,
        name: 'code_switch_classified_post_count',
        value: { kind: 'numeric', value: classified },
      },
    ];

    if (Object.keys(patternDist).length > 0) {
      features.push({
        category: cat,
        name: 'code_switch_pattern_distribution',
        value: { kind: 'json', value: patternDist },
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
