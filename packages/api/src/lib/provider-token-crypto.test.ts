import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decryptProviderToken,
  encryptProviderToken,
  hasProviderTokenEncryptionKey,
  isEncryptedProviderToken,
} from "./provider-token-crypto";

const KEY = Buffer.alloc(32, 7).toString("base64");

describe("provider token encryption", () => {
  beforeEach(() => vi.stubEnv("PROVIDER_TOKEN_ENCRYPTION_KEY", KEY));
  afterEach(() => vi.unstubAllEnvs());

  it("round trips authenticated versioned ciphertext", () => {
    const encrypted = encryptProviderToken("secret-access-token");
    expect(encrypted).toMatch(/^enc:v1:/);
    expect(encrypted).not.toContain("secret-access-token");
    expect(isEncryptedProviderToken(encrypted)).toBe(true);
    expect(hasProviderTokenEncryptionKey()).toBe(true);
    expect(decryptProviderToken(encrypted)).toBe("secret-access-token");
  });

  it("fails closed for plaintext credentials", () => {
    expect(() => decryptProviderToken("legacy-plaintext-token")).toThrow(
      "Provider credential must use the encrypted envelope",
    );
  });

  it("rejects malformed or tampered ciphertext", () => {
    expect(() => decryptProviderToken("enc:v1:not-valid")).toThrow(
      "Malformed provider credential ciphertext",
    );
    const encrypted = encryptProviderToken("secret-access-token");
    const [prefix, version, iv, ciphertext, tag] = encrypted.split(":") as [
      string,
      string,
      string,
      string,
      string,
    ];
    const tampered = `${prefix}:${version}:${iv}:${ciphertext.startsWith("A") ? "B" : "A"}${ciphertext.slice(1)}:${tag}`;
    expect(() => decryptProviderToken(tampered)).toThrow("Invalid provider credential ciphertext");
  });

  it("requires the encryption key for encrypted credentials", () => {
    vi.stubEnv("PROVIDER_TOKEN_ENCRYPTION_KEY", "");
    expect(() => decryptProviderToken(encryptProviderToken("legacy-plaintext-token"))).toThrow(
      "PROVIDER_TOKEN_ENCRYPTION_KEY is required",
    );
    expect(() => encryptProviderToken("new-token")).toThrow(
      "PROVIDER_TOKEN_ENCRYPTION_KEY is required",
    );
  });
});
