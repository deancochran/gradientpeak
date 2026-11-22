/**
 * A small, runtime-neutral representation of the request identity used by
 * durable command receipts.  Hosts must generate `operationId` once and reuse
 * it with the exact same semantic arguments when retrying a lost response.
 */
export type ChatbotCanonicalJson =
  | null
  | boolean
  | number
  | string
  | ChatbotCanonicalJson[]
  | { [key: string]: ChatbotCanonicalJson };

function canonicalize(value: unknown, ancestors = new WeakSet<object>()): ChatbotCanonicalJson {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Receipt input must contain finite numbers");
    return value;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new TypeError("Receipt input must not contain cycles");
    ancestors.add(value);
    try {
      return value.map((item) => canonicalize(item, ancestors));
    } finally {
      ancestors.delete(value);
    }
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const prototype = Object.getPrototypeOf(record);
    if (prototype !== Object.prototype && prototype !== null)
      throw new TypeError("Receipt input must contain plain JSON objects");
    if (ancestors.has(record)) throw new TypeError("Receipt input must not contain cycles");
    ancestors.add(record);
    try {
      // Undefined object properties intentionally omit. A null prototype preserves
      // own `__proto__` fields without mutating an intermediate object's prototype.
      const normalized = Object.create(null) as Record<string, ChatbotCanonicalJson>;
      for (const key of Object.keys(record).sort()) {
        const item = record[key];
        if (item === undefined) continue;
        normalized[key] = canonicalize(item, ancestors);
      }
      return normalized;
    } finally {
      ancestors.delete(record);
    }
  }
  throw new TypeError("Receipt input must be JSON-compatible");
}

/** Stable JSON serialization for semantic command inputs (excluding operationId). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/**
 * SHA-256 is intentionally injected: Core stays portable to web, native, and
 * server runtimes while the API host supplies its platform crypto primitive.
 */
export async function receiptFingerprint(
  command: string,
  semanticInput: unknown,
  sha256: (text: string) => Promise<string>,
): Promise<string> {
  if (!/^[a-z][a-z0-9_.-]{1,80}$/.test(command)) throw new TypeError("Invalid receipt command");
  const digest = await sha256(`v1:${command}:${canonicalJson(semanticInput)}`);
  if (!/^[0-9a-f]{64}$/.test(digest)) throw new TypeError("Receipt hash must be lowercase SHA-256");
  return `v1:sha256:${digest}`;
}
