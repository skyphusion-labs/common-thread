/**
 * Image source_class pair overlap (§4.5.4).
 *
 * Compares practitioner-recorded source classes on profile/banner
 * images. Matching non-original classes (stock, celebrity, scraped,
 * AI-generated) is a stronger sockpuppet hint than matching "original".
 */

import type {
  PairFeatureExtractor,
  AccountFeatureMap,
  PairContext,
} from '../pair-types';
import type { ExtractedFeature } from '../types';

const NAME = 'image_source_class_overlap_visual';
const VERSION = '1.0.0';

const SURFACES = ['profile', 'banner'] as const;

export class ImageSourceClassOverlapExtractor implements PairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'visual' as const;
  /** Optional labels: runner always invokes; emit only when both sides labeled. */
  readonly requiredAccountFeatures = [] as const;

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    _context?: PairContext
  ): ExtractedFeature[] {
    const out: ExtractedFeature[] = [];
    const cat = 'visual' as const;

    for (const surface of SURFACES) {
      const a = readText(featuresA, `${surface}_image_source_class`);
      const b = readText(featuresB, `${surface}_image_source_class`);
      if (!a || !b) continue;

      const match = a === b ? 1 : 0;
      out.push({
        category: cat,
        name: `${surface}_image_source_class_match`,
        value: { kind: 'numeric', value: match },
      });
      out.push({
        category: cat,
        name: `${surface}_image_source_class_a`,
        value: { kind: 'text', value: a },
      });
      out.push({
        category: cat,
        name: `${surface}_image_source_class_b`,
        value: { kind: 'text', value: b },
      });
    }

    return out;
  }
}

function readText(features: AccountFeatureMap, name: string): string | null {
  const v = features.get(name);
  if (!v || v.kind !== 'text') return null;
  const s = typeof v.value === 'string' ? v.value.trim() : '';
  return s.length > 0 ? s : null;
}
