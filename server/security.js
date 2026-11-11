import crypto from 'node:crypto';

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password, salt, expected) {
  try {
    const actual = crypto.scryptSync(password, salt, 64);
    const target = Buffer.from(expected, 'hex');
    return actual.length === target.length && crypto.timingSafeEqual(actual, target);
  } catch {
    return false;
  }
}

export function randomId() {
  return crypto.randomUUID();
}

export function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}
