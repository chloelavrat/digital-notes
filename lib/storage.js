import { Storage } from '@google-cloud/storage'

export const BUCKET = process.env.GCS_BUCKET || 'digital-notes-local'

// When STORAGE_EMULATOR_HOST is set the client talks to fake-gcs-server locally.
// In production (Cloud Run) the client uses ADC automatically.
const storage = new Storage(
  process.env.STORAGE_EMULATOR_HOST
    ? {
        apiEndpoint: process.env.STORAGE_EMULATOR_HOST,
        projectId:   'local-dev',
      }
    : {}
)

const bucket = storage.bucket(BUCKET)

/**
 * Upload a Buffer to GCS and return the gs:// URI.
 * @param {string} gcsPath  e.g. "dn/user-id/scan-id/input.pdf"
 * @param {Buffer} buffer
 * @param {string} contentType
 */
export async function uploadBuffer(gcsPath, buffer, contentType) {
  const file = bucket.file(gcsPath)
  await file.save(buffer, { contentType, resumable: false })
  return `gs://${BUCKET}/${gcsPath}`
}

/**
 * Download a file from GCS and return its Buffer.
 * @param {string} gcsUri  gs://bucket/path  OR just the path
 */
export async function downloadBuffer(gcsUri) {
  const path = gcsUri.startsWith('gs://')
    ? gcsUri.replace(`gs://${BUCKET}/`, '')
    : gcsUri
  const [buf] = await bucket.file(path).download()
  return buf
}

/**
 * Generate a short-lived signed read URL (default 1 h).
 */
export async function signedUrl(gcsUri, expiresSeconds = 3600) {
  const path = gcsUri.startsWith('gs://')
    ? gcsUri.replace(`gs://${BUCKET}/`, '')
    : gcsUri
  const [url] = await bucket.file(path).getSignedUrl({
    action:  'read',
    expires: Date.now() + expiresSeconds * 1000,
  })
  return url
}
