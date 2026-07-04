/**
 * Deterministic generator for the synthetic Apify Twitter scrape corpus in
 * `twitter_scrapes/`.
 *
 * WHY THIS EXISTS
 *   tests/extractors/twitter-scrapes.test.ts validates the ingest parser and
 *   the stylometric / temporal / engagement extractors against realistic Apify
 *   scrape SHAPES. The real corpus it was written for is local-only test data
 *   (never committed), so the suite ENOENT'd in CI and was excluded (issue #47).
 *   This generator emits a SMALL, 100% synthetic, entirely fabricated corpus
 *   that exercises every Apify field variant the extractors care about, so the
 *   suite runs in CI against committed fixtures.
 *
 * PROVENANCE (read `twitter_scrapes/README.md`)
 *   Nothing here is scraped from a real account. Handles are invented, post
 *   text is machine-composed nonsense, numeric IDs are fabricated, and external
 *   links point at the reserved example.invalid domain. Self-status URLs use the
 *   x.com host purely because the parser's author-from-URL path requires that
 *   host to match; the handles and status IDs inside them are still invented.
 *
 * DETERMINISM
 *   No Date.now / Math.random. All timestamps derive from a fixed epoch and all
 *   variation from a seeded mulberry32 PRNG, so re-running produces byte-identical
 *   files. Regenerate with:  node scripts/gen-twitter-fixtures.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'twitter_scrapes');

// Fixed epoch: 2026-01-01T00:00:00Z. Every post time is an offset from here.
const EPOCH_MS = Date.UTC(2026, 0, 1, 0, 0, 0);
const DAY_MS = 86_400_000;

/** Seeded PRNG (mulberry32) so the corpus is reproducible, no Math.random. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Invented vocabulary; produces varied word/character patterns for stylometry
// without resembling any real person's writing.
const SUBJECTS = ['the lantern', 'a courier', 'our ledger', 'the atlas', 'this beacon', 'a quiet harbor', 'the archivist', 'my compass'];
const VERBS = ['drifts past', 'catalogues', 'reroutes', 'annotates', 'shelters', 'tallies', 'mirrors', 'unspools'];
const OBJECTS = ['the tidal charts', 'every waypoint', 'a folded map', 'the manifest', 'these coordinates', 'a spare signal', 'the archive index', 'our shared route'];
const TAILS = ['before dawn.', 'again today.', 'without comment.', 'for the record.', 'as promised.', 'and moves on.', 'quietly.', 'twice over.'];

function sentence(rand) {
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  return `${cap(pick(SUBJECTS))} ${pick(VERBS)} ${pick(OBJECTS)} ${pick(TAILS)}`;
}
function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Accounts split into a camelCase group and a snake_case group so both Apify
// field dialects are covered. All handles are invented.
const CAMEL_ACCOUNTS = ['avaloomis_synth', 'brixby_mock', 'cutlerfen_demo', 'deltoravue_test'];
const SNAKE_ACCOUNTS = ['emberkoss_fake', 'finchlowe_synth', 'graymoor_demo', 'harlanpix_mock'];

// Invented engagement targets (never overlap the actor set).
const TARGETS = ['quilltide_ref', 'nimbusfen_ref', 'orlopdeck_ref', 'palewick_ref'];

const CLIENTS = ['Nimbus for Web', 'Lantern for Android', 'Courier Deck'];

let idCounter = 100_000_000_000; // fabricated snowflake-ish IDs, monotonic
function nextId() {
  idCounter += 4099;
  return String(idCounter);
}

function isoAt(dayOffset, hour, minute) {
  return new Date(EPOCH_MS + dayOffset * DAY_MS + hour * 3_600_000 + minute * 60_000).toISOString();
}

const POSTS_PER_ACCOUNT = 34;

/** Build one camelCase-dialect tweet for `handle` at sequence index `i`. */
function camelTweet(handle, i, rand) {
  const id = nextId();
  const dayOffset = i % 14;
  const hour = Math.floor(rand() * 24);
  const minute = Math.floor(rand() * 60);
  const createdAt = isoAt(dayOffset, hour, minute);
  const base = {
    id,
    url: `https://x.com/${handle}/status/${id}`,
    author: { userName: handle },
    createdAt,
    source: `<a href="https://example.invalid/app">${CLIENTS[i % CLIENTS.length]}</a>`,
  };

  const kind = i % 8;
  if (kind === 2 || kind === 6) {
    // Reply with a real target status id (real-post-id path).
    const target = TARGETS[i % TARGETS.length];
    return {
      ...base,
      fullText: `@${target} ${sentence(rand)}`,
      isReply: true,
      inReplyToId: nextId(),
      inReplyToUsername: target,
      conversationId: nextId(),
    };
  }
  if (kind === 3) {
    // Repost via embedded retweet object (real-post-id path).
    const target = TARGETS[(i + 1) % TARGETS.length];
    return {
      ...base,
      fullText: `${sentence(rand)}`,
      isRetweet: true,
      retweet: { id: nextId(), author: { userName: target }, fullText: sentence(rand) },
    };
  }
  if (kind === 5) {
    // Quote tweet (real-post-id path).
    const target = TARGETS[(i + 2) % TARGETS.length];
    return {
      ...base,
      fullText: `${sentence(rand)} example.invalid/${target}`,
      quotedTweet: { id: nextId(), author: { userName: target }, fullText: sentence(rand) },
    };
  }
  if (kind === 7) {
    // RT-prefix-only repost: no embedded object, no status URL. Weak signal.
    const target = TARGETS[(i + 3) % TARGETS.length];
    return { ...base, fullText: `RT @${target}: ${sentence(rand)}` };
  }
  // Plain original post.
  return { ...base, fullText: sentence(rand) };
}

