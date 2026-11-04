import { createHash, randomInt, randomUUID } from 'node:crypto';
import { INVITE_ALPHABET } from '../../../shared/index';

export function randomCode(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  return out;
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function randomId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 20);
}

export function pairId(a: string, b: string): string {
  return [a, b].sort().join('_');
}

/** Pseudonymous identifier for logs; never log raw uids or tokens. */
export function uidHash(uid: string): string {
  return sha256(`uid:${uid}`).slice(0, 12);
}

export const secureRandomInt = (maxExclusive: number) => randomInt(maxExclusive);
