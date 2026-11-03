const initialHash = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
] as const;

const roundConstants = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

const rotateRight = (value: number, amount: number) =>
  (value >>> amount) | (value << (32 - amount));

function requiredNumber(values: ArrayLike<number>, index: number): number {
  const value = values[index];
  if (value === undefined) throw new RangeError(`Missing SHA-256 word at index ${index}`);
  return value;
}

/** Synchronously hashes UTF-8 text without platform-specific crypto dependencies. */
export function sha256Hex(value: string): string {
  const source = new TextEncoder().encode(value);
  const bitLengthHigh = Math.floor(source.length / 0x20000000) >>> 0;
  const bitLengthLow = (source.length << 3) >>> 0;
  const paddedLength = Math.ceil((source.length + 1 + 8) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(source);
  bytes[source.length] = 0x80;
  const view = new DataView(bytes.buffer);
  view.setUint32(paddedLength - 8, bitLengthHigh, false);
  view.setUint32(paddedLength - 4, bitLengthLow, false);

  const hash: number[] = [...initialHash];
  const words = new Uint32Array(64);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1)
      words[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 64; index += 1) {
      const x = requiredNumber(words, index - 15);
      const y = requiredNumber(words, index - 2);
      words[index] =
        (((rotateRight(x, 7) ^ rotateRight(x, 18) ^ (x >>> 3)) +
          requiredNumber(words, index - 16)) |
          0) +
        ((rotateRight(y, 17) ^ rotateRight(y, 19) ^ (y >>> 10)) + requiredNumber(words, index - 7));
    }

    let a = requiredNumber(hash, 0);
    let b = requiredNumber(hash, 1);
    let c = requiredNumber(hash, 2);
    let d = requiredNumber(hash, 3);
    let e = requiredNumber(hash, 4);
    let f = requiredNumber(hash, 5);
    let g = requiredNumber(hash, 6);
    let h = requiredNumber(hash, 7);
    for (let index = 0; index < 64; index += 1) {
      const sigma1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 =
        (h +
          sigma1 +
          choice +
          requiredNumber(roundConstants, index) +
          requiredNumber(words, index)) |
        0;
      const sigma0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sigma0 + majority) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) | 0;
    }
    hash[0] = (requiredNumber(hash, 0) + a) | 0;
    hash[1] = (requiredNumber(hash, 1) + b) | 0;
    hash[2] = (requiredNumber(hash, 2) + c) | 0;
    hash[3] = (requiredNumber(hash, 3) + d) | 0;
    hash[4] = (requiredNumber(hash, 4) + e) | 0;
    hash[5] = (requiredNumber(hash, 5) + f) | 0;
    hash[6] = (requiredNumber(hash, 6) + g) | 0;
    hash[7] = (requiredNumber(hash, 7) + h) | 0;
  }

  return hash.map((word) => (word >>> 0).toString(16).padStart(8, "0")).join("");
}

/** Derives a stable RFC 4122 version-5-shaped UUID from a SHA-256 digest. */
export function sha256Uuid(value: string): string {
  const digest = sha256Hex(value);
  const variant = ((Number.parseInt(digest.slice(16, 18), 16) & 0x3f) | 0x80)
    .toString(16)
    .padStart(2, "0");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-${variant}${digest.slice(18, 20)}-${digest.slice(20, 32)}`;
}
