import { describe, expect, it } from 'vitest';
import {
  DualWriteBucket,
  isArchiveDualWriteEnabled,
  resolveArchiveBucket,
} from '../../implementation/archive/dual-write';
import { ArchiveStore } from '../../implementation/archive/store';
import { createFakeR2 } from '../helpers/fake-r2';

describe('archive dual-write (§5.4.4)', () => {
  it('stays single-bucket when flag unset', () => {
    const primary = createFakeR2();
    expect(
      isArchiveDualWriteEnabled({ ARCHIVE: primary, ARCHIVE_DUAL_WRITE: undefined })
    ).toBe(false);
    expect(resolveArchiveBucket({ ARCHIVE: primary })).toBe(primary);
  });

  it('stays single-bucket when flag set but replica missing', () => {
    const primary = createFakeR2();
    expect(
      isArchiveDualWriteEnabled({
        ARCHIVE: primary,
        ARCHIVE_DUAL_WRITE: 'true',
      })
    ).toBe(false);
  });

  it('mirrors ArchiveStore.put to the replica bucket', async () => {
    const primary = createFakeR2();
    const replica = createFakeR2();
    const bucket = resolveArchiveBucket({
      ARCHIVE: primary,
      ARCHIVE_REPLICA: replica,
      ARCHIVE_DUAL_WRITE: '1',
    });
    expect(bucket).toBeInstanceOf(DualWriteBucket);

    const store = new ArchiveStore({ bucket });
    const bytes = new TextEncoder().encode('dual-write-probe');
    const result = await store.put(bytes, { mimeType: 'text/plain', extension: 'txt' });

    expect(result.newlyWritten).toBe(true);
    expect(await primary.head(result.path)).not.toBeNull();
    expect(await replica.head(result.path)).not.toBeNull();

    const again = await store.put(bytes, { mimeType: 'text/plain', extension: 'txt' });
    expect(again.newlyWritten).toBe(false);
  });

  it('deletes from both buckets on purge-style delete', async () => {
    const primary = createFakeR2();
    const replica = createFakeR2();
    const bucket = new DualWriteBucket(primary, replica);
    await primary.put('investigations/x/manifest.jsonl', 'a');
    await replica.put('investigations/x/manifest.jsonl', 'a');
    await bucket.delete('investigations/x/manifest.jsonl');
    expect(await primary.head('investigations/x/manifest.jsonl')).toBeNull();
    expect(await replica.head('investigations/x/manifest.jsonl')).toBeNull();
  });
});
