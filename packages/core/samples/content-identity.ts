export const SYSTEM_CONTENT_VERSION = 1 as const;

export type VersionedSystemContentDefinition<TContent> = {
  key: string;
  version: typeof SYSTEM_CONTENT_VERSION;
  contentHash: `v1:sha256:${string}`;
  content: TContent;
};

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createVersionedSystemContentDefinition<TContent>(input: {
  key: string;
  content: TContent;
}): Promise<VersionedSystemContentDefinition<TContent>> {
  const version = SYSTEM_CONTENT_VERSION;
  const encoded = new TextEncoder().encode(
    canonicalJson({ key: input.key, version, content: input.content }),
  );
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", encoded));
  return {
    key: input.key,
    version,
    contentHash: `v1:sha256:${hex(digest)}`,
    content: input.content,
  };
}
