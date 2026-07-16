import { describe, expect, it } from 'vitest';
import {
  canonicalPlatformedPair,
  isCanonicalPlatformedPairOrder,
} from '../../implementation/schema/db-types';

describe('canonicalPlatformedPair', () => {
  it('orders by account identifier when accounts differ', () => {
    const [left, right] = canonicalPlatformedPair(
      { account: 'zebra', platform: 'twitter' },
      { account: 'aardvark', platform: 'reddit' }
    );
    expect(left).toEqual({ account: 'aardvark', platform: 'reddit' });
    expect(right).toEqual({ account: 'zebra', platform: 'twitter' });
  });

  it('orders by platform when account identifiers match', () => {
    const [left, right] = canonicalPlatformedPair(
      { account: 'bob', platform: 'twitter' },
      { account: 'bob', platform: 'reddit' }
    );
    expect(left).toEqual({ account: 'bob', platform: 'reddit' });
    expect(right).toEqual({ account: 'bob', platform: 'twitter' });
    expect(
      isCanonicalPlatformedPairOrder(
        left.account,
        left.platform,
        right.account,
        right.platform
      )
    ).toBe(true);
  });

  it('rejects identical (account, platform) identities', () => {
    expect(() =>
      canonicalPlatformedPair(
        { account: 'bob', platform: 'twitter' },
        { account: 'bob', platform: 'twitter' }
      )
    ).toThrow(/distinct \(account, platform\)/);
  });
});
