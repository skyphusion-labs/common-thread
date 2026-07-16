import { describe, expect, it } from 'vitest';
import { PostedImageCorpusExtractor } from '../../implementation/extractors/visual/posted-image-corpus-extractor';
import { ProfileImageOverlapExtractor } from '../../implementation/extractors/visual/profile-image-overlap';
import { BannerImageOverlapExtractor } from '../../implementation/extractors/visual/banner-image-overlap';
import {
  buildBannerImageCorporaFromProfiles,
  buildProfileImageCorporaFromProfiles,
} from '../../implementation/ingest/apify-media-corpus';
import { TWITTER_PAIR_EXTRACTORS } from '../../implementation/ingest/twitter-extractors';

describe('profile and banner image corpus wiring (§4.5.1, §4.5.2)', () => {
  it('builds profile and banner corpora from Apify profile snapshots', () => {
    const profiles = [
      {
        account: 'alice',
        profile: {
          profile_image_url_https: 'https://pbs.twimg.com/profile_images/alice.jpg',
          profile_banner_url: 'https://pbs.twimg.com/profile_banners/alice.jpg',
        },
      },
      {
        account: 'bob',
        profile: {
          profilePicture: 'https://pbs.twimg.com/profile_images/bob.jpg',
          coverPicture: 'https://pbs.twimg.com/profile_banners/bob.jpg',
        },
      },
    ];

    const profileCorpora = buildProfileImageCorporaFromProfiles(profiles);
    const bannerCorpora = buildBannerImageCorporaFromProfiles(profiles);

    expect(profileCorpora).toHaveLength(2);
    expect(profileCorpora[0].imageType).toBe('profile');
    expect(bannerCorpora).toHaveLength(2);
    expect(bannerCorpora[0].imageType).toBe('banner');
  });

  it('emits scalar sha256/dhash/phash features from profile corpus artifacts', () => {
    const extractor = new PostedImageCorpusExtractor();
    const features = extractor.extract({
      bytes: new TextEncoder().encode(
        JSON.stringify({
          hashes: [
            {
              url: 'https://pbs.twimg.com/profile_images/shared.jpg',
              dhash: 'abcdef0123456789',
              phash: 'fedcba9876543210',
              sha256: 'a'.repeat(64),
            },
          ],
        })
      ),
      entry: {
        hash: 'b'.repeat(64),
        source: 'https://x.com/alice/photo',
        collectedAt: '2026-01-01T00:00:00.000Z',
        collectionMethod: { tool: 'apify-twitter-profile-image-corpus', version: '1' },
        investigationId: 'inv',
        account: 'alice',
        mimeType: 'application/x-image-hash-corpus',
        platformMetadata: { imageType: 'profile' },
        status: 'present',
      },
    });

    const byName = Object.fromEntries(features.map((f) => [f.name, f]));
    expect(byName.profile_image_sha256.value).toEqual({ kind: 'text', value: 'a'.repeat(64) });
    expect(byName.profile_image_dhash.value).toEqual({ kind: 'text', value: 'abcdef0123456789' });
    expect(byName.profile_image_phash.value).toEqual({ kind: 'text', value: 'fedcba9876543210' });
    expect(byName.profile_image_dhash_set).toBeDefined();
    expect(byName.profile_image_phash_set).toBeDefined();
  });

  it('runs profile overlap when corpus scalar features are present', () => {
    const sharedSha = 'c'.repeat(64);
    const sharedDhash = '1111222233334444';
    const sharedPhash = 'aaaabbbbccccdddd';
    const featuresA = new Map([
      ['profile_image_sha256', { kind: 'text' as const, value: sharedSha }],
      ['profile_image_dhash', { kind: 'text' as const, value: sharedDhash }],
      ['profile_image_phash', { kind: 'text' as const, value: sharedPhash }],
    ]);
    const featuresB = new Map([
      ['profile_image_sha256', { kind: 'text' as const, value: sharedSha }],
      ['profile_image_dhash', { kind: 'text' as const, value: sharedDhash }],
      ['profile_image_phash', { kind: 'text' as const, value: sharedPhash }],
    ]);

    const pairFeatures = new ProfileImageOverlapExtractor().extract(
      'alice',
      'bob',
      featuresA,
      featuresB
    );
    const byName = Object.fromEntries(pairFeatures.map((f) => [f.name, f]));

    expect(byName.profile_image_byte_equality.value).toEqual({ kind: 'numeric', value: 1 });
    expect(byName.profile_image_hamming_distance.value).toEqual({ kind: 'numeric', value: 0 });
    expect(byName.profile_image_match_band.value).toEqual({ kind: 'text', value: 'near_identical' });
    expect(byName.profile_image_phash_hamming_distance.value).toEqual({ kind: 'numeric', value: 0 });
    expect(byName.profile_image_phash_match_band.value).toEqual({
      kind: 'text',
      value: 'near_identical',
    });
  });

  it('runs banner overlap when corpus scalar features are present', () => {
    const sharedSha = 'd'.repeat(64);
    const featuresA = new Map([
      ['banner_image_sha256', { kind: 'text' as const, value: sharedSha }],
    ]);
    const featuresB = new Map([
      ['banner_image_sha256', { kind: 'text' as const, value: sharedSha }],
    ]);

    const pairFeatures = new BannerImageOverlapExtractor().extract(
      'alice',
      'bob',
      featuresA,
      featuresB
    );

    expect(pairFeatures.some((f) => f.name === 'banner_image_byte_equality')).toBe(true);
  });

  it('includes exif overlap on the default Twitter pair path (#119)', () => {
    expect(
      TWITTER_PAIR_EXTRACTORS.some((e) => e.name === 'exif_overlap_metadata_leakage')
    ).toBe(true);
  });
});
