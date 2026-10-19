/**
 * Deploy-gate matrix for .github/scripts/require-wrangler-flag.sh (#340).
 *
 * The gate this replaces failed OPEN. It was:
 *
 *   grep -E '^\s*KEY\s*=' f | grep -Eq '["'\'']?(1|true)["'\'']?'
 *
 * The value match was unanchored with every quote optional, so it reduced to
 * "the substring 1 or true appears anywhere on the line". The repo's own
 * documented comment style in web/wrangler.toml.example therefore satisfied it:
 *
 *   HOSTED_MAINTENANCE = "0"   # "1" or "true"
 *
 * and the key match was scope blind, so a flag set only under
 * [env.staging.vars] or only under top level [vars] passed a gate whose error
 * message names [env.production.vars].
 *
 * Measured with wrangler 4.149.0 (deploy --env production --dry-run): top level
 * [vars] is NOT inherited into a named environment, and an [env.production.vars]
 * table that omits the key does NOT fall back per key. So "set somewhere else in
 * the file" means the production Worker runs with the flag UNSET, which is the
 * exact fail-open the gate exists to stop.
 *
 * Every case below is asserted in BOTH directions: the gate must go red on a
 * bad config and green on a good one. A gate that can only ever pass is
 * decoration, so the PASS rows are as load bearing as the FAIL rows.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const GATE = join(process.cwd(), '.github/scripts/require-wrangler-flag.sh');
const work = mkdtempSync(join(tmpdir(), 'ct-deploy-gate-'));

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

interface Scopes {
  /** Lines inside top level [vars]. */
  topLevel?: string;
  /** Lines inside [env.staging.vars]. */
  staging?: string;
  /** Lines inside [env.operator.vars]. */
  operator?: string;
  /** Lines inside [env.production.vars]. */
  production?: string;
  /** Omit the [env.production.vars] table entirely. */
  noProductionTable?: boolean;
}

function writeConfig(name: string, scopes: Scopes): string {
  const parts = [
    'name = "ct-web"',
    'main = "worker.js"',
    'compatibility_date = "2025-01-01"',
    '',
    '[vars]',
    'PUBLIC_URL = "https://example.org"',
    scopes.topLevel ?? '',
    '',
    '[env.staging.vars]',
    'PUBLIC_URL = "https://staging.example.org"',
    scopes.staging ?? '',
    '',
    '[env.operator.vars]',
    'PUBLIC_URL = "https://ops.example.org"',
    scopes.operator ?? '',
  ];
  if (!scopes.noProductionTable) {
    parts.push(
      '',
      '[env.production.vars]',
      'PUBLIC_URL = "https://common-thread.skyphusion.org"',
      scopes.production ?? ''
    );
  }
  parts.push('', '[[env.production.routes]]', 'pattern = "common-thread.skyphusion.org"', 'custom_domain = true');
  const path = join(work, `${name}.toml`);
  writeFileSync(path, `${parts.join('\n')}\n`);
  return path;
}

/** Runs the real gate script. Returns its exit status. */
function runGate(path: string, key = 'HOSTED_MAINTENANCE'): number {
  const r = spawnSync('bash', [GATE, path, 'production', key, 'TEST_SECRET'], {
    encoding: 'utf8',
  });
  if (r.error) throw r.error;
  return r.status ?? 1;
}

const PASS = 0;

describe('require-wrangler-flag.sh accepts a correctly set flag', () => {
  it.each([
    ['a bare truthy string', 'HOSTED_MAINTENANCE = "1"'],
    ['the string true', 'HOSTED_MAINTENANCE = "true"'],
    ['an unquoted TOML boolean', 'HOSTED_MAINTENANCE = true'],
    // worker.js isTruthyFlag() lowercases before comparing, so the gate must too.
    ['an uppercase string', 'HOSTED_MAINTENANCE = "TRUE"'],
    [
      'the comment style wrangler.toml.example already uses',
      'HOSTED_MAINTENANCE = "1"   # "1" or "true"; same truthiness as backend (#201)',
    ],
  ])('passes with %s', (label, production) => {
    expect(runGate(writeConfig(`pass-${label.replace(/\W+/g, '-')}`, { production }))).toBe(PASS);
  });

  it('reads the production scope and ignores a falsy value in another env', () => {
    // Proves the scope fix is a real scope READ, not merely a stricter match:
    // the gate must not fail just because some other table says "0".
    const path = writeConfig('pass-staging-zero-prod-one', {
      staging: 'HOSTED_MAINTENANCE = "0"',
      production: 'HOSTED_MAINTENANCE = "1"',
    });
    expect(runGate(path)).toBe(PASS);
  });

  it('passes on the committed web/wrangler.toml.example', () => {
    expect(runGate(join(process.cwd(), 'web/wrangler.toml.example'))).toBe(PASS);
  });

  it('is reusable for the other escrow flag it now also gates', () => {
    const path = writeConfig('pass-byok', { production: 'PUBLIC_BYOK_ONLY = "1"' });
    expect(runGate(path, 'PUBLIC_BYOK_ONLY')).toBe(PASS);
  });
});

