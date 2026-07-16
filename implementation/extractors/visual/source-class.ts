/**
 * Image source_class helpers (§4.5.4).
 *
 * Reverse image search is non-deterministic, so the practitioner (or
 * collection tooling) records a source class on the manifest entry's
 * platformMetadata. Extractors only read and emit that label.
 *
 * Paper classes: stock | celebrity | scraped | AI-generated | original
 */

import type { ManifestEntry } from '../../archive/types';

/** Canonical §4.5.4 source classes (paper wording). */
export const IMAGE_SOURCE_CLASSES = [
  'stock',
  'celebrity',
  'scraped',
  'AI-generated',
  'original',
] as const;

export type ImageSourceClass = (typeof IMAGE_SOURCE_CLASSES)[number];

const ALIASES: Record<string, ImageSourceClass> = {
  stock: 'stock',
  celebrity: 'celebrity',
  scraped: 'scraped',
  'ai-generated': 'AI-generated',
  aigenerated: 'AI-generated',
  ai_generated: 'AI-generated',
  'ai generated': 'AI-generated',
  original: 'original',
  // Issue #148 informal synonyms → nearest paper class
  screenshot: 'scraped',
  photo: 'original',
  meme: 'scraped',
  'meme template': 'scraped',
  meme_template: 'scraped',
};

/**
 * Normalize a raw label to a paper source class, or null if unknown.
 */
export function normalizeSourceClass(raw: unknown): ImageSourceClass | null {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!key) return null;
  return ALIASES[key] ?? ALIASES[key.replace(/_/g, '-')] ?? null;
}

/**
 * Read source_class from a manifest entry's platformMetadata.
 * Accepts `source_class` or `sourceClass`.
 */
export function readManifestSourceClass(
  entry: ManifestEntry
): ImageSourceClass | null {
  const pm = entry.platformMetadata;
  if (!pm || typeof pm !== 'object') return null;
  const obj = pm as Record<string, unknown>;
  return normalizeSourceClass(obj.source_class ?? obj.sourceClass);
}

/**
 * Attach a validated source_class onto platformMetadata (collection layer).
 * Returns a shallow-copied entry; does not mutate the input.
 */
export function withManifestSourceClass(
  entry: ManifestEntry,
  sourceClass: string
): ManifestEntry {
  const normalized = normalizeSourceClass(sourceClass);
  if (!normalized) {
    throw new Error(
      `invalid image source_class "${sourceClass}"; expected one of: ${IMAGE_SOURCE_CLASSES.join(', ')}`
    );
  }
  return {
    ...entry,
    platformMetadata: {
      ...(entry.platformMetadata ?? {}),
      source_class: normalized,
    },
  };
}
