# Background corpus for TF-IDF / novelty n-grams (§4.3.2–3)

The methodology weights distinctive vocabulary and idiosyncratic phrases
against a **background corpus** from the broader community. Without a
background, within-seed TF-IDF (`topic_phrase_twitter`) still runs; the
background-weighted pair signals stay dormant.

## Artifact format

| Field | Value |
|-------|-------|
| `mimeType` | `application/x-background-corpus` |
| Collection tool (optional) | `background-corpus`, `background_corpus`, or `control-corpus` |

JSON body (any of):

```json
{ "documents": ["community post text…", "another document…"] }
```

```json
{ "texts": ["…", "…"] }
```

```json
["document one", "document two"]
```

Each string is one background document (DF counting is per-document).

## Recommended ingest path

1. Create a **control seed** in the investigation (seed `is_control = true`).
2. Archive-upload a background corpus artifact under that control account
   with `mimeType: application/x-background-corpus` (same archive /
   manifest path as other practitioner-supplied artifacts; see
   [API.md](API.md) ingest / archive routes for your deployment).
3. Ingest seed timelines as usual.
4. Re-run extractors. Account features:
   - Control: `background_doc_count`, `background_term_df`, `background_ngram_df`
   - Seeds: `account_term_tf`, `account_ngram_tf`
5. Pair extractor `background_novelty_stylometric` emits
   `background_tfidf_term_*` and `novelty_ngram_*` overlap features for
   seed–seed pairs (control accounts are excluded from pairs).

## Notes

- Prefer a community-relevant corpus (same language / niche). A generic
  English crawl is a weak baseline; a scraped control community is better.
- DF maps are capped (20k term / 20k n-gram keys) for storage bounds.
- Pair runner loads background DF via `contextAccountFeatures` even when
  the control account lacks seed TF maps.