describe('require-wrangler-flag.sh fails closed on a bad config', () => {
  it.each([
    // THE DEFECT. The old pipeline passed this: it matched the "1" in the
    // trailing comment, not the value, and shipped the flag turned OFF.
    ['a falsy value whose comment mentions the truthy ones', 'HOSTED_MAINTENANCE = "0"   # "1" or "true"'],
    [
      'the exact example comment style with a falsy value',
      'HOSTED_MAINTENANCE = "0"   # "1" or "true"; same truthiness as backend (#201)',
    ],
    ['a bare falsy value', 'HOSTED_MAINTENANCE = "0"'],
    ['a word that merely contains a truthy substring', 'HOSTED_MAINTENANCE = "disabled1"'],
    ['a value of off', 'HOSTED_MAINTENANCE = "off"'],
    ['a commented out assignment', '# HOSTED_MAINTENANCE = "1"'],
    // Comment stripping must not break on a "#" inside the quoted value.
    ['a hash inside the value', 'HOSTED_MAINTENANCE = "#1"'],
    // TOML forbids a duplicate key; the gate must not guess which line wins.
    ['the key set twice', 'HOSTED_MAINTENANCE = "0"\nHOSTED_MAINTENANCE = "1"'],
  ])('fails with %s', (label, production) => {
    expect(runGate(writeConfig(`fail-${label.replace(/\W+/g, '-')}`, { production }))).not.toBe(PASS);
  });

  it('fails when the flag is not set anywhere', () => {
    expect(runGate(writeConfig('fail-unset', {}))).not.toBe(PASS);
  });

  it('fails when the flag is set only under [env.staging.vars]', () => {
    const path = writeConfig('fail-staging-only', { staging: 'HOSTED_MAINTENANCE = "1"' });
    expect(runGate(path)).not.toBe(PASS);
  });

  it('fails when the flag is set only under [env.operator.vars]', () => {
    const path = writeConfig('fail-operator-only', { operator: 'HOSTED_MAINTENANCE = "1"' });
    expect(runGate(path)).not.toBe(PASS);
  });

  it('fails when the flag is set only under top level [vars]', () => {
    // wrangler warns that [vars] is not inherited by a named environment, so
    // this config deploys production with the flag unset.
    const path = writeConfig('fail-toplevel-only', {
      topLevel: 'HOSTED_MAINTENANCE = "1"',
      noProductionTable: true,
    });
    expect(runGate(path)).not.toBe(PASS);
  });

  it('fails when the config file is absent', () => {
    expect(runGate(join(work, 'does-not-exist.toml'))).not.toBe(PASS);
  });
});

describe('the gate reports the scope its error message names', () => {
  it('names [env.production.vars] and says why another scope does not count', () => {
    const path = writeConfig('msg-staging-only', { staging: 'HOSTED_MAINTENANCE = "1"' });
    const r = spawnSync('bash', [GATE, path, 'production', 'HOSTED_MAINTENANCE', 'COMMON_THREAD_WEB_WRANGLER'], {
      encoding: 'utf8',
    });
    expect(r.status).not.toBe(PASS);
    expect(r.stdout).toContain('[env.production.vars]');
    expect(r.stdout).toContain('COMMON_THREAD_WEB_WRANGLER');
    expect(r.stdout).toContain('does not inherit top-level [vars]');
  });

  it('never prints the resolved value, which comes from an Actions secret', () => {
    const path = writeConfig('msg-no-value-leak', { production: 'HOSTED_MAINTENANCE = "sentinel-value-0"' });
    const r = spawnSync('bash', [GATE, path, 'production', 'HOSTED_MAINTENANCE', 'TEST_SECRET'], {
      encoding: 'utf8',
    });
    expect(r.status).not.toBe(PASS);
    expect(`${r.stdout}${r.stderr}`).not.toContain('sentinel-value-0');
  });
});
