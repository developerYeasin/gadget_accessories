import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
dotenv.config();

// Cloudflare R2 (S3-compatible). Images are served from the bucket's public r2.dev URL.
const {
  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL,
} = process.env;

export const r2Enabled = Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET && R2_PUBLIC_URL);
export const r2PublicUrl = (R2_PUBLIC_URL || '').replace(/\/+$/, '');

const client = r2Enabled
  ? new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  })
  : null;

const CONTENT_TYPES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', svg: 'image/svg+xml',
};
export const contentTypeFor = (key) => CONTENT_TYPES[key.split('.').pop().toLowerCase()] || 'application/octet-stream';

// Uploads a buffer and returns its public URL
export async function uploadToR2(key, body, contentType = contentTypeFor(key)) {
  if (!r2Enabled) throw Object.assign(new Error('Cloudflare R2 is not configured. Add the R2_* values to backend/.env'), { status: 500 });
  await client.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return `${r2PublicUrl}/${key}`;
}

export async function deleteFromR2(url) {
  if (!r2Enabled || !url?.startsWith(r2PublicUrl + '/')) return;
  await client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: url.slice(r2PublicUrl.length + 1) }));
}
