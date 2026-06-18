/**
 * Distinctive terms and rare phrase n-grams from timeline corpora (§4.3.2–3).
 *
 * Account extractor emits term/ngram vocabularies; pair extractors
 * compute overlap metrics.
 */

import type {
  AccountFeatureExtractor,
  ExtractorInput,
  ExtractedFeature,
} from '../types';
import type { ManifestEntry } from '../../archive/types';
import { tokenize } from './text-helpers';
import { tweetText } from '../../ingest/apify-tweet-fields';

const NAME = 'topic_phrase_twitter';
const VERSION = '1.0.0';

const TOP_TERMS = 50;
const TOP_NGRAMS = 100;
const MIN_NGRAM = 3;
const MAX_NGRAM = 5;
const MIN_NGRAM_FREQ = 2;

interface TermScore {
  term: string;
  score: number;
}

export class TwitterTopicPhraseExtractor implements AccountFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;

  filterEntry(entry: ManifestEntry): boolean {
    const tool = entry.collectionMethod.tool.toLowerCase();
    return (
      tool.includes('timeline') ||
      tool.includes('apify-twitter-timeline') ||
      tool.includes('tweets')
    );
  }

  extract(input: ExtractorInput): ExtractedFeature[] {
    const tweets = parseTimeline(input.bytes);
    if (tweets.length === 0) return [];

    const docs = tweets
      .map(t => tokenize(tweetText(t as Parameters<typeof tweetText>[0])).join(' '))
      .filter(Boolean);
    const distinctive = computeDistinctiveTerms(docs, TOP_TERMS);
    const ngrams = computeRareNgrams(docs, TOP_NGRAMS);

    const confidence =
      tweets.length < 10 ? 'marginal' as const : distinctive.length < 5 ? 'marginal' as const : 'sufficient' as const;

    return [
      {
        category: 'stylometric',
        name: 'distinctive_terms_top50',
        value: { kind: 'json', value: distinctive },
        confidence,
      },
      {
        category: 'stylometric',
        name: 'rare_phrase_ngrams_top100',
        value: { kind: 'json', value: ngrams },
        confidence,
      },
      {
        category: 'stylometric',
        name: 'topic_phrase_post_count',
        value: { kind: 'numeric', value: tweets.length },
      },
    ];
  }
}

function parseTimeline(bytes: Uint8Array): unknown[] {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      if (Array.isArray(obj.tweets)) return obj.tweets;
      if (Array.isArray(obj.items)) return obj.items;
    }
  } catch {
    return [];
  }
  return [];
}

function computeDistinctiveTerms(docs: string[], topN: number): TermScore[] {
  const N = docs.length;
  if (N === 0) return [];

  const df = new Map<string, number>();
  const tfTotal = new Map<string, number>();

  for (const doc of docs) {
    const tokens = tokenize(doc);
    const seen = new Set<string>();
    for (const t of tokens) {
      if (t.length < 3) continue;
      tfTotal.set(t, (tfTotal.get(t) ?? 0) + 1);
      if (!seen.has(t)) {
        seen.add(t);
        df.set(t, (df.get(t) ?? 0) + 1);
      }
    }
  }

  const scores: TermScore[] = [];
  for (const [term, tf] of tfTotal) {
    const docFreq = df.get(term) ?? 1;
    const idf = Math.log((N + 1) / (docFreq + 1)) + 1;
    scores.push({ term, score: tf * idf });
  }

  scores.sort((a, b) => b.score - a.score || a.term.localeCompare(b.term));
  return scores.slice(0, topN);
}

function computeRareNgrams(docs: string[], topN: number): string[] {
  const counts = new Map<string, number>();

  for (const doc of docs) {
    const tokens = tokenize(doc);
    for (let n = MIN_NGRAM; n <= MAX_NGRAM; n++) {
      for (let i = 0; i + n <= tokens.length; i++) {
        const slice = tokens.slice(i, i + n);
        if (slice.some(t => t.length < 2)) continue;
        const phrase = slice.join(' ');
        counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
      }
    }
  }

  const candidates = [...counts.entries()]
    .filter(([, c]) => c >= MIN_NGRAM_FREQ)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topN)
    .map(([phrase]) => phrase);

  return candidates;
}

// Re-export for tests
export { computeDistinctiveTerms, computeRareNgrams };
