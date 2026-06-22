import { describe, expect, it } from 'vitest';
import type { ManifestEntry } from '../../implementation/archive/types';
import { parseInstagramProfileObject } from '../../implementation/ingest/instagram-profile-fields';
import { InstagramAccountMetadataExtractor } from '../../implementation/extractors/account-metadata/instagram';
import instagramProfiles from '../fixtures/instagram-profiles.json';

function stubEntry(account: string): ManifestEntry {
  return {
    hash: '0'.repeat(64),
    source: `https://www.instagram.com/${account}/`,
    collectedAt: '2026-06-22T01:12:46.453Z',
    collectionMethod: { tool: 'instagram-profile-scraper', version: '1.0.0' },
    investigationId: 'instagram-profile-validation',
    account,
    status: 'present',
  };
}

describe('instagram profile scrape', () => {
  it('selects the matching profile from a multi-profile array', () => {
    const annie = parseInstagramProfileObject(instagramProfiles, 'annie.woodman');
    expect(annie?.username).toBe('annie.woodman');
    expect(annie?.followersCount).toBe(48);
  });

  it('account metadata extractor emits Twitter-parallel feature names', () => {
    const row = (instagramProfiles as Array<{ username: string }>).find(
      p => p.username === 'brandiprant'
    );
    const bytes = new TextEncoder().encode(JSON.stringify(row));
    const features = new InstagramAccountMetadataExtractor().extract({
      bytes,
      entry: stubEntry('brandiprant'),
    });

    expect(features.find(f => f.name === 'display_name')?.value).toEqual({
      kind: 'text',
      value: 'Brandi Prant',
    });
    expect(features.find(f => f.name === 'username')?.value).toEqual({
      kind: 'text',
      value: 'brandiprant',
    });
    expect(features.find(f => f.name === 'follower_count')?.value).toEqual({
      kind: 'numeric',
      value: 28,
    });
    expect(features.find(f => f.name === 'following_count')?.value).toEqual({
      kind: 'numeric',
      value: 3,
    });
    expect(features.find(f => f.name === 'posts_count')?.value).toEqual({
      kind: 'numeric',
      value: 1,
    });
    expect(features.find(f => f.name === 'verified')?.value).toEqual({
      kind: 'numeric',
      value: 0,
    });
    expect(features.find(f => f.name === 'blue_verified')?.value).toEqual({
      kind: 'numeric',
      value: 0,
    });
    expect(features.find(f => f.name === 'protected')?.value).toEqual({
      kind: 'numeric',
      value: 0,
    });
    expect(features.find(f => f.name === 'profile_image_url')?.value.kind).toBe('text');
  });
});
