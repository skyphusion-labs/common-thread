/**
 * Unit tests for §4.4.4 amplification control-account baseline (v1.1.0).
 */

import { describe, expect, it } from 'vitest';
import { AmplificationExtractor } from '../../implementation/extractors/network/amplification';
import type { EngagementEventRecord } from '../../implementation/extractors/event-types';

function engagement(
  account: string,
  targetAuthor: string,
  targetPostId = 'post-1'
): EngagementEventRecord {
  return {
    account,
    platform: 'twitter',
    eventFeatureId: 1,
    timestampMs: 0,
    eventTimestamp: '2024-06-01T12:00:00.000Z',
    eventType: 'reply',
    targetPostId,
    targetAuthor,
    engagementTargetKey: `${targetAuthor}:${targetPostId}`,
    sourcePostId: null,
    conversationId: null,
  };
}

function numericFeatures(
  features: ReturnType<AmplificationExtractor['extract']>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of features) {
    if (f.value.kind === 'numeric') out[f.name] = f.value.value;
  }
  return out;
}

describe('AmplificationExtractor control baseline', () => {
  it('computes baseline mean/stdev from control-control pair fractions', () => {
    const extractor = new AmplificationExtractor();

    const ctx = extractor.buildContext([
      { account: 'c1', isControl: true, events: [engagement('c1', 'c2')] },
      { account: 'c2', isControl: true, events: [engagement('c2', 'c1')] },
      { account: 'alice', isControl: false, events: [engagement('alice', 'c1')] },
      { account: 'bob', isControl: false, events: [engagement('bob', 'alice')] },
    ]);

    // Control pair (c1,c2): b_of_a = 1/2 = 0.5, a_of_b = 1/1 = 1.0
    expect(ctx.baseline.hasControls).toBe(true);
    expect(ctx.baseline.sampleCount).toBe(2);
    expect(ctx.baseline.meanFraction).toBeCloseTo(0.75, 5);
    expect(ctx.baseline.stdevFraction).toBeCloseTo(0.25, 5);
  });

  it('omits z-scores when baseline stdev is zero', () => {
    const extractor = new AmplificationExtractor();

    const ctx = extractor.buildContext([
      { account: 'c1', isControl: true, events: [engagement('c1', 'c2')] },
      { account: 'c2', isControl: true, events: [engagement('c2', 'c1')] },
    ]);

    expect(ctx.baseline.stdevFraction).toBe(0);

    const features = numericFeatures(extractor.extract('c1', 'c2', [], [], ctx));
    expect(features.amplification_baseline_mean).toBe(1);
    expect(features.amplification_baseline_stdev).toBe(0);
    expect(features.amplification_b_of_a_fraction_zscore).toBeUndefined();
    expect(features.amplification_a_of_b_fraction_zscore).toBeUndefined();
  });

  it('emits fraction z-scores for suspect pairs when controls provide spread', () => {
    const extractor = new AmplificationExtractor();

    const ctx = extractor.buildContext([
      { account: 'c1', isControl: true, events: [engagement('c1', 'c2')] },
      { account: 'c2', isControl: true, events: [engagement('c2', 'c1')] },
      { account: 'alice', isControl: false, events: [engagement('alice', 'c1')] },
      {
        account: 'bob',
        isControl: false,
        events: [
          engagement('bob', 'alice'),
          engagement('bob', 'alice', 'post-2'),
        ],
      },
    ]);

    const features = numericFeatures(extractor.extract('alice', 'bob', [], [], ctx));

    expect(features.amplification_b_of_a_fraction).toBe(1);
    expect(features.amplification_baseline_mean).toBeCloseTo(0.75, 5);
    expect(features.amplification_baseline_stdev).toBeCloseTo(0.25, 5);
    expect(features.amplification_b_of_a_fraction_zscore).toBeCloseTo(1, 5);
    expect(features.amplification_a_of_b_fraction_zscore).toBeUndefined();
  });

  it('omits z-scores when no control accounts are configured', () => {
    const extractor = new AmplificationExtractor();

    const ctx = extractor.buildContext([
      { account: 'alice', events: [engagement('alice', 'bob')] },
      { account: 'bob', events: [engagement('bob', 'alice')] },
    ]);

    expect(ctx.baseline.hasControls).toBe(false);
    expect(ctx.baseline.meanFraction).toBe(1);
    expect(ctx.baseline.stdevFraction).toBe(0);

    const features = numericFeatures(extractor.extract('alice', 'bob', [], [], ctx));
    expect(features.amplification_baseline_mean).toBe(1);
    expect(features.amplification_b_of_a_fraction_zscore).toBeUndefined();
    expect(features.amplification_a_of_b_fraction_zscore).toBeUndefined();
  });
});
