/**
 * Extractor subsets for Instagram and Reddit ingest.
 *
 * Account extractors are platform-named. Pair extractors are schema-parallel
 * (Burrows, JSD, temporal overlap, cross-platform, account-metadata) so they
 * run on any pair that already has the matching account features.
 */

import {
  ALL_ACCOUNT_EXTRACTORS,
  ALL_PAIR_EXTRACTORS,
} from '../extractors';
import type { AccountFeatureExtractor } from '../extractors/types';
import type { PairFeatureExtractor } from '../extractors/pair-types';

const SHARED_PAIR_NAME =
  /account_metadata|burrows_delta|jsd_character_bigrams|jsd_sentence_length|jsd_punctuation|jsd_capitalization|burst_overlap|cadence_jsd|active_hour|quiet_period|bio_link|bio_text_rarity|external_link|handle_reuse|topic_phrase|register_pattern|code_switch|typo_error|background_novelty|subreddit_overlap|shortener_fingerprint/;

export const INSTAGRAM_ACCOUNT_EXTRACTORS: AccountFeatureExtractor[] =
  ALL_ACCOUNT_EXTRACTORS.filter(
    (e) => /instagram/i.test(e.name) || e.name === 'background_corpus_stylometric'
  );

export const REDDIT_ACCOUNT_EXTRACTORS: AccountFeatureExtractor[] =
  ALL_ACCOUNT_EXTRACTORS.filter(
    (e) => /reddit/i.test(e.name) || e.name === 'background_corpus_stylometric'
  );

export const INSTAGRAM_PAIR_EXTRACTORS: PairFeatureExtractor[] =
  ALL_PAIR_EXTRACTORS.filter((e) => SHARED_PAIR_NAME.test(e.name));

export const REDDIT_PAIR_EXTRACTORS: PairFeatureExtractor[] =
  ALL_PAIR_EXTRACTORS.filter((e) => SHARED_PAIR_NAME.test(e.name));

export const BLUESKY_ACCOUNT_EXTRACTORS: AccountFeatureExtractor[] =
  ALL_ACCOUNT_EXTRACTORS.filter(
    (e) => /bluesky/i.test(e.name) || e.name === 'background_corpus_stylometric'
  );

export const BLUESKY_PAIR_EXTRACTORS: PairFeatureExtractor[] =
  ALL_PAIR_EXTRACTORS.filter((e) => SHARED_PAIR_NAME.test(e.name));

export const MASTODON_ACCOUNT_EXTRACTORS: AccountFeatureExtractor[] =
  ALL_ACCOUNT_EXTRACTORS.filter(
    (e) => /mastodon/i.test(e.name) || e.name === 'background_corpus_stylometric'
  );

export const MASTODON_PAIR_EXTRACTORS: PairFeatureExtractor[] =
  ALL_PAIR_EXTRACTORS.filter((e) => SHARED_PAIR_NAME.test(e.name));

export const TIKTOK_ACCOUNT_EXTRACTORS: AccountFeatureExtractor[] =
  ALL_ACCOUNT_EXTRACTORS.filter(
    (e) => /tiktok/i.test(e.name) || e.name === 'background_corpus_stylometric'
  );

export const TIKTOK_PAIR_EXTRACTORS: PairFeatureExtractor[] =
  ALL_PAIR_EXTRACTORS.filter((e) => SHARED_PAIR_NAME.test(e.name));
