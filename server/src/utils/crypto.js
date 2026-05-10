import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Get encryption key from environment secret.
 * Pads or hashes to exactly 32 bytes.
 */
function getKey() {
  const secret = process.env.ENCRYPTION_SECRET || 'default-secret-change-me-please!';
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypt a plaintext string.
 * Returns a base64 string containing iv + tag + ciphertext.
 */
export function encrypt(text) {
  if (!text) return null;

  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  // Pack iv + tag + ciphertext into a single base64 string
  const packed = Buffer.concat([
    iv,
    tag,
    Buffer.from(encrypted, 'hex'),
  ]);

  return packed.toString('base64');
}

/**
 * Decrypt a base64 string back to plaintext.
 */
export function decrypt(encryptedBase64) {
  if (!encryptedBase64) return null;

  const key = getKey();
  const packed = Buffer.from(encryptedBase64, 'base64');

  const iv = packed.subarray(0, IV_LENGTH);
  const tag = packed.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertext, undefined, 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
