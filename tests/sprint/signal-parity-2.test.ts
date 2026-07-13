import { describe, expect, it } from 'vitest';
import {
  mergeInvestigationMetadata,
  serializeInvestigationMetadata,
  validateMetadataPatch,
  validateTimeBounds,
} from '../../implementation/investigations/metadata';
import { promptSha256, TRIAGE_SYSTEM_PROMPT } from '../../implementation/reasoner/prompts';
import { buildColorPaletteCorpusFromHistogram } from '../../implementation/ingest/apify-color-palette-corpus';
import { mergeHistograms } from '../../implementation/extractors/visual/color-palette';

describe('investigation metadata (#121, #125)', () => {
  it('requires time_bounds justification', () => {
    expect(
      validateTimeBounds({
        start: '2025-01-01T00:00:00.000Z',
        end: '2025-01-02T00:00:00.000Z',
      })
    ).toContain('justification');
  });

  it('merges triggering_events patches', () => {
    const merged = mergeInvestigationMetadata(null, {
      triggering_events: [
        { id: 'evt1', timestamp: '2025-01-01T12:00:00.000Z' },
      ],
    });
    expect(merged.triggering_events).toHaveLength(1);
    const json = serializeInvestigationMetadata(merged);
    expect(JSON.parse(json).triggering_events[0].id).toBe('evt1');
  });

  it('validates metadata patch shape', () => {
    expect(validateMetadataPatch({ triggering_events: 'nope' })).toContain('array');
  });
});

describe('prompt reproducibility (#125)', () => {
  it('hashes system + user prompt deterministically', async () => {
    const a = await promptSha256(TRIAGE_SYSTEM_PROMPT, 'user body');
    const b = await promptSha256(TRIAGE_SYSTEM_PROMPT, 'user body');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('color palette corpus (#120)', () => {
  it('builds posted corpus records from merged histograms', () => {
    const hist = mergeHistograms(new Map([[1, 10]]), new Map([[2, 5]]));
    const corpus = buildColorPaletteCorpusFromHistogram('alice', 2, hist, 'posted');
    expect(corpus.imageType).toBe('posted');
    expect(corpus.imageCount).toBe(2);
    expect(corpus.totalPixels).toBe(15);
    expect(corpus.histogram['1']).toBe(10);
    expect(corpus.histogram['2']).toBe(5);
  });
});
