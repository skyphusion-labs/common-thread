import { describe, expect, it } from 'vitest';
import { createFakeR2 } from '../helpers/fake-r2';
import { ArchiveStore, openArchiveStore } from '../../implementation/archive/store';
import { ManifestStore } from '../../implementation/archive/manifest';
import { encryptedArtifactPath, pathForHash } from '../../implementation/archive/paths';
import { isEncryptedArchiveObject } from '../../implementation/archive/encryption';
import { deriveInvestigationKey } from '../../implementation/crypto/investigation-key';
import { purgeInvestigationArchive } from '../../implementation/investigations/archive-purge';

const PLAIN = new TextEncoder().encode('{"post":"unique-archive-plaintext-marker"}');

async function keyFor(id: string): Promise<CryptoKey> {
  return deriveInvestigationKey(`ct_${id}_secret`, id);
}

describe('archive encryption', () => {
  it('stores ciphertext and reads the plaintext with the same key', async () => {
    const bucket = createFakeR2();
    const id = 'inv-enc-roundtrip';
    const key = await keyFor(id);
    const store = openArchiveStore(bucket, id, key);
    const written = await store.put(PLAIN, { mimeType: 'application/json', extension: 'json' });

    expect(written.newlyWritten).toBe(true);
    expect(written.size).toBe(PLAIN.byteLength);
    expect(written.path).toBe(encryptedArtifactPath(id, written.hash, 'json'));
    expect(await bucket.head(pathForHash(written.hash, 'json'))).toBeNull();

    const stored = await bucket.get(written.path);
    const storedBytes = new Uint8Array(await stored!.arrayBuffer());
    expect(isEncryptedArchiveObject(storedBytes)).toBe(true);
    expect(new TextDecoder().decode(storedBytes)).not.toContain('unique-archive-plaintext-marker');

    const read = await store.get(written.hash, 'json');
    expect(new TextDecoder().decode(read!.bytes)).toBe(new TextDecoder().decode(PLAIN));

    const again = await store.put(PLAIN, { extension: 'json' });
    expect(again.newlyWritten).toBe(false);
    expect(again.size).toBe(PLAIN.byteLength);
  });

  it('does not let a keyless reader or another investigation read the object', async () => {
    const bucket = createFakeR2();
    const id = 'inv-enc-isolate';
    const store = openArchiveStore(bucket, id, await keyFor(id));
    const written = await store.put(PLAIN, { extension: 'json' });

    const keyless = new ArchiveStore({ bucket });
    expect(await keyless.get(written.hash, 'json')).toBeNull();

    const other = openArchiveStore(bucket, 'inv-enc-other', await keyFor('inv-enc-other'));
    expect(await other.get(written.hash, 'json')).toBeNull();

    const wrongKey = openArchiveStore(bucket, id, await keyFor('inv-enc-other'));
    await expect(wrongKey.get(written.hash, 'json')).rejects.toThrow(/did not decrypt/);
  });

  it('still reads a legacy plaintext object when the key is present', async () => {
    const bucket = createFakeR2();
    const legacy = new ArchiveStore({ bucket });
    const written = await legacy.put(PLAIN, { extension: 'json' });

    const store = openArchiveStore(bucket, 'inv-enc-legacy', await keyFor('inv-enc-legacy'));
    const read = await store.get(written.hash, 'json');
    expect(new TextDecoder().decode(read!.bytes)).toContain('unique-archive-plaintext-marker');
  });

  it('encrypts manifest lines and deletes per-investigation artifacts on purge', async () => {
    const bucket = createFakeR2();
    const id = 'inv-enc-manifest';
    const key = await keyFor(id);
    const archive = openArchiveStore(bucket, id, key);
    const written = await archive.put(PLAIN, { mimeType: 'application/json', extension: 'json' });

    const manifest = new ManifestStore({ bucket, investigationId: id, encKey: key });
    await manifest.append({
      hash: written.hash,
      source: 'https://example.test/post/1',
      collectedAt: '2026-10-15T00:00:00.000Z',
      collectionMethod: { tool: 'test', version: '1' },
      investigationId: id,
      mimeType: 'application/json',
      status: 'present',
    });

    const raw = await bucket.get(`investigations/${id}/manifest.jsonl`);
    const rawText = await raw!.text();
    expect(rawText).not.toContain('example.test');
    expect(rawText.startsWith('enc:1:')).toBe(true);

    const listed = await manifest.list();
    expect(listed).toHaveLength(1);
    expect(listed[0].source).toBe('https://example.test/post/1');

    const keyless = new ManifestStore({ bucket, investigationId: id });
    await expect(keyless.list()).rejects.toThrow(/no investigation key/);

    const found = await archive.getForEntry({ hash: written.hash, mimeType: 'application/json' });
    expect(new TextDecoder().decode(found!.bytes)).toContain('unique-archive-plaintext-marker');

    const purged = await purgeInvestigationArchive(bucket, id);
    expect(purged.deletedKeys).toContain(written.path);
    expect(await bucket.head(written.path)).toBeNull();
    expect(await bucket.head(`investigations/${id}/manifest.jsonl`)).toBeNull();
  });
});
