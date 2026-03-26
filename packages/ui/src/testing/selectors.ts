export const SELECTOR_KEYS = new Set(["accessibilityLabel", "id", "role", "testId"]);

export type JsonLike = string | number | boolean | null | JsonLike[] | { [key: string]: JsonLike };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSelectorKey(key: string) {
  return (
    SELECTOR_KEYS.has(key) ||
    key.endsWith("Id") ||
    key.endsWith("Ids") ||
    key.endsWith("TestId") ||
    key.endsWith("TestIds")
  );
}

function extractSelectorValue(value: unknown): JsonLike | undefined {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    const items = value
      .map((item) => extractSelectorValue(item))
      .filter((item): item is JsonLike => item !== undefined);

    return items.length > 0 ? items : undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const entries = Object.entries(value).flatMap(([key, nestedValue]) => {
    const extracted = extractSelectorValue(nestedValue);
    return extracted === undefined ? [] : [[key, extracted] as const];
  });

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function extractSelectors(value: unknown): JsonLike | undefined {
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    const items = value
      .map((item) => extractSelectors(item))
      .filter((item): item is JsonLike => item !== undefined);

    return items.length > 0 ? items : undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const entries = Object.entries(value).flatMap(([key, nestedValue]) => {
    if (isSelectorKey(key)) {
      const extracted = extractSelectorValue(nestedValue);
      return extracted === undefined ? [] : [[key, extracted] as const];
    }

    const extracted = extractSelectors(nestedValue);
    return extracted === undefined ? [] : [[key, extracted] as const];
  });

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}
