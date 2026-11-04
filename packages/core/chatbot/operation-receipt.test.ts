import { describe, expect, it } from "vitest";
import { canonicalJson, receiptFingerprint } from "./operation-receipt";

describe("operation receipt fingerprint", () => {
  it("is stable across object key order and excludes undefined drafts", async () => {
    expect(canonicalJson({ b: 1, a: { z: undefined, y: "x" } })).toBe('{"a":{"y":"x"},"b":1}');
    await expect(
      receiptFingerprint("chatbot.activity.update", { b: 1, a: 2 }, async () => "a".repeat(64)),
    ).resolves.toBe(`v1:sha256:${"a".repeat(64)}`);
  });

  it("rejects values that cannot have portable semantic identity", () => {
    expect(() => canonicalJson({ value: Number.NaN })).toThrow("finite");
    expect(() => canonicalJson({ value: BigInt(1) })).toThrow("JSON-compatible");
    expect(() => canonicalJson({ value: new Date() })).toThrow("plain JSON");
    expect(() => canonicalJson({ value: new Map() })).toThrow("plain JSON");
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    expect(() => canonicalJson(cycle)).toThrow("cycles");
  });

  it("retains own proto-named fields without prototype collisions", () => {
    const value = Object.create(null) as Record<string, unknown>;
    value.__proto__ = "literal";
    expect(canonicalJson(value)).toBe('{"__proto__":"literal"}');
  });
});
