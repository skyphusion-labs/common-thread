/**
 * Cross-account amplification pair extractor (§4.4.4).
 *
 * Measures how much amplification each seed account receives from other
 * seeds (replies, reposts, quotes on their content). High in-seed
 * amplification fraction is a coordination signal when organic following
 * is low.
 *
 * Community baseline: when seed_accounts includes is_control=1 rows,
 * the baseline uses only control-account pair fractions (§5.1.4).
 * Otherwise falls back to leave-it-in across all seeds (conservative bias).
 * Z-scores are emitted only when explicit controls exist and stdev > 0.
 */

import type {
  EngagementEventRecord,
  EngagementPairFeatureExtractor,
} from '../event-types';
import type { ExtractedFeature } from '../types';
import { populationMean, populationStdev } from './co-engagement-helpers';

const NAME = 'amplification_network';
const VERSION = '1.1.0';

interface AmplificationContext {
  seedSet: Set<string>;
  /** target_author → engagements from any seed account */
  onTarget: Map<string, EngagementEventRecord[]>;
  baseline: {
    meanFraction: number;
    stdevFraction: number;
    sampleCount: number;
    hasControls: boolean;
  };
}

interface PairFractions {
  bOfA: number | null;
  aOfB: number | null;
}

export class AmplificationExtractor implements EngagementPairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'network' as const;
  readonly requiredEventTypes = ['reply', 'repost', 'quote'] as const;

  buildContext(
    seedAccounts: ReadonlyArray<{
      account: string;
      events: EngagementEventRecord[];
      isControl?: boolean;
    }>
  ): AmplificationContext {
    const seedSet = new Set(seedAccounts.map(s => s.account));
    const onTarget = new Map<string, EngagementEventRecord[]>();

    for (const { events } of seedAccounts) {
      for (const ev of events) {
        if (!seedSet.has(ev.targetAuthor)) continue;
        let list = onTarget.get(ev.targetAuthor);
        if (!list) {
          list = [];
          onTarget.set(ev.targetAuthor, list);
        }
        list.push(ev);
      }
    }

    const hasControls = seedAccounts.some(a => a.isControl);
    const baselineAccounts = hasControls
      ? seedAccounts.filter(a => a.isControl)
      : seedAccounts;

    const fractions: number[] = [];
    for (let i = 0; i < baselineAccounts.length - 1; i++) {
      for (let j = i + 1; j < baselineAccounts.length; j++) {
        const a = baselineAccounts[i].account;
        const b = baselineAccounts[j].account;
        const pair = computePairFractions(a, b, seedSet, onTarget);
        if (pair.bOfA !== null) fractions.push(pair.bOfA);
        if (pair.aOfB !== null) fractions.push(pair.aOfB);
      }
    }

    let meanFraction = 0;
    let stdevFraction = 0;
    if (fractions.length > 0) {
      meanFraction = populationMean(fractions);
      stdevFraction = populationStdev(fractions, meanFraction);
    }

    return {
      seedSet,
      onTarget,
      baseline: {
        meanFraction,
        stdevFraction,
        sampleCount: fractions.length,
        hasControls,
      },
    };
  }

  extract(
    accountA: string,
    accountB: string,
    _eventsA: EngagementEventRecord[],
    _eventsB: EngagementEventRecord[],
    context?: unknown
  ): ExtractedFeature[] {
    const ctx = context as AmplificationContext | undefined;
    if (!ctx) return [];

    const pair = computePairFractions(accountA, accountB, ctx.seedSet, ctx.onTarget);
    const {
      bAmplifiesA,
      aAmplifiesB,
      totalSeedOnA,
      totalSeedOnB,
      bOfA,
      aOfB,
    } = pair;

    const cat = 'network' as const;
    const features: ExtractedFeature[] = [
      {
        category: cat,
        name: 'amplification_b_of_a_count',
        value: { kind: 'numeric', value: bAmplifiesA },
      },
      {
        category: cat,
        name: 'amplification_a_of_b_count',
        value: { kind: 'numeric', value: aAmplifiesB },
      },
      {
        category: cat,
        name: 'amplification_seed_engagement_on_a_count',
        value: { kind: 'numeric', value: totalSeedOnA },
      },
      {
        category: cat,
        name: 'amplification_seed_engagement_on_b_count',
        value: { kind: 'numeric', value: totalSeedOnB },
      },
    ];

    if (bOfA !== null) {
      features.push({
        category: cat,
        name: 'amplification_b_of_a_fraction',
        value: { kind: 'numeric', value: bOfA },
      });
    }
    if (aOfB !== null) {
      features.push({
        category: cat,
        name: 'amplification_a_of_b_fraction',
        value: { kind: 'numeric', value: aOfB },
      });
    }

    const anySignal =
      bAmplifiesA > 0 || aAmplifiesB > 0 || totalSeedOnA > 0 || totalSeedOnB > 0;
    if (!anySignal) return [];

    features.push(
      {
        category: cat,
        name: 'amplification_baseline_mean',
        value: { kind: 'numeric', value: ctx.baseline.meanFraction },
      },
      {
        category: cat,
        name: 'amplification_baseline_stdev',
        value: { kind: 'numeric', value: ctx.baseline.stdevFraction },
      }
    );

    if (ctx.baseline.hasControls && ctx.baseline.stdevFraction > 0) {
      if (bOfA !== null) {
        features.push({
          category: cat,
          name: 'amplification_b_of_a_fraction_zscore',
          value: {
            kind: 'numeric',
            value: (bOfA - ctx.baseline.meanFraction) / ctx.baseline.stdevFraction,
          },
        });
      }
      if (aOfB !== null) {
        features.push({
          category: cat,
          name: 'amplification_a_of_b_fraction_zscore',
          value: {
            kind: 'numeric',
            value: (aOfB - ctx.baseline.meanFraction) / ctx.baseline.stdevFraction,
          },
        });
      }
    }

    return features;
  }
}

function computePairFractions(
  accountA: string,
  accountB: string,
  seedSet: ReadonlySet<string>,
  onTarget: ReadonlyMap<string, EngagementEventRecord[]>
): PairFractions & {
  bAmplifiesA: number;
  aAmplifiesB: number;
  totalSeedOnA: number;
  totalSeedOnB: number;
} {
  const onA = (onTarget.get(accountA) ?? []).filter(e => e.account !== accountA);
  const onB = (onTarget.get(accountB) ?? []).filter(e => e.account !== accountB);

  const fromSeedsOnA = onA.filter(e => seedSet.has(e.account));
  const fromSeedsOnB = onB.filter(e => seedSet.has(e.account));

  const bAmplifiesA = fromSeedsOnA.filter(e => e.account === accountB).length;
  const aAmplifiesB = fromSeedsOnB.filter(e => e.account === accountA).length;

  const totalSeedOnA = fromSeedsOnA.length;
  const totalSeedOnB = fromSeedsOnB.length;

  return {
    bAmplifiesA,
    aAmplifiesB,
    totalSeedOnA,
    totalSeedOnB,
    bOfA: totalSeedOnA > 0 ? bAmplifiesA / totalSeedOnA : null,
    aOfB: totalSeedOnB > 0 ? aAmplifiesB / totalSeedOnB : null,
  };
}
