import { DeleteObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';

import { AppConfigService } from '../config/app-config.service';

/**
 * The S3-compatible bucket LiveKit Egress writes class recordings to (FR-CLS-12).
 *
 * This is deliberately separate from `StorageService`: Cloudinary holds every other file,
 * but Egress can only upload to S3/GCS, so recordings live in their own bucket. The worker
 * needs to check that a READY recording's object still exists and remove it on retention
 * or erasure — both of which must talk to that bucket, not to Cloudinary.
 *
 * When `RECORDING_STORAGE_*` is unset, class recording is disabled. The methods throw
 * rather than silently succeeding, so retention retains the row (and its pointer) instead
 * of deleting the database record while orphaning the object.
 */
@Injectable()
export class RecordingStorageService {
  private readonly client: S3Client | null;
  private readonly bucket: string | null;

  constructor(config: AppConfigService) {
    const s = config.recordingStorage;
    if (!s) {
      this.client = null;
      this.bucket = null;
      return;
    }
    this.bucket = s.bucket;
    this.client = new S3Client({
      endpoint: s.endpoint,
      region: s.region,
      credentials: { accessKeyId: s.accessKey, secretAccessKey: s.secretKey },
      forcePathStyle: s.forcePathStyle,
    });
  }

  /** Whether a recording bucket is configured. */
  get configured(): boolean {
    return this.client !== null;
  }

  /** True when the object exists; false only for a genuine 404. */
  async objectExists(key: string): Promise<boolean> {
    const { client, bucket } = this.require();
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch (error) {
      if (this.isNotFound(error)) return false;
      throw error;
    }
  }

  /** Removes a recording object. Deleting an already-absent object succeeds. */
  async remove(key: string): Promise<void> {
    const { client, bucket } = this.require();
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } catch (error) {
      // S3 DeleteObject is idempotent, but a proxy or another S3 implementation may 404.
      if (this.isNotFound(error)) return;
      throw error;
    }
  }

  private require(): { client: S3Client; bucket: string } {
    if (!this.client || !this.bucket) {
      throw new Error(
        'Recording storage is not configured: set RECORDING_STORAGE_ENDPOINT, RECORDING_STORAGE_BUCKET, RECORDING_STORAGE_ACCESS_KEY and RECORDING_STORAGE_SECRET_KEY',
      );
    }
    return { client: this.client, bucket: this.bucket };
  }

  private isNotFound(error: unknown): boolean {
    const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    return (
      e?.name === 'NotFound' || e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404
    );
  }
}
