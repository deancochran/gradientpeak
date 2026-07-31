import { mobileWebJourneyDomains } from "../contracts/mobile-web-journeys";
import { futureJourneyExecutorEntries } from "./executors";
import { futureJourneyBlueprints } from "./registry";
import type { FutureJourneyBlueprint } from "./types";

export const canonicalFutureJourneys = mobileWebJourneyDomains.flatMap((domain) =>
  domain.journeys.map((journey) => ({
    domainId: domain.id,
    domainTitle: domain.title,
    id: journey.id,
    title: journey.title,
  })),
);

export const canonicalFutureJourneyById = new Map(
  canonicalFutureJourneys.map((journey) => [journey.id, journey] as const),
);

export function assertFutureJourneyRegistry(): void {
  const canonicalIds = canonicalFutureJourneys.map((journey) => journey.id);
  const blueprintIds = futureJourneyBlueprints.map((blueprint) => blueprint.id);
  const canonicalDuplicates = duplicateValues(canonicalIds);
  const blueprintDuplicates = duplicateValues(blueprintIds);
  const executorIds = futureJourneyExecutorEntries.map(([id]) => id);

  assertEmpty(canonicalDuplicates, "duplicate canonical journey IDs");
  assertEmpty(blueprintDuplicates, "duplicate future-red blueprint IDs");
  assertEmpty(duplicateValues(executorIds), "duplicate future-red executor IDs");

  const canonicalIdSet = new Set(canonicalIds);
  const blueprintIdSet = new Set(blueprintIds);
  const missingBlueprints = canonicalIds.filter((id) => !blueprintIdSet.has(id));
  const extraBlueprints = blueprintIds.filter((id) => !canonicalIdSet.has(id));
  const extraExecutors = executorIds.filter((id) => !canonicalIdSet.has(id));

  assertEmpty(missingBlueprints, "canonical journeys without future-red blueprints");
  assertEmpty(extraBlueprints, "future-red blueprints without canonical journeys");
  assertEmpty(extraExecutors, "future-red executors without canonical journeys");

  if (canonicalIds.length !== blueprintIds.length) {
    throw new Error(
      `Future-red registry size mismatch: ${blueprintIds.length} blueprints for ${canonicalIds.length} canonical journeys.`,
    );
  }

  for (const blueprint of futureJourneyBlueprints) {
    assertBlueprintContract(blueprint);
  }
}

function assertBlueprintContract(blueprint: FutureJourneyBlueprint): void {
  if (!blueprint.path.startsWith("/")) {
    throw new Error(`${blueprint.id}: path must be application-relative and begin with '/'.`);
  }

  assertNonBlank(blueprint.id, `${blueprint.id}: id`);
  assertNonBlankValues(blueprint.prerequisites, `${blueprint.id}: prerequisites`);
  assertNonBlankValues(blueprint.acceptance, `${blueprint.id}: acceptance`);

  const checkpointPurposes = blueprint.checkpoints.map((checkpoint) => checkpoint.purpose);
  assertNonBlankValues(checkpointPurposes, `${blueprint.id}: checkpoint purposes`);
  assertEmpty(
    duplicateValues(checkpointPurposes),
    `${blueprint.id}: duplicate checkpoint purposes`,
  );

  for (const checkpoint of blueprint.checkpoints) {
    if (checkpoint.kind === "role") {
      assertNonBlank(checkpoint.name, `${blueprint.id}: role checkpoint name`);
    } else {
      assertNonBlank(checkpoint.value, `${blueprint.id}: ${checkpoint.kind} checkpoint value`);
    }
  }

  if (blueprint.viewport) {
    if (blueprint.viewport.height <= 0 || blueprint.viewport.width <= 0) {
      throw new Error(`${blueprint.id}: viewport dimensions must be positive.`);
    }
  }
}

function assertNonBlankValues(values: readonly string[], description: string): void {
  for (const value of values) {
    assertNonBlank(value, description);
  }
}

function assertNonBlank(value: string, description: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${description} contains a blank value.`);
  }
}

function assertEmpty(values: readonly string[], description: string): void {
  if (values.length > 0) {
    throw new Error(`${description}: ${values.join(", ")}`);
  }
}

function duplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }

  return [...duplicates].sort();
}
