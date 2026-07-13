import { ManifestStore } from '../archive/manifest';

export interface ArchiveManifestBinding {
  ARCHIVE: R2Bucket;
  MANIFEST_COORDINATOR?: DurableObjectNamespace;
  MANIFEST_REMOTE_APPEND?: {
    appendUrl: string;
    secret: string;
  };
}

export function manifestStoreFor(
  env: ArchiveManifestBinding,
  investigationId: string
): ManifestStore {
  return new ManifestStore({
    bucket: env.ARCHIVE,
    investigationId,
    coordinator: env.MANIFEST_COORDINATOR,
    remoteAppend: env.MANIFEST_REMOTE_APPEND,
  });
}

export function buildManifestRemoteAppend(
  baseUrl: string | undefined,
  secret: string | undefined,
  investigationId: string
): ArchiveManifestBinding['MANIFEST_REMOTE_APPEND'] {
  if (!baseUrl || !secret) return undefined;
  const base = baseUrl.replace(/\/$/, '');
  return {
    appendUrl: `${base}/${encodeURIComponent(investigationId)}/append`,
    secret,
  };
}
