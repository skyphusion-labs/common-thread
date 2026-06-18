/**
 * R2 bucket adapter for Node.js using the S3-compatible API.
 *
 * Used by the self-hosted ingest container to read/write archive objects
 * without a Workers R2 binding.
 */

import {
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { R2BucketLike } from '../../implementation/archive/store';

export interface R2S3Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

export function r2S3ConfigFromEnv(): R2S3Config {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new Error(
      'R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME are required'
    );
  }

  return { accountId, accessKeyId, secretAccessKey, bucketName };
}

export function createR2BucketFromS3Config(config: R2S3Config): R2BucketLike {
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return {
    async head(key: string) {
      try {
        const out = await client.send(
          new HeadObjectCommand({ Bucket: config.bucketName, Key: key })
        );
        return { size: out.ContentLength ?? 0 };
      } catch {
        return null;
      }
    },

    async get(key: string) {
      try {
        const out = await client.send(
          new GetObjectCommand({ Bucket: config.bucketName, Key: key })
        );
        if (!out.Body) return null;
        const bytes = await out.Body.transformToByteArray();
        return {
          async arrayBuffer() {
            return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
          },
          async text() {
            return new TextDecoder().decode(bytes);
          },
        };
      } catch {
        return null;
      }
    },

    async put(key, value, options) {
      const existing = await client
        .send(new HeadObjectCommand({ Bucket: config.bucketName, Key: key }))
        .catch(() => null);

      if (existing && options?.onlyIf?.etagDoesNotMatch) {
        return null;
      }

      const body =
        typeof value === 'string'
          ? value
          : value instanceof Uint8Array
            ? value
            : new Uint8Array(value);

      await client.send(
        new PutObjectCommand({
          Bucket: config.bucketName,
          Key: key,
          Body: body,
          ContentType: options?.httpMetadata?.contentType,
        })
      );
      return {};
    },
  };
}
