import { randomInt } from 'crypto';

// 32 chars: dropped 0, O, 1, I, L to avoid ambiguity.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const KEY_PATTERN = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

export function isValidKeyFormat(s: string): boolean {
  return typeof s === 'string' && KEY_PATTERN.test(s);
}

/** Generate a single XXXX-XXXX key, no collision check. */
export function generateAccessKey(): string {
  const part = (): string => {
    let out = '';
    for (let i = 0; i < 4; i++) {
      out += ALPHABET[randomInt(0, ALPHABET.length)];
    }
    return out;
  };
  return `${part()}-${part()}`;
}

/**
 * Generate a unique key, retrying on collision. `exists` is async so it can
 * query the DB. Caps at `maxAttempts` to avoid infinite loops.
 */
export async function generateUniqueAccessKey(
  exists: (key: string) => Promise<boolean>,
  maxAttempts = 10
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = generateAccessKey();
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error('Failed to generate a unique access key after multiple attempts.');
}
