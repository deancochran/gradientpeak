import { createHash } from "node:crypto";

export function canonicalFixtureJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("E2E fixture contains a non-finite number.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalFixtureJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalFixtureJson(nested)}`)
      .join(",")}}`;
  }
  throw new Error(`E2E fixture contains unsupported ${typeof value}.`);
}

export function fixtureStructureHash(structure: unknown) {
  return `v1:sha256:${createHash("sha256").update(canonicalFixtureJson(structure)).digest("hex")}`;
}
