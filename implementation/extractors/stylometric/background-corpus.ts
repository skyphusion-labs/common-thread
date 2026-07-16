/**
 * Background corpus account extractor (§4.3.2–3).
 *
 * Reads a practitioner-supplied background / control corpus artifact
 * (`application/x-background-corpus`) and emits document-frequency maps
 * used to weight seed-account TF-IDF and novelty n-grams.
 *
 * Artifact JSON shapes accepted:
 *   - `{ "documents": ["text", ...] }`
 *   - `{ "texts": ["text", ...] }`
 *   - `["text", ...]`
 *
 * See docs/BACKGROUND-CORPUS.md for the ingest / upload path.
 */

import type {
  AccountFeatureExtractor,
  ExtractorInput,
  ExtractedFeature,
} from '../types';
import type { ManifestEntry } from '../../archive/types';
import { tokenize } from './text-helpers';

const NAME = 'background_corpus_stylometric';
const VERSION = '1.0.0';

export const BACKGROUND_CORPUS_MIME = 'application/x-background-corpus';

const MIN_NGRAM = 3;
const MAX_NGRAM = 7;
/** Cap DF map sizes so account_features JSON stays bounded. */
const MAX_TERM_KEYS = 20000;
const MAX_NGRAM_KEYS = 20000;

export class BackgroundCorpusExtractor implements AccountFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;

  filterEntry(entry: ManifestEntry): boolean {
    const mime = (entry.mimeType ?? '').toLowerCase();
    if (mime === BACKGROUND_CORPUS_MIME) return true;
    const tool = entry.collectionMethod.tool.toLowerCase();
    return (
      tool.includes('background-corpus') ||
      tool.includes('background_corpus') ||
      tool === 'control-corpus'
    );
  }

  extract(input: ExtractorInput): ExtractedFeature[] {
    const docs = parseBackgroundDocuments(input.bytes);
    if (docs.length === 0) return [];

    const termDf = new Map<string, number>();
    const ngramDf = new Map<string, number>();

    for (const doc of docs) {
      const tokens = tokenize(doc).filter((t) => t.length >= 3);
      const seenTerms = new Set<string>();
      for (const t of tokens) {
        if (!seenTerms.has(t)) {
          seenTerms.add(t);
          termDf.set(t, (termDf.get(t) ?? 0) + 1);
        }
      }
      const seenNgrams = new Set<string>();
      for (let n = MIN_NGRAM; n <= MAX_NGRAM; n++) {
        for (let i = 0; i + n <= tokens.length; i++) {
          const slice = tokens.slice(i, i + n);
          if (slice.some((t) => t.length < 2)) continue;
          const phrase = slice.join(' ');
          if (!seenNgrams.has(phrase)) {
            seenNgrams.add(phrase);
            ngramDf.set(phrase, (ngramDf.get(phrase) ?? 0) + 1);
          }
        }
      }
    }

    const termDfObj = topDfObject(termDf, MAX_TERM_KEYS);
    const ngramDfObj = topDfObject(ngramDf, MAX_NGRAM_KEYS);
    const confidence =
      docs.length < 20 ? ('marginal' as const) : ('sufficient' as const);
    const cat = 'stylometric' as const;

    return [
      {
        category: cat,
        name: 'background_doc_count',
        value: { kind: 'numeric', value: docs.length },
        confidence,
      },
      {
        category: cat,
        name: 'background_term_df',
        value: { kind: 'json', value: termDfObj },
        confidence,
      },
      {
        category: cat,
        name: 'background_ngram_df',
        value: { kind: 'json', value: ngramDfObj },
        confidence,
      },
      {
        category: cat,
        name: 'background_term_type_count',
        value: { kind: 'numeric', value: Object.keys(termDfObj).length },
      },
      {
        category: cat,
        name: 'background_ngram_type_count',
        value: { kind: 'numeric', value: Object.keys(ngramDfObj).length },
      },
    ];
  }
}

export function parseBackgroundDocuments(bytes: Uint8Array): string[] {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
    }
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      for (const key of ['documents', 'texts', 'docs']) {
        if (Array.isArray(obj[key])) {
          return (obj[key] as unknown[]).filter(
            (x): x is string => typeof x === 'string' && x.trim().length > 0
          );
        }
      }
    }
  } catch {
    return [];
  }
  return [];
}

function topDfObject(df: Map<string, number>, maxKeys: number): Record<string, number> {
  const entries = [...df.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );
  const out: Record<string, number> = {};
  for (const [k, v] of entries.slice(0, maxKeys)) out[k] = v;
  return out;
}
