// ============================================================
//  USERS — Persisted credentials and roles
// ============================================================

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { getDb } from '../db/connection';

const scrypt = promisify(scryptCallback);
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

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = (await scrypt(password, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })) as Buffer;
  return ['scrypt', SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString('base64'), derivedKey.toString('base64')].join('$');
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  try {
    const [algorithm, n, r, p, saltText, keyText] = encodedHash.split('$');
    if (algorithm !== 'scrypt' || !n || !r || !p || !saltText || !keyText) return false;
    const expected = Buffer.from(keyText, 'base64');
    const actual = (await scrypt(password, Buffer.from(saltText, 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p) })) as Buffer;
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export async function getUser(userId: string): Promise<UserRecord | undefined> {
  return await getDb()('users').where({ user_id: userId }).first() as UserRecord | undefined;
}

export async function createUser(userId: string, password: string, role: UserRole = 'user'): Promise<void> {
  await getDb('users').insert({ user_id: userId, password_hash: await hashPassword(password), role });
}

export async function ensureUser(userId: string, password: string, role: UserRole = 'user'): Promise<void> {
  await getDb('users').insert({ user_id: userId, password_hash: await hashPassword(password), role }).onConflict('user_id').ignore();
}
