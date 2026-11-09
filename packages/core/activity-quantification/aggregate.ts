import {
  aggregateCommonLoad,
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
  type CommonLoadResult,
} from "../load/common-relative-load";
import {
  type ActivityDistance,
  type ActivityDurationValue,
  type ActivityObservationQuantification,
  type ActivityObservationSummary,
  type ActivityPrescriptionQuantification,
  type ActivityPrescriptionSummary,
  type ActivityQuantification,
  type ActivityQuantificationSummaryScope,
  type AggregateActivityQuantification,
  activityObservationQuantificationSchema,
  activityObservationSummarySchema,
  activityPrescriptionQuantificationSchema,
  activityPrescriptionSummarySchema,
  aggregateActivityDistanceSchema,
  aggregateActivityDurationSchema,
  aggregateActivityDurationValueSchema,
  aggregateActivityQuantificationSchema,
} from "./contracts";
import {
  type ActivityQuantificationParentSubjectIdentity,
  type ActivityQuantificationSubjectIdentity,
  createActivityQuantificationCalculationIdentity,
  createActivityQuantificationEvidenceIdentity,
  createCollectionActivityQuantificationSubjectIdentity,
} from "./identity";

type ActivityScalarQuantity = ActivityDurationValue | ActivityDistance;

/** Delivery/identity defect surfaced before any quantity can be totaled. */
export class DuplicateActivityQuantificationSubjectError extends Error {
  readonly subjectFingerprint: string;

  constructor(subjectFingerprint: string) {
    super(`Duplicate activity quantification subject identity: ${subjectFingerprint}`);
    this.name = DuplicateActivityQuantificationSubjectError.name;
    this.subjectFingerprint = subjectFingerprint;
  }
}

function stableFiniteSum(values: readonly number[]): number {
  return [...values].sort((left, right) => left - right).reduce((sum, value) => sum + value, 0);
}

function aggregateScalarQuantity(
  quantities: readonly ActivityScalarQuantity[],
  unit: "seconds" | "meters",
) {
  let availableCount = 0;
  let partialCount = 0;
  let unavailableCount = 0;
  const values: number[] = [];

  for (const quantity of quantities) {
    if (quantity.status === "available") {
      availableCount += 1;
      values.push(quantity.value);
    } else if (quantity.status === "partial") {
      partialCount += 1;
      values.push(quantity.value);
    } else {
      unavailableCount += 1;
    }
  }

  const counts = {
    evidenceRole: "derived",
    totalCount: quantities.length,
    availableCount,
    partialCount,
    unavailableCount,
  };
  if (values.length === 0) {
    return {
      status: "unavailable",
      ...counts,
      value: null,
      unit,
      reason: quantities.length === 0 ? "empty_input" : "no_available_values",
    };
  }
  if (availableCount === quantities.length) {
    return {
      status: "complete",
      ...counts,
      value: stableFiniteSum(values),
      unit,
    };
  }
  return {
    status: "partial",
    ...counts,
    value: stableFiniteSum(values),
    unit,
    reason: "incomplete_members",
  };
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function rejectDuplicateSubjects(items: readonly ActivityQuantification[]): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.subjectIdentity.fingerprint)) {
      throw new DuplicateActivityQuantificationSubjectError(item.subjectIdentity.fingerprint);
    }
    seen.add(item.subjectIdentity.fingerprint);
  }
}

function componentSummarySubject(
  items: readonly ActivityQuantification[],
): ActivityQuantificationParentSubjectIdentity {
  const first = items[0];
  if (
    first?.subjectIdentity.subjectType !== "segment" &&
    first?.subjectIdentity.subjectType !== "plan_occurrence"
  ) {
    throw new Error("Component aggregation requires nested component subject identities");
  }
  const parent = first.subjectIdentity.parentSubjectIdentity;
  const componentSubjectType = first.subjectIdentity.subjectType;
  for (const item of items) {
    if (
      item.subjectIdentity.subjectType !== componentSubjectType ||
      item.subjectIdentity.parentSubjectIdentity.fingerprint !== parent.fingerprint
    ) {
      throw new Error(
        "Component aggregation requires one component kind and one shared parent subject identity",
      );
    }
  }
  return parent;
}

function summarySubject(input: {
  items: readonly ActivityQuantification[];
  lifecycle: "prescription" | "observation";
  summaryScope: ActivityQuantificationSummaryScope;
}): ActivityQuantificationSubjectIdentity {
  return input.summaryScope === "components"
    ? componentSummarySubject(input.items)
    : createCollectionActivityQuantificationSubjectIdentity({
        lifecycle: input.lifecycle,
        memberSubjectIdentities: input.items.map((item) => item.subjectIdentity),
      });
}

