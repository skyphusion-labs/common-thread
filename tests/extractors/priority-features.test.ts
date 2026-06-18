import { describe, expect, it } from 'vitest';
import { computeDistinctiveTerms, computeRareNgrams } from '../../implementation/extractors/stylometric/topic-phrase';
import {
  extractNetworkListsFromPayload,
  payloadHasNetworkLists,
} from '../../implementation/ingest/apify-network-lists';
import { parseTriggeringEvents } from '../../implementation/investigations/triggers';
import { deriveStoredConfidence, toPresentationConfidence } from '../../implementation/extractors/confidence';

describe('topic-phrase extractors', () => {
  it('computes distinctive terms with TF-IDF weighting', () => {
    const docs = [
      'alpha beta gamma unique',
      'alpha beta common shared',
      'delta epsilon common shared',
    ];
    const terms = computeDistinctiveTerms(docs, 5);
    expect(terms.length).toBeGreaterThan(0);
    expect(terms[0]).toHaveProperty('term');
    expect(terms[0]).toHaveProperty('score');
  });

  it('extracts repeated phrase n-grams', () => {
    const docs = ['foo bar baz foo bar baz', 'foo bar baz again'];
    const ngrams = computeRareNgrams(docs, 10);
    expect(ngrams.some(n => n.includes('foo bar'))).toBe(true);
  });
});

describe('network list ingest', () => {
  it('detects embedded follower arrays only', () => {
    expect(payloadHasNetworkLists([{ User_Name: 'alice', followers: ['bob', 'carol'] }])).toBe(true);
    expect(payloadHasNetworkLists([{ User_Name: 'alice', Follower_Count: '100' }])).toBe(false);
  });

  it('extracts follower lists per account', () => {
    const lists = extractNetworkListsFromPayload([
      { userName: 'alice', followers: ['bob', 'carol'] },
    ]);
    expect(lists).toHaveLength(1);
    expect(lists[0].account).toBe('alice');
    expect(lists[0].users).toEqual(['bob', 'carol']);
  });
});

describe('triggering events', () => {
  it('parses triggering_events from metadata_json', () => {
    const meta = JSON.stringify({
      triggering_events: [
        {
          id: 'evt1',
          timestamp: '2025-01-01T12:00:00Z',
          match: { hashtags: ['breaking'] },
        },
      ],
    });
    const events = parseTriggeringEvents(meta);
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('evt1');
  });
});

describe('confidence flags', () => {
  it('maps stored flags to presentation layer', () => {
    expect(toPresentationConfidence('sufficient', true)).toBe('sufficient');
    expect(toPresentationConfidence('marginal', true)).toBe('degraded');
    expect(toPresentationConfidence(null, false)).toBe('degraded');
  });

  it('marks empty sets insufficient', () => {
    expect(
      deriveStoredConfidence('network', 'follower_set', { kind: 'json', value: [] })
    ).toBe('insufficient');
  });
});
