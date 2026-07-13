/**
 * Color-palette corpus building for Apify Twitter ingest (§4.5.6).
 */

import { ArchiveStore } from '../archive/store';
import { manifestStoreFor, type ArchiveManifestBinding } from './manifest-env';

export const APIFY_TWITTER_COLOR_PALETTE_CORPUS_TOOL = 'apify-twitter-color-palette-corpus';
export const COLOR_PALETTE_CORPUS_MIME = 'application/x-color-palette-corpus';

export interface AccountColorPaletteCorpus {
  account: string;
  imageCount: number;
  totalPixels: number;
  histogram: Record<string, number>;
  imageType?: 'posted' | 'profile' | 'banner';
}

export interface ArchiveColorPaletteCorporaResult {
  manifestHashes: string[];
  artifactsCreated: number;
}

export async function archiveColorPaletteCorpora(
  env: ArchiveManifestBinding,
  options: {
    investigationId: string;
    corpora: AccountColorPaletteCorpus[];
    collectedAt: string;
    toolVersion?: string;
  }
): Promise<ArchiveColorPaletteCorporaResult> {
  const archive = new ArchiveStore({ bucket: env.ARCHIVE });
  const manifest = manifestStoreFor(env, options.investigationId);
  const toolVersion = options.toolVersion ?? '1';
  const manifestHashes: string[] = [];

  for (const corpus of options.corpora) {
    const imageType = corpus.imageType ?? 'posted';
    const body = {
      imageCount: corpus.imageCount,
      totalPixels: corpus.totalPixels,
      histogram: corpus.histogram,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(body));
    const { hash } = await archive.put(bytes, {
      mimeType: COLOR_PALETTE_CORPUS_MIME,
      extension: 'json',
    });

    await manifest.append({
      hash,
      account: corpus.account,
      source: `https://x.com/${corpus.account}/media`,
      collectedAt: options.collectedAt,
      investigationId: options.investigationId,
      collectionMethod: {
        tool: APIFY_TWITTER_COLOR_PALETTE_CORPUS_TOOL,
        version: toolVersion,
        platform: 'twitter',
        config: { image_count: corpus.imageCount },
      },
      mimeType: COLOR_PALETTE_CORPUS_MIME,
      platformMetadata: { imageType },
      status: 'present',
    } as never);

    manifestHashes.push(hash);
  }

  return {
    manifestHashes,
    artifactsCreated: manifestHashes.length,
  };
}

function histogramToRecord(hist: Map<number, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const bin of [...hist.keys()].sort((a, b) => a - b)) {
    out[String(bin)] = hist.get(bin)!;
  }
  return out;
}

export function buildColorPaletteCorpusFromHistogram(
  account: string,
  imageCount: number,
  hist: Map<number, number>,
  imageType: 'posted' | 'profile' | 'banner' = 'posted'
): AccountColorPaletteCorpus {
  let totalPixels = 0;
  for (const count of hist.values()) totalPixels += count;
  return {
    account,
    imageCount,
    totalPixels,
    histogram: histogramToRecord(hist),
    imageType,
  };
}
