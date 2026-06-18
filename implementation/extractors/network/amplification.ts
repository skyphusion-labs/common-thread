/**
 * Cross-account amplification pair extractor (§4.4.4).
 *
 * Measures how much amplification each seed account receives from other
 * seeds (replies, reposts, quotes on their content). High in-seed
 * amplification fraction is a coordination signal when organic following
 * is low.
 */

import type {
  EngagementEventRecord,
  EngagementPairFeatureExtractor,
} from '../event-types';
import type { ExtractedFeature } from '../types';

const NAME = 'amplification_network';
const VERSION = '1.0.0';

interface AmplificationContext {
  seedSet: Set<string>;
  /** target_author → engagements from any seed account */
  onTarget: Map<string, EngagementEventRecord[]>;
}

export class AmplificationExtractor implements EngagementPairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'network' as const;
  readonly requiredEventTypes = ['reply', 'repost', 'quote'] as const;

  buildContext(
    seedAccounts: ReadonlyArray<{ account: string; events: EngagementEventRecord[] }>
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

    return { seedSet, onTarget };
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

    const onA = (ctx.onTarget.get(accountA) ?? []).filter(e => e.account !== accountA);
    const onB = (ctx.onTarget.get(accountB) ?? []).filter(e => e.account !== accountB);

    const fromSeedsOnA = onA.filter(e => ctx.seedSet.has(e.account));
    const fromSeedsOnB = onB.filter(e => ctx.seedSet.has(e.account));

    const bAmplifiesA = fromSeedsOnA.filter(e => e.account === accountB).length;
    const aAmplifiesB = fromSeedsOnB.filter(e => e.account === accountA).length;

    const totalSeedOnA = fromSeedsOnA.length;
    const totalSeedOnB = fromSeedsOnB.length;

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

    if (totalSeedOnA > 0) {
      features.push({
        category: cat,
        name: 'amplification_b_of_a_fraction',
        value: { kind: 'numeric', value: bAmplifiesA / totalSeedOnA },
      });
    }
    if (totalSeedOnB > 0) {
      features.push({
        category: cat,
        name: 'amplification_a_of_b_fraction',
        value: { kind: 'numeric', value: aAmplifiesB / totalSeedOnB },
      });
    }

    const anySignal =
      bAmplifiesA > 0 || aAmplifiesB > 0 || totalSeedOnA > 0 || totalSeedOnB > 0;
    if (!anySignal) return [];

    return features;
  }
}