/** Aggregates one lifecycle without converting missing or partial evidence to zero. */
function aggregateCanonicalQuantifications(input: {
  items: readonly ActivityQuantification[];
  lifecycle: "prescription" | "observation";
  summaryScope: ActivityQuantificationSummaryScope;
}): AggregateActivityQuantification {
  rejectDuplicateSubjects(input.items);
  const memberSubjectIdentities = input.items
    .map((item) => item.subjectIdentity)
    .sort((left, right) => compareText(left.fingerprint, right.fingerprint));
  const subjectIdentity = summarySubject(input);
  const evidenceIdentity = createActivityQuantificationEvidenceIdentity({
    evidenceType: "aggregate",
    sourceIds: input.items.map((item) => item.evidenceIdentity.fingerprint).sort(),
    revisionFingerprint: null,
    details: {
      lifecycle: input.lifecycle,
      summaryScope: input.summaryScope,
      memberEvidenceFingerprints: input.items
        .map((item) => item.evidenceIdentity.fingerprint)
        .sort(),
    },
  });
  const computedAts = [...new Set(input.items.map((item) => item.calculationIdentity.computedAt))];
  const calibrationEvidenceFingerprints = [
    ...new Set(input.items.map((item) => item.calculationIdentity.calibrationEvidenceFingerprint)),
  ];
  const calculationIdentity = createActivityQuantificationCalculationIdentity({
    model: COMMON_RELATIVE_LOAD_MODEL,
    version: COMMON_RELATIVE_LOAD_VERSION,
    computedAt: computedAts.length === 1 ? (computedAts[0] ?? null) : null,
    calibrationEvidenceFingerprint:
      calibrationEvidenceFingerprints.length === 1
        ? (calibrationEvidenceFingerprints[0] ?? null)
        : null,
    memberCalculationFingerprints: input.items.map((item) => item.calculationIdentity.fingerprint),
  });
  const activity_categories = [...new Set(input.items.map((item) => item.activity_category))].sort(
    compareText,
  );
  const duration = aggregateActivityDurationSchema.parse({
    elapsed: aggregateActivityDurationValueSchema.parse(
      aggregateScalarQuantity(
        input.items.map((item) => item.duration.elapsed),
        "seconds",
      ),
    ),
    active: aggregateActivityDurationValueSchema.parse(
      aggregateScalarQuantity(
        input.items.map((item) => item.duration.active),
        "seconds",
      ),
    ),
    moving: aggregateActivityDurationValueSchema.parse(
      aggregateScalarQuantity(
        input.items.map((item) => item.duration.moving),
        "seconds",
      ),
    ),
  });
  const distance = aggregateActivityDistanceSchema.parse(
    aggregateScalarQuantity(
      input.items.map((item) => item.distance),
      "meters",
    ),
  );
  const commonLoadInputs: CommonLoadResult[] = input.items.map((item) => item.commonLoad);
  const commonLoad = aggregateCommonLoad(commonLoadInputs);

  return aggregateActivityQuantificationSchema.parse({
    kind: "aggregate",
    lifecycle: input.lifecycle,
    summaryScope: input.summaryScope,
    subjectIdentity,
    evidenceIdentity,
    calculationIdentity,
    memberSubjectIdentities,
    activity_categories,
    duration,
    distance,
    commonLoad,
  });
}

export function aggregatePrescriptions(
  input: readonly ActivityPrescriptionQuantification[],
  options: { summaryScope?: ActivityQuantificationSummaryScope | undefined } = {},
): ActivityPrescriptionSummary {
  const items = input.map((item) => activityPrescriptionQuantificationSchema.parse(item));
  const aggregate = aggregateCanonicalQuantifications({
    items,
    lifecycle: "prescription",
    summaryScope: options.summaryScope ?? "collection",
  });
  return activityPrescriptionSummarySchema.parse(aggregate);
}

export function aggregateObservations(
  input: readonly ActivityObservationQuantification[],
  options: { summaryScope?: ActivityQuantificationSummaryScope | undefined } = {},
): ActivityObservationSummary {
  const items = input.map((item) => activityObservationQuantificationSchema.parse(item));
  const aggregate = aggregateCanonicalQuantifications({
    items,
    lifecycle: "observation",
    summaryScope: options.summaryScope ?? "collection",
  });
  return activityObservationSummarySchema.parse(aggregate);
}
