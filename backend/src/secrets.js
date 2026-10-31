import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// Encrypts secrets we must store, like a Gmail App Password, so a database leak alone does not expose them.
// AES-256-GCM. The key comes from SECRET_KEY (set it in production), or else is derived from JWT_SECRET.
// Changing the key makes stored secrets unreadable, so people would have to reconnect.
const key = () => createHash('sha256').update(process.env.SECRET_KEY || process.env.JWT_SECRET || '').digest();

export function encrypt(text) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}

export function decrypt(token) {
  const raw = Buffer.from(String(token), 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}
