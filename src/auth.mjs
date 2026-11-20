import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const deriveKey = promisify(scrypt);

export const randomToken = () => randomBytes(32).toString('hex');
export const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await deriveKey(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = await deriveKey(password, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}
