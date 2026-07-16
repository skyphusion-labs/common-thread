/**
 * Posted-image corpus account extractor.
 *
 * Consumes a per-account image-hash corpus artifact and emits the
 * aggregated posted-image dHash set as an account-level feature.
 *
 * Background: each posted image is its own artifact, but the
 * account_features schema deduplicates rows by (account_identifier,
 * feature_name) with most-recent-wins semantics. Emitting features
 * per-image would mean each new image artifact overwrites the
 * previous one's features. To work around this, the collection layer
 * is expected to produce a SINGLE derived artifact per account that
 * aggregates the dHashes (and optional image metadata) of all that
 * account's posted images.
 *
 * Collection-layer contract: the derived artifact has
 *   mimeType = 'application/x-image-hash-corpus'
 *   platformMetadata.imageType = 'posted' (or 'profile' / 'banner';
 *     this extractor handles all three but the §4.5.3 pair extractor
 *     uses the 'posted' set specifically)
 *
 * Corpus body shape (JSON):
 *   {
 *     "hashes": [
 *       {
 *         "dhash": "abcdef0123456789",   // 16-char hex, required
 *         "url": "https://...",          // original URL, optional
 *         "width": 1080, "height": 1080  // optional, for record-keeping
 *       },
 *       ...
 *     ]
 *   }
 *
 * The collection layer computes each dHash via the same dhash()
 * function this directory exports, ensuring extractor-collection
 * consistency. Computing at collection time is appropriate because
 * decoding images is an IO-and-decoder concern, not an extraction
 * concern, and dHash output is platform-agnostic.
 *
 * Features emitted (always emitted when the corpus artifact is found,
 * even when the corpus contains zero hashes; the empty case is
 * informative):
 *
 *   posted_image_dhash_set (json, sorted unique array of hex hashes;
 *     emitted as 'posted_image_dhash_set' when imageType is 'posted',
 *     'profile_image_dhash_set' when 'profile', etc.)
 *   posted_image_count (numeric, total count of hashes in the corpus
 *     before deduplication; the corpus may contain duplicates if the
 *     same image was reused across posts, which is itself a signal
 *     the account extractor preserves via the count)
 *   posted_image_unique_dhash_count (numeric, after deduplication)
 *
 * Determinism: same input bytes always produce the same output. The
 * dhash set is sorted lexicographically for deterministic JSON. No
 * randomness, no clock, no I/O. Satisfies §6.1.
 *
 * Edge cases:
 *   - Malformed corpus JSON: extractor returns empty (artifact treated
 *     as unparseable).
 *   - Corpus with zero entries: emits zero counts and empty array.
 *   - Hashes that aren't valid 16-char hex: dropped silently.
 *     Defensively allows the rest of the corpus to contribute.
 */

import type {
  AccountFeatureExtractor,
  ExtractorInput,
  ExtractedFeature,
} from '../types';
import type { ManifestEntry } from '../../archive/types';

const NAME = 'posted_image_corpus';
const VERSION = '1.1.0';

const CORPUS_MIME = 'application/x-image-hash-corpus';

type ImageType = 'profile' | 'banner' | 'posted';

interface CorpusEntry {
  dhash?: unknown;
  phash?: unknown;
  sha256?: unknown;
  url?: unknown;
  width?: unknown;
  height?: unknown;
}

interface CorpusBody {
  hashes?: CorpusEntry[];
}

