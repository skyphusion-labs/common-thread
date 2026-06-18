import {
  ALL_ACCOUNT_EXTRACTORS,
  ALL_PAIR_EXTRACTORS,
  ALL_EVENT_EXTRACTORS,
  ALL_ENGAGEMENT_PAIR_EXTRACTORS,
} from '../extractors';
import type { AccountFeatureExtractor } from '../extractors/types';
import type { PairFeatureExtractor } from '../extractors/pair-types';
import type { EventFeatureExtractor } from '../extractors/event-types';
import type { EngagementPairFeatureExtractor } from '../extractors/event-types';

export const TWITTER_ACCOUNT_EXTRACTORS: AccountFeatureExtractor[] =
  ALL_ACCOUNT_EXTRACTORS.filter(
    (e) => /twitter/i.test(e.name) || e.name === 'posted_image_corpus'
  );

export const TWITTER_PAIR_EXTRACTORS: PairFeatureExtractor[] =
  ALL_PAIR_EXTRACTORS.filter(
    (e) =>
      /twitter/i.test(e.name) ||
      /account_metadata/i.test(e.name) ||
      /burrows_delta/i.test(e.name) ||
      /jsd_character_bigrams/i.test(e.name) ||
      /burst_overlap/i.test(e.name) ||
      /cadence_jsd/i.test(e.name) ||
      /active_hour/i.test(e.name) ||
      /quiet_period/i.test(e.name) ||
      /client_app_overlap/i.test(e.name) ||
      /tweet_language/i.test(e.name) ||
      /profile_lang/i.test(e.name) ||
      /bio_link/i.test(e.name) ||
      /external_link/i.test(e.name) ||
      /handle_reuse/i.test(e.name) ||
      /follower_overlap/i.test(e.name) ||
      /mutual_follow/i.test(e.name) ||
      /posted_image_overlap/i.test(e.name) ||
      /profile_image_overlap/i.test(e.name) ||
      /banner_image_overlap/i.test(e.name) ||
      /color_palette_overlap/i.test(e.name) ||
      /topic_phrase_overlap/i.test(e.name) ||
      /response_latency/i.test(e.name)
  );

export const TWITTER_EVENT_EXTRACTORS: EventFeatureExtractor[] =
  ALL_EVENT_EXTRACTORS.filter((e) => /twitter/i.test(e.name));

export const TWITTER_ENGAGEMENT_PAIR_EXTRACTORS: EngagementPairFeatureExtractor[] =
  ALL_ENGAGEMENT_PAIR_EXTRACTORS;