/** Build one snake_case-dialect tweet for `handle` at sequence index `i`. */
function snakeTweet(handle, i, rand) {
  const id = nextId();
  const dayOffset = i % 14;
  const hour = Math.floor(rand() * 24);
  const minute = Math.floor(rand() * 60);
  const created_at = isoAt(dayOffset, hour, minute);
  const base = {
    id_str: id,
    url: `https://x.com/${handle}/status/${id}`,
    user: { screen_name: handle },
    created_at,
    source: `<a href="https://example.invalid/app">${CLIENTS[i % CLIENTS.length]}</a>`,
  };

  const kind = i % 8;
  if (kind === 2 || kind === 6) {
    const target = TARGETS[i % TARGETS.length];
    return {
      ...base,
      full_text: `@${target} ${sentence(rand)}`,
      in_reply_to_status_id_str: nextId(),
      in_reply_to_screen_name: target,
      conversation_id: nextId(),
    };
  }
  if (kind === 3) {
    const target = TARGETS[(i + 1) % TARGETS.length];
    return {
      ...base,
      full_text: `${sentence(rand)}`,
      retweeted_status: { id_str: nextId(), user: { screen_name: target }, full_text: sentence(rand) },
    };
  }
  if (kind === 5) {
    const target = TARGETS[(i + 2) % TARGETS.length];
    return {
      ...base,
      full_text: `${sentence(rand)} example.invalid/${target}`,
      quoted_status: { id_str: nextId(), user: { screen_name: target }, full_text: sentence(rand) },
    };
  }
  if (kind === 7) {
    const target = TARGETS[(i + 3) % TARGETS.length];
    return { ...base, full_text: `RT @${target}: ${sentence(rand)}` };
  }
  return { ...base, full_text: sentence(rand) };
}

function buildTimeline(handle, dialect, seed) {
  const rand = mulberry32(seed);
  const make = dialect === 'camel' ? camelTweet : snakeTweet;
  const tweets = [];
  for (let i = 0; i < POSTS_PER_ACCOUNT; i++) {
    tweets.push(make(handle, i, rand));
  }
  return tweets;
}

function writeJson(name, value) {
  const path = join(OUT_DIR, name);
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
  return path;
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  let seed = 0x51a7e5;
  const written = [];

  CAMEL_ACCOUNTS.forEach((handle) => {
    written.push(writeJson(`timeline_${handle}.json`, buildTimeline(handle, 'camel', seed++)));
  });
  SNAKE_ACCOUNTS.forEach((handle) => {
    written.push(writeJson(`timeline_${handle}.json`, buildTimeline(handle, 'snake', seed++)));
  });

  // A search export where the query returned nothing plus two valid rows, to
  // exercise the noResults placeholder-skip path alongside real parsing.
  const rand = mulberry32(seed++);
  written.push(
    writeJson('search_noresults.json', [
      { noResults: true, searchQuery: 'from:nonexistent_synth_handle', message: 'No results' },
      { id: nextId(), url: `https://x.com/avaloomis_synth/status/${nextId()}`, author: { userName: 'avaloomis_synth' }, createdAt: isoAt(3, 9, 15), fullText: sentence(rand) },
      { id: nextId(), url: `https://x.com/emberkoss_fake/status/${nextId()}`, user: { screen_name: 'emberkoss_fake' }, created_at: isoAt(4, 18, 42), full_text: sentence(rand) },
    ])
  );

  // Files the suite intentionally skips by name (SKIP_NAME regex): prove the
  // chain-of-custody / manifest sidecars do not break iteration.
  writeJson('MANIFEST.json', { note: 'Skipped by the test SKIP_NAME guard; not a scrape payload.', synthetic: true });
  writeJson('Chain_of_Custody.json', { note: 'Skipped by the test SKIP_NAME guard; not a scrape payload.', synthetic: true });

  console.log(`Wrote ${written.length} scrape fixtures + 2 skipped sidecars to ${OUT_DIR}`);
}

main();
