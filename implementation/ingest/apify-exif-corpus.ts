/**
 * EXIF corpus building and archiving for Apify Twitter ingest (§4.7.1).
 */

import { ArchiveStore } from '../archive/store';
import { ManifestStore } from '../archive/manifest';
import type { ParsedExif } from '../extractors/visual/exif-parser';

export const APIFY_TWITTER_EXIF_CORPUS_TOOL = 'apify-twitter-exif-corpus';
export const EXIF_CORPUS_MIME = 'application/x-exif-corpus';

export interface ExifCorpusImageEntry {
  url: string;
  tweet_id?: string;
  exif: ParsedExif | null;
}

export interface AccountExifCorpus {
  account: string;
  images: ExifCorpusImageEntry[];
}

export interface ArchiveExifCorporaResult {
  manifestHashes: string[];
  artifactsCreated: number;
}

export async function archiveExifCorpora(
  env: { ARCHIVE: R2Bucket; MANIFEST_COORDINATOR?: DurableObjectNamespace },
  options: {
    investigationId: string;
    corpora: AccountExifCorpus[];
    collectedAt: string;
    toolVersion?: string;
  }
): Promise<ArchiveExifCorporaResult> {
  const archive = new ArchiveStore({ bucket: env.ARCHIVE });
  const manifest = new ManifestStore({
    bucket: env.ARCHIVE,
    investigationId: options.investigationId,
    coordinator: env.MANIFEST_COORDINATOR,
  });
  const toolVersion = options.toolVersion ?? '1';
  const manifestHashes: string[] = [];

  for (const { account, images } of options.corpora) {
    if (images.length === 0) continue;

    const body = { images };
    const bytes = new TextEncoder().encode(JSON.stringify(body));
    const { hash } = await archive.put(bytes, {
      mimeType: EXIF_CORPUS_MIME,
      extension: 'json',
    });

    await manifest.append({
      hash,
      account,
      source: `https://x.com/${account}/media`,
      collectedAt: options.collectedAt,
      investigationId: options.investigationId,
      collectionMethod: {
        tool: APIFY_TWITTER_EXIF_CORPUS_TOOL,
        version: toolVersion,
        platform: 'twitter',
        config: { image_count: images.length },
      },
      mimeType: EXIF_CORPUS_MIME,
      status: 'present',
    } as never);

    manifestHashes.push(hash);
  }

  return {
    manifestHashes,
    artifactsCreated: manifestHashes.length,
  };
}
