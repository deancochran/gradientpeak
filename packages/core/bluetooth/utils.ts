export function toDataView(data: ArrayBuffer | Uint8Array): DataView {
  if (data instanceof Uint8Array) {
    return new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  return new DataView(data);
}

export function unsignedDeltaWithWrap(
  current: number,
  previous: number,
  bits: 8 | 16 | 32,
): number {
  const modulus = 2 ** bits;
  const normalizedCurrent =
    ((Math.trunc(current) % modulus) + modulus) % modulus;
  const normalizedPrevious =
    ((Math.trunc(previous) % modulus) + modulus) % modulus;

  if (normalizedCurrent >= normalizedPrevious) {
    return normalizedCurrent - normalizedPrevious;
  }

  return modulus - normalizedPrevious + normalizedCurrent;
}
