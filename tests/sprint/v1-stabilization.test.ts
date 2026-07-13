import { describe, expect, it } from 'vitest';
import { purgeInvestigationArchive } from '../../implementation/investigations/archive-purge';
import {
  investigationManifestPath,
  investigationSignaturesPath,
} from '../../implementation/archive/paths';
import { createFakeR2 } from '../helpers/fake-r2';

describe('investigation archive purge', () => {
  it('removes manifest and signature sidecar keys', async () => {
    const bucket = createFakeR2();
    const id = 'purge-test-inv';
    await bucket.put(investigationManifestPath(id), 'line\n');
    await bucket.put(investigationSignaturesPath(id), 'sig\n');

    const result = await purgeInvestigationArchive(bucket, id);
    expect(result.deletedKeys).toEqual([
      investigationManifestPath(id),
      investigationSignaturesPath(id),
    ]);
    expect(await bucket.head(investigationManifestPath(id))).toBeNull();
  });
});
