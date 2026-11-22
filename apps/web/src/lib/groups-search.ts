export const GROUP_SEARCH_MAX_LENGTH = 100;

export function normalizeGroupSearch(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const query = value.trim().slice(0, GROUP_SEARCH_MAX_LENGTH);
  return query || undefined;
}
