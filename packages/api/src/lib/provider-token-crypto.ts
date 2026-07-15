import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";
const KEY_ENV = "PROVIDER_TOKEN_ENCRYPTION_KEY";

export function hasProviderTokenEncryptionKey(): boolean {
  return Boolean(process.env[KEY_ENV]);
}

export function isEncryptedProviderToken(value: string): boolean {
  return value.startsWith(PREFIX);
}

function resolveKey(): Buffer {
  const encoded = process.env[KEY_ENV];
  if (!encoded) {
    throw new Error(`${KEY_ENV} is required to protect provider credentials`);
  }

  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) {
    throw new Error(`${KEY_ENV} must be a canonical base64-encoded 32-byte key`);
  }
  return key;
}

export function encryptProviderToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", resolveKey(), iv);
  cipher.setAAD(Buffer.from(PREFIX));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}:${ciphertext.toString("base64url")}:${tag.toString("base64url")}`;
}

export function decryptProviderToken(value: string): string {
  if (!value.startsWith("enc:")) {
    if (process.env.NODE_ENV === "production") resolveKey();
    return value;
  }
  if (!value.startsWith(PREFIX)) {
    throw new Error("Unsupported provider credential ciphertext version");
  }

  const parts = value.slice(PREFIX.length).split(":");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new Error("Malformed provider credential ciphertext");
  }

  try {
    const [ivPart, ciphertextPart, tagPart] = parts as [string, string, string];
    const iv = Buffer.from(ivPart, "base64url");
    const ciphertext = Buffer.from(ciphertextPart, "base64url");
    const tag = Buffer.from(tagPart, "base64url");
    if (iv.length !== 12 || tag.length !== 16) throw new Error("invalid envelope");
    const decipher = createDecipheriv("aes-256-gcm", resolveKey(), iv);
    decipher.setAAD(Buffer.from(PREFIX));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch (error) {
    if (error instanceof Error && error.message.includes(KEY_ENV)) throw error;
    throw new Error("Invalid provider credential ciphertext", { cause: error });
  }
}

export function decryptNullableProviderToken(value: string | null): string | null {
  return value === null ? null : decryptProviderToken(value);
}
