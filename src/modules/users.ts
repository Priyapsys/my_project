// ============================================================
//  USERS — Persisted credentials and roles
// ============================================================

import { randomBytes, scrypt as scryptCallback, timingSafeEqual, ScryptOptions } from 'crypto';
import { getDb } from '../db/connection';

function scryptAsync(
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

const KEY_LENGTH = 64;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

export type UserRole = 'user' | 'admin';

export interface UserRecord {
  user_id: string;
  password_hash: string;
  role: UserRole;
  created_at: Date;
  updated_at: Date;
}

export const DUMMY_PASSWORD_HASH =
  'scrypt$16384$8$1$MTIzNDU2Nzg5MDEyMzQ1Ng==$nPcLJQZ+zX347MOPfQ5QFfPgkicqL8TYDNC7d02s0XkwGVA9Iq9A12pjWvtkJV6t2dm765uC02qetOf+ONMg9Q==';

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await scryptAsync(password, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return ['scrypt', SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString('base64'), derivedKey.toString('base64')].join('$');
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  try {
    const [algorithm, n, r, p, saltText, keyText] = encodedHash.split('$');
    if (algorithm !== 'scrypt' || !n || !r || !p || !saltText || !keyText) return false;
    const expected = Buffer.from(keyText, 'base64');
    const actual = await scryptAsync(password, Buffer.from(saltText, 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export async function getUser(userId: string): Promise<UserRecord | undefined> {
  return await getDb()('users').where({ user_id: userId }).first() as UserRecord | undefined;
}

export async function createUser(userId: string, password: string, role: UserRole = 'user'): Promise<void> {
  await getDb()('users').insert({ user_id: userId, password_hash: await hashPassword(password), role });
}

export async function ensureUser(userId: string, password: string, role: UserRole = 'user'): Promise<void> {
  await getDb()('users').insert({ user_id: userId, password_hash: await hashPassword(password), role }).onConflict('user_id').ignore();
}