export class PostedImageCorpusExtractor implements AccountFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;

  filterEntry(entry: ManifestEntry): boolean {
    const mime = (entry.mimeType ?? '').toLowerCase();
    return mime === CORPUS_MIME;
  }

  extract(input: ExtractorInput): ExtractedFeature[] {
    const imageType = detectImageType(input.entry);

    let parsed: unknown;
    try {
      const decoded = new TextDecoder().decode(input.bytes);
      parsed = JSON.parse(decoded);
    } catch {
      return [];
    }

    if (!parsed || typeof parsed !== 'object') {
      return [];
    }

    const body = parsed as CorpusBody;
    const rawHashes = Array.isArray(body.hashes) ? body.hashes : [];

    const allHashes: string[] = [];
    const allPhashes: string[] = [];
    const allUrls: string[] = [];
    for (const entry of rawHashes) {
      if (!entry || typeof entry !== 'object') continue;
      const raw = entry.dhash;
      if (typeof raw === 'string') {
        const normalized = raw.toLowerCase();
        if (/^[0-9a-f]{16}$/.test(normalized)) {
          allHashes.push(normalized);
        }
      }
      const rawP = entry.phash;
      if (typeof rawP === 'string') {
        const normalized = rawP.toLowerCase();
        if (/^[0-9a-f]{16}$/.test(normalized)) {
          allPhashes.push(normalized);
        }
      }
      const rawUrl = entry.url;
      if (typeof rawUrl === 'string' && rawUrl.length > 0) {
        allUrls.push(rawUrl);
      }
    }

    const uniqueSet = new Set(allHashes);
    const uniqueSorted = [...uniqueSet].sort();
    const uniquePhashSet = new Set(allPhashes);
    const uniquePhashSorted = [...uniquePhashSet].sort();
    const uniqueUrls = [...new Set(allUrls)].sort();

    const setName = `${imageType}_image_dhash_set`;
    const phashSetName = `${imageType}_image_phash_set`;
    const countName = `${imageType}_image_count`;
    const uniqueName = `${imageType}_image_unique_dhash_count`;
    const uniquePhashName = `${imageType}_image_unique_phash_count`;
    const urlSetName = `${imageType}_image_url_set`;
    const urlCountName = `${imageType}_image_url_count`;

    const features: ExtractedFeature[] = [
      {
        category: 'visual',
        name: setName,
        value: { kind: 'json', value: uniqueSorted },
      },
      {
        category: 'visual',
        name: phashSetName,
        value: { kind: 'json', value: uniquePhashSorted },
      },
      {
        category: 'visual',
        name: countName,
        value: {
          kind: 'numeric',
          value: Math.max(allHashes.length, allPhashes.length, allUrls.length),
        },
      },
      {
        category: 'visual',
        name: uniqueName,
        value: { kind: 'numeric', value: uniqueSet.size },
      },
      {
        category: 'visual',
        name: uniquePhashName,
        value: { kind: 'numeric', value: uniquePhashSet.size },
      },
      {
        category: 'visual',
        name: urlSetName,
        value: { kind: 'json', value: uniqueUrls },
      },
      {
        category: 'visual',
        name: urlCountName,
        value: { kind: 'numeric', value: uniqueUrls.length },
      },
    ];

    // Profile and banner corpora are single-image; emit scalar features
    // consumed by §4.5.1 / §4.5.2 pair overlap extractors.
    if (imageType === 'profile' || imageType === 'banner') {
      pushScalarImageFeatures(features, imageType, rawHashes);
    }

    return features;
  }
}

function pushScalarImageFeatures(
  features: ExtractedFeature[],
  imageType: 'profile' | 'banner',
  rawHashes: CorpusEntry[]
): void {
  const first = rawHashes.find((entry) => entry && typeof entry === 'object');
  if (!first) return;

  const sha = readCorpusScalar(first, 'sha256');
  if (sha) {
    features.push({
      category: 'visual',
      name: `${imageType}_image_sha256`,
      value: { kind: 'text', value: sha },
    });
  }

  const dhashHex = readCorpusScalar(first, 'dhash');
  if (dhashHex && /^[0-9a-f]{16}$/.test(dhashHex)) {
    features.push({
      category: 'visual',
      name: `${imageType}_image_dhash`,
      value: { kind: 'text', value: dhashHex },
    });
  }

  const phashHex = readCorpusScalar(first, 'phash');
  if (phashHex && /^[0-9a-f]{16}$/.test(phashHex)) {
    features.push({
      category: 'visual',
      name: `${imageType}_image_phash`,
      value: { kind: 'text', value: phashHex },
    });
  }
}

function readCorpusScalar(entry: CorpusEntry, key: 'dhash' | 'phash' | 'sha256'): string | null {
  const raw = entry[key];
  if (typeof raw !== 'string' || raw.length === 0) return null;
  return raw.toLowerCase();
}

// ---------------------------------------------------------------------------
// Image type dispatch
// ---------------------------------------------------------------------------

function detectImageType(entry: ManifestEntry): ImageType {
  const pm = entry.platformMetadata;
  if (pm && typeof pm === 'object') {
    const explicit = (pm as Record<string, unknown>).imageType;
    if (explicit === 'profile' || explicit === 'banner' || explicit === 'posted') {
      return explicit;
    }
  }

  const tool = entry.collectionMethod.tool.toLowerCase();
  if (tool.includes('posted_images') || tool.includes('post_image_corpus')) return 'posted';
  if (tool.includes('profile_image')) return 'profile';
  if (tool.includes('banner_image') || tool.includes('header_image')) return 'banner';

  return 'posted';
}
