/*
 * Password hashing with PBKDF2-HMAC-SHA256, in plain TypeScript so it runs the same on
 * Android, iOS, web and in the Node test suite without a native module.
 * Stored format: "pbkdf2-sha256$<iterations>$<hex hash>" plus a per-user hex salt.
 */

export const PBKDF2_ITERATIONS = 10_000;

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

function rotr(x: number, n: number) {
  return (x >>> n) | (x << (32 - n));
}

/** One SHA-256 block: w[0..15] holds the block's words; w is used as scratch space. */
function compress(h: Uint32Array, w: Uint32Array) {
  for (let i = 16; i < 64; i++) {
    const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
    const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
    w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
  }
  let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
  for (let i = 0; i < 64; i++) {
    const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
    const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
    hh = g;
    g = f;
    f = e;
    e = (d + t1) >>> 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) >>> 0;
  }
  h[0] += a;
  h[1] += b;
  h[2] += c;
  h[3] += d;
  h[4] += e;
  h[5] += f;
  h[6] += g;
  h[7] += hh;
}

export function sha256(data: Uint8Array): Uint8Array {
  const h = new Uint32Array(H0);
  const paddedLength = Math.ceil((data.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor((data.length * 8) / 2 ** 32));
  view.setUint32(paddedLength - 4, (data.length * 8) >>> 0);

  const w = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    compress(h, w);
  }
  return wordsToBytes(h);
}

function wordsToBytes(words: Uint32Array) {
  const out = new Uint8Array(words.length * 4);
  const view = new DataView(out.buffer);
  words.forEach((word, i) => view.setUint32(i * 4, word));
  return out;
}

function hmacSha256(key: Uint8Array, message: Uint8Array) {
  const block = new Uint8Array(64);
  block.set(key.length > 64 ? sha256(key) : key);
  const inner = new Uint8Array(64 + message.length);
  const outer = new Uint8Array(64 + 32);
  for (let i = 0; i < 64; i++) {
    inner[i] = block[i] ^ 0x36;
    outer[i] = block[i] ^ 0x5c;
  }
  inner.set(message, 64);
  outer.set(sha256(inner), 64);
  return sha256(outer);
}

/** SHA-256 state after absorbing the 64-byte HMAC key block XOR pad. */
function padState(key: Uint8Array, pad: number) {
  const block = new Uint8Array(64);
  block.set(key.length > 64 ? sha256(key) : key);
  const view = new DataView(block.buffer);
  const w = new Uint32Array(64);
  for (let i = 0; i < 16; i++) w[i] = (view.getUint32(i * 4) ^ (pad * 0x01010101)) >>> 0;
  const h = new Uint32Array(H0);
  compress(h, w);
  return h;
}

/**
 * PBKDF2-HMAC-SHA256 with a single 32-byte output block. After the first round every HMAC input is
 * a 32-byte digest, so the inner and outer key states are computed once and each round costs two
 * block compressions with no allocations (fast enough for Hermes on a phone).
 */
export function pbkdf2Sha256(password: Uint8Array, salt: Uint8Array, iterations: number): Uint8Array {
  const first = new Uint8Array(salt.length + 4);
  first.set(salt);
  first[salt.length + 3] = 1;
  const u1 = new DataView(hmacSha256(password, first).buffer);

  const innerKey = padState(password, 0x36);
  const outerKey = padState(password, 0x5c);
  const u = new Uint32Array(8);
  for (let i = 0; i < 8; i++) u[i] = u1.getUint32(i * 4);
  const result = u.slice();
  const h = new Uint32Array(8);
  const w = new Uint32Array(64);

  for (let iter = 1; iter < iterations; iter++) {
    // Inner hash of the previous U: 32 bytes of data + padding, total length (64 + 32) bytes.
    h.set(innerKey);
    w.set(u);
    w[8] = 0x80000000;
    w.fill(0, 9, 15);
    w[15] = (64 + 32) * 8;
    compress(h, w);
    // Outer hash of the inner digest.
    w.set(h);
    h.set(outerKey);
    w[8] = 0x80000000;
    w.fill(0, 9, 15);
    w[15] = (64 + 32) * 8;
    compress(h, w);
    u.set(h);
    for (let j = 0; j < 8; j++) result[j] ^= u[j];
  }
  return wordsToBytes(result);
}

export function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function utf8(text: string) {
  return new TextEncoder().encode(text);
}

/**
 * A salt only has to be unique, not secret. Uses crypto.getRandomValues where the runtime has it,
 * otherwise Math.random mixed with the clock.
 */
export function newSalt(): string {
  const bytes = new Uint8Array(16);
  const cryptoApi = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (cryptoApi?.getRandomValues) cryptoApi.getRandomValues(bytes);
  else {
    const now = Date.now();
    for (let i = 0; i < bytes.length; i++) bytes[i] = (Math.random() * 256) ^ ((now >>> (i % 4) * 8) & 0xff);
  }
  return toHex(bytes);
}

export function hashPassword(password: string, salt: string, iterations = PBKDF2_ITERATIONS) {
  return `pbkdf2-sha256$${iterations}$${toHex(pbkdf2Sha256(utf8(password), fromHex(salt), iterations))}`;
}

export function verifyPassword(password: string, salt: string, stored: string) {
  const [scheme, iterations] = stored.split('$');
  if (scheme !== 'pbkdf2-sha256' || !Number(iterations)) return false;
  const candidate = hashPassword(password, salt, Number(iterations));
  // Constant-time comparison.
  let diff = candidate.length ^ stored.length;
  for (let i = 0; i < Math.min(candidate.length, stored.length); i++) diff |= candidate.charCodeAt(i) ^ stored.charCodeAt(i);
  return diff === 0;
}

export function passwordProblem(password: string): string | null {
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Use at least 8 characters with a letter and a number.';
  }
  return null;
}
