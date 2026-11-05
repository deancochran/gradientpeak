export type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | CanonicalJson[]
  | { [key: string]: CanonicalJson };

/** Normalizes JSON-compatible input by sorting object keys recursively. */
export function normalizeCanonicalJson(value: unknown): CanonicalJson {
  const ancestors = new WeakSet<object>();

  const normalize = (candidate: unknown): CanonicalJson => {
    if (candidate === null || typeof candidate === "boolean" || typeof candidate === "string") {
      return candidate;
    }

    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate)) {
        throw new TypeError("Canonical JSON does not support non-finite numbers");
      }

      return Object.is(candidate, -0) ? 0 : candidate;
    }

    if (Array.isArray(candidate)) {
      return normalizeContainer(candidate, () => candidate.map(normalize));
    }

    if (typeof candidate === "object") {
      const prototype = Object.getPrototypeOf(candidate);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError("Canonical JSON only supports plain objects");
      }

      if (Object.getOwnPropertySymbols(candidate).length > 0) {
        throw new TypeError("Canonical JSON does not support symbol keys");
      }

      return normalizeContainer(candidate, () => {
        const normalized: Record<string, CanonicalJson> = Object.create(null);

        for (const key of Object.keys(candidate).sort()) {
          normalized[key] = normalize((candidate as Record<string, unknown>)[key]);
        }

        return normalized;
      });
    }

    throw new TypeError(`Canonical JSON does not support ${typeof candidate}`);
  };

  function normalizeContainer(container: object, callback: () => CanonicalJson): CanonicalJson {
    if (ancestors.has(container)) {
      throw new TypeError("Canonical JSON does not support cyclic arrays or objects");
    }

    ancestors.add(container);
    try {
      return callback();
    } finally {
      ancestors.delete(container);
    }
  }

  return normalize(value);
}

export function stringifyCanonicalJson(value: unknown): string {
  return JSON.stringify(normalizeCanonicalJson(value));
}

/**
 * Produces a portable deterministic fingerprint for a canonical JSON value.
 * This is an identity aid, not a cryptographic integrity primitive.
 */
export function fingerprintCanonicalJson(value: unknown): string {
  const canonical = stringifyCanonicalJson(value);
  let hash = 0x811c9dc5;

  for (const byte of new TextEncoder().encode(canonical)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }

  return `fnv1a-32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
