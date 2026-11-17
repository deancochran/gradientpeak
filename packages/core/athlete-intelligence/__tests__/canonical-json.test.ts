import { describe, expect, it } from "vitest";

import { fingerprintCanonicalJson, normalizeCanonicalJson } from "../canonical-json";

describe("canonical JSON", () => {
  it("fingerprints semantically equivalent object key ordering identically", () => {
    expect(fingerprintCanonicalJson({ b: [2, { z: true, a: null }], a: 1 })).toBe(
      fingerprintCanonicalJson({ a: 1, b: [2, { a: null, z: true }] }),
    );
  });

  it("hashes canonical UTF-8 bytes using known FNV-1a vectors", () => {
    expect(fingerprintCanonicalJson("hello")).toBe("fnv1a-32:df47ee8b");
    expect(fingerprintCanonicalJson("é")).toBe("fnv1a-32:6dd86cf9");
  });

  it.each([
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    () => undefined,
    Symbol("unsupported"),
    new Date("2026-07-09T12:00:00.000Z"),
    new Map(),
    { value: undefined },
    { [Symbol("unsupported")]: true },
  ])("rejects unsupported canonical JSON input: %s", (value) => {
    expect(() => normalizeCanonicalJson(value)).toThrow(TypeError);
  });

  it("rejects cyclic arrays and plain objects with a TypeError", () => {
    const cyclicArray: unknown[] = [];
    cyclicArray.push(cyclicArray);
    const cyclicObject: { self?: unknown } = {};
    cyclicObject.self = cyclicObject;

    for (const value of [cyclicArray, cyclicObject]) {
      expect(() => normalizeCanonicalJson(value)).toThrow(TypeError);
      expect(() => normalizeCanonicalJson(value)).toThrow(/cyclic arrays or objects/i);
    }
  });
});
