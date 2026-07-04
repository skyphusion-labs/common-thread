# twitter_scrapes/ (synthetic test corpus)

This directory holds the fixture corpus for
`tests/extractors/twitter-scrapes.test.ts`, which validates the Apify ingest
parser and the stylometric / temporal / engagement extractors against realistic
Apify Twitter scrape **shapes**.

## Provenance: 100% synthetic

Every file here is fabricated. **Nothing was scraped from, or derived from, any
real account, person, or dataset.** Specifically:

- **Handles** (`avaloomis_synth`, `emberkoss_fake`, `quilltide_ref`, ...) are
  invented and suffixed `_synth` / `_mock` / `_fake` / `_demo` / `_test` /
  `_ref` to make their synthetic nature obvious.
- **Post text** is machine-composed from a fixed nonsense vocabulary; it is not
  anyone's writing.
- **Numeric IDs** are fabricated from a monotonic counter, not real snowflakes.
- **External links** use the reserved `example.invalid` domain (RFC 2606 /
  RFC 6761), which can never resolve.
- **Self-status URLs** use the `x.com` host only because the parser's
  author-from-URL path (`STATUS_URL` in `apify-tweet-fields.ts`) matches on that
  host. The handles and status IDs inside those URLs are still invented.

This repository is public and its subject matter is sockpuppet attribution, so
the corpus is deliberately unambiguous: no real-world identity, link, or content
is present or implied.

## What it exercises

The corpus covers the Apify field variants the extractors branch on:

- camelCase dialect (`fullText`, `createdAt`, `author.userName`) and snake_case
  dialect (`full_text`, `created_at`, `user.screen_name`);
- embedded reposts (`retweet`, `retweeted_status`) with a resolvable target;
- weak RT-prefix-only reposts (`RT @handle: ...`, no embedded object);
- replies (`inReplyToId` / `inReplyToUsername`, `in_reply_to_status_id_str` /
  `in_reply_to_screen_name`);
- quotes (`quotedTweet`, `quoted_status`);
- `noResults` placeholder rows (skipped by the parser);
- `MANIFEST.json` / `Chain_of_Custody.json` sidecars (skipped by the test's
  `SKIP_NAME` guard).

## Regenerating

The corpus is produced deterministically (fixed epoch, seeded PRNG; no
`Date.now` / `Math.random`), so regeneration is byte-identical:

```bash
node scripts/gen-twitter-fixtures.mjs
```

Edit `scripts/gen-twitter-fixtures.mjs` to change the corpus, then regenerate
and adjust the deterministic thresholds in the test if the totals shift.
