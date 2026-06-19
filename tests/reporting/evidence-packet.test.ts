import { describe, expect, it } from 'vitest';
import {
  METHODOLOGY_REFERENCE,
  renderMarkdown,
  type EvidencePacket,
} from '../../implementation/reporting/evidence-packet-meta';
import pkg from '../../package.json';

// Guards for issue #32: the evidence packet is the court-facing reproducibility
// envelope, so a wrong repo URL or a stale/hardcoded version undermines its
// integrity. These assert the citation is correct AND derived from the build.
describe('evidence packet methodology reference (#32)', () => {
  it('cites the canonical skyphusion-labs repository, not the old org', () => {
    expect(METHODOLOGY_REFERENCE.repository).toBe(
      'https://github.com/skyphusion-labs/common-thread'
    );
    // The wrong org must never reappear in the citation.
    expect(METHODOLOGY_REFERENCE.repository).not.toContain('SkyPhusion/common-thread');
  });

  it('sources the implementation version from package.json, not a hardcoded literal', () => {
    expect(METHODOLOGY_REFERENCE.implementation_version).toBe(pkg.version);
    // It must be a real semver-shaped string carried from the build.
    expect(METHODOLOGY_REFERENCE.implementation_version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('renders the correct repository URL and version into the generated packet', () => {
    const base = {
      format_version: 'evidence-packet-v1',
      generated_at: '2026-06-19T00:00:00.000Z',
      investigation_id: 'inv-test',
      attribution_run_id: 1,
      cover: { investigation_id: 'inv-test', confidence_band: 'unknown' },
      narrative: {},
      signal_appendix: [],
      manifest_extract: [],
      manifest_signature_status: { total_signatures: 0, valid_signatures: 0, signatures: [] },
      methodology_metadata: {},
      methodology_reference: METHODOLOGY_REFERENCE,
    } satisfies Omit<EvidencePacket, 'markdown'>;

    const markdown = renderMarkdown(base);
    expect(markdown).toContain('https://github.com/skyphusion-labs/common-thread');
    expect(markdown).toContain(`Implementation version: ${pkg.version}`);
    expect(markdown).not.toContain('SkyPhusion/common-thread');
  });
});
