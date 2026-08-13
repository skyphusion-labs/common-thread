import { describe, expect, it } from 'vitest';
import { validateImageFetchUrl } from '../../implementation/collection/safe-image-url';
import {
  buildPostedImageCorpusFromTweets,
  normalizeMediaUrl,
} from '../../implementation/ingest/apify-media-corpus';

describe('validateImageFetchUrl', () => {
  it('accepts HTTPS Twitter CDN URLs', () => {
    expect(validateImageFetchUrl('https://pbs.twimg.com/media/abc.jpg')).toEqual({
      url: 'https://pbs.twimg.com/media/abc.jpg',
    });
    expect(validateImageFetchUrl('https://video.twimg.com/ext_tw_video/1.mp4')).toEqual({
      url: 'https://video.twimg.com/ext_tw_video/1.mp4',
    });
    expect(validateImageFetchUrl('https://abs.twimg.com/sticky/default_profile.png')).toEqual({
      url: 'https://abs.twimg.com/sticky/default_profile.png',
    });
  });

  it('rejects http, credentials, and non-CDN hosts', () => {
    expect(validateImageFetchUrl('http://pbs.twimg.com/media/abc.jpg')).toEqual({
      error: 'Image URL must use HTTPS.',
    });
    expect(validateImageFetchUrl('https://user:pass@pbs.twimg.com/media/abc.jpg')).toEqual({
      error: 'Image URL must not include credentials.',
    });
    expect(validateImageFetchUrl('https://evil.example/media.jpg').error).toMatch(
      /host is not permitted/
    );
  });

  it('rejects private, link-local, loopback, and .internal hosts', () => {
    expect(validateImageFetchUrl('https://10.1.1.2/health')).toEqual({
      error: 'Image URL must not target private, link-local, or loopback hosts.',
    });
    expect(validateImageFetchUrl('https://169.254.169.254/latest/meta-data/')).toEqual({
      error: 'Image URL must not target private, link-local, or loopback hosts.',
    });
    expect(validateImageFetchUrl('https://127.0.0.1/img')).toEqual({
      error: 'Image URL must not target private, link-local, or loopback hosts.',
    });
    expect(validateImageFetchUrl('https://json-pdf.internal/health')).toEqual({
      error: 'Image URL must not target private, link-local, or loopback hosts.',
    });
  });
});

describe('normalizeMediaUrl', () => {
  it('drops fleet and foreign URLs before they enter the corpus', () => {
    expect(normalizeMediaUrl('http://10.1.1.2/health')).toBeNull();
    expect(normalizeMediaUrl('https://evil.example/x.jpg')).toBeNull();
    expect(normalizeMediaUrl('https://pbs.twimg.com/media/ok.jpg')).toBe(
      'https://pbs.twimg.com/media/ok.jpg'
    );
  });

  it('does not archive attacker media URLs from tweet JSON', () => {
    const entries = buildPostedImageCorpusFromTweets([
      {
        id_str: '1',
        media: [{ url: 'http://10.1.1.2/health' }, { url: 'https://pbs.twimg.com/media/ok.jpg' }],
      },
    ]);
    expect(entries.map((e) => e.url)).toEqual(['https://pbs.twimg.com/media/ok.jpg']);
  });
});
