import { z } from "zod";

const uuidSchema = z.string().uuid();

const MAX_HANDOVER_ENGAGEMENTS = 100;
const MAX_HANDOVER_RESOURCES = 100;
const MAX_HANDOVER_RECEIPTS = 400;

/**
 * A plan identifies only organization-owned work. Profile-owned or system-owned
 * resources are intentionally not represented as item identifiers here.
 */
export const organizationHandoverResourceSchema = z
  .object({
    resourceId: uuidSchema,
    disposition: z.enum(["retained", "transferred"]),
  })
  .strict()
  .readonly();
export type OrganizationHandoverResource = z.infer<typeof organizationHandoverResourceSchema>;

/**
 * Canonical identity of one immutable handover operation revision. Evidence is
 * bound to these concrete fields rather than to an opaque caller-supplied digest.
 */
export const handoverScopeSchema = z
  .object({
    operationKind: z.literal("coaching_handover"),
    operationId: uuidSchema,
    revision: z.number().int().positive().max(1_000_000),
    organizationId: uuidSchema,
    departingProfileId: uuidSchema,
    receivingProfileId: uuidSchema,
    selectedEngagementIds: z.array(uuidSchema).max(MAX_HANDOVER_ENGAGEMENTS).readonly(),
    organizationResources: z
      .array(organizationHandoverResourceSchema)
      .max(MAX_HANDOVER_RESOURCES)
      .readonly(),
  })
  .strict()
  .superRefine((plan, ctx) => {
    if (
      plan.organizationId === plan.departingProfileId ||
      plan.organizationId === plan.receivingProfileId ||
      plan.departingProfileId === plan.receivingProfileId
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Organization, departing, and receiving identities must be distinct",
      });
    }

    const engagementIds = new Set<string>();
    for (const engagementId of plan.selectedEngagementIds) {
      if (engagementIds.has(engagementId)) {
        ctx.addIssue({ code: "custom", message: "Selected engagement IDs must be unique" });
        return;
      }
      engagementIds.add(engagementId);
    }

    const resourceIds = new Set<string>();
    for (const resource of plan.organizationResources) {
      if (resourceIds.has(resource.resourceId)) {
        ctx.addIssue({ code: "custom", message: "Organization resource IDs must be unique" });
        return;
      }
      resourceIds.add(resource.resourceId);
    }
  })
  .readonly();
export type HandoverScope = z.infer<typeof handoverScopeSchema>;

/** The plan is the immutable operation scope that all assessment evidence must match. */
export const handoverPlanSchema = handoverScopeSchema;
export type HandoverPlan = HandoverScope;

/**
 * Inventory intentionally records only whether personal and system resources
 * were excluded. It never accepts an inventory of profile-owned private assets.
 */
export const handoverInventorySchema = z
  .object({
    scope: handoverScopeSchema,
    status: z.enum(["resolved", "incomplete", "unavailable"]),
    excludedResourceClasses: z
      .array(z.enum(["personal", "system"]))
      .max(2)
      .readonly(),
  })
  .strict()
  .superRefine((inventory, ctx) => {
    if (
      new Set(inventory.excludedResourceClasses).size !== inventory.excludedResourceClasses.length
    ) {
      ctx.addIssue({ code: "custom", message: "Excluded resource classes must be unique" });
    }
    if (
      inventory.status === "resolved" &&
      (inventory.excludedResourceClasses.length !== 2 ||
        !inventory.excludedResourceClasses.includes("personal") ||
        !inventory.excludedResourceClasses.includes("system"))
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Resolved inventory must exclude both personal and system resource classes",
      });
    }
  })
  .readonly();
export type HandoverInventory = z.infer<typeof handoverInventorySchema>;

export const handoverTransferItemSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("engagement"), itemId: uuidSchema })
    .strict()
    .readonly(),
  z
    .object({ kind: z.literal("organization_resource"), itemId: uuidSchema })
    .strict()
    .readonly(),
]);
export type HandoverTransferItem = z.infer<typeof handoverTransferItemSchema>;

/** A receipt is evidence to assess, never an authorization grant. */
export const handoverReceiptSchema = z
  .object({
    receiptId: uuidSchema,
    scope: handoverScopeSchema,
    item: handoverTransferItemSchema,
    status: z.enum(["confirmed", "failed", "unknown", "pending"]),
  })
  .strict()
  .readonly();
export type HandoverReceipt = z.infer<typeof handoverReceiptSchema>;

export const handoverOldAccessStatusSchema = z.enum(["active", "suspended", "revoked", "unknown"]);

export const handoverRevocationSchema = z
  .object({
    scope: handoverScopeSchema,
    state: z.enum(["pending", "confirmed", "failed", "unknown"]),
    oldAccessStatus: handoverOldAccessStatusSchema,
  })
  .strict()
  .readonly();
export type HandoverRevocation = z.infer<typeof handoverRevocationSchema>;

export const handoverAssessmentInputSchema = z
  .object({
    plan: handoverPlanSchema,
    inventory: handoverInventorySchema,
    receipts: z.array(handoverReceiptSchema).max(MAX_HANDOVER_RECEIPTS).readonly(),
    revocation: handoverRevocationSchema,
  })
  .strict()
  .readonly();
export type HandoverAssessmentInput = z.infer<typeof handoverAssessmentInputSchema>;

export const HANDOVER_ASSESSMENT_ISSUES = [
  "empty_plan",
  "scope_mismatch",
  "foreign_receipt_item",
  "conflicting_receipt_replay",
  "inventory_incomplete",
  "inventory_unavailable",
  "transfer_failed",
  "transfer_unknown",
  "transfer_pending",
  "revocation_pending",
  "revocation_failed",
  "revocation_unknown",
  "revocation_access_conflict",
] as const;
export const handoverAssessmentIssueSchema = z.enum(HANDOVER_ASSESSMENT_ISSUES);
export type HandoverAssessmentIssue = z.infer<typeof handoverAssessmentIssueSchema>;

export const handoverItemAssessmentSchema = z
  .object({
    item: handoverTransferItemSchema,
    status: z.enum(["confirmed", "failed", "unknown", "pending"]),
  })
  .strict()
  .readonly();
export type HandoverItemAssessment = z.infer<typeof handoverItemAssessmentSchema>;

/** Strict, advisory output; this result is never an authorization decision. */
export const handoverAssessmentSchema = z
  .object({
    authority: z.literal("assessment_only"),
    overallStatus: z.enum(["blocked", "in_progress", "complete"]),
    revocationReadiness: z.enum(["not_ready", "ready"]),
    oldAccessStatus: handoverOldAccessStatusSchema,
    transfers: z
      .array(handoverItemAssessmentSchema)
      .max(MAX_HANDOVER_ENGAGEMENTS + MAX_HANDOVER_RESOURCES)
      .readonly(),
    affectedItemIds: z
      .array(uuidSchema)
      .max(MAX_HANDOVER_ENGAGEMENTS + MAX_HANDOVER_RESOURCES)
      .readonly(),
    issues: z.array(handoverAssessmentIssueSchema).max(12).readonly(),
  })
  .strict()
  .readonly();
export type HandoverAssessment = z.infer<typeof handoverAssessmentSchema>;

/**
 * Assesses supplied handover evidence without trusting it as an access grant.
 * Server code must independently verify current permission, current state,
 * inventory/plan digests, and receipt provenance before any mutation or revocation.
 */
export function assessHandover(input: HandoverAssessmentInput): HandoverAssessment {
  const requiredItems: HandoverTransferItem[] = [
    ...input.plan.selectedEngagementIds.map((itemId) => ({ kind: "engagement" as const, itemId })),
    ...input.plan.organizationResources
      .filter((resource) => resource.disposition === "transferred")
      .map((resource) => ({ kind: "organization_resource" as const, itemId: resource.resourceId })),
  ];
  const requiredItemKeys = new Set(requiredItems.map(itemKey));
  const issues = new Set<HandoverAssessmentIssue>();
  const scopeMatchesPlan = (scope: HandoverScope) => sameScope(scope, input.plan);

  if (requiredItems.length === 0) issues.add("empty_plan");

  const receiptsByItem = new Map<string, HandoverReceipt[]>();
  const receiptsById = new Map<string, HandoverReceipt>();
  for (const receipt of input.receipts) {
    const previous = receiptsById.get(receipt.receiptId);
    if (previous && !sameReceipt(previous, receipt)) issues.add("conflicting_receipt_replay");
    else if (!previous) receiptsById.set(receipt.receiptId, receipt);
  }

  const conflictingReceiptIds = new Set<string>();
  for (const receipt of input.receipts) {
    const original = receiptsById.get(receipt.receiptId);
    if (original && !sameReceipt(original, receipt)) conflictingReceiptIds.add(receipt.receiptId);
  }
  const quarantinedItemKeys = new Set<string>();
  for (const receipt of input.receipts) {
    if (
      conflictingReceiptIds.has(receipt.receiptId) &&
      requiredItemKeys.has(itemKey(receipt.item))
    ) {
      quarantinedItemKeys.add(itemKey(receipt.item));
    }
  }

  for (const receipt of input.receipts) {
    if (!scopeMatchesPlan(receipt.scope)) {
      issues.add("scope_mismatch");
      continue;
    }
    const key = itemKey(receipt.item);
    if (!requiredItemKeys.has(key)) {
      issues.add("foreign_receipt_item");
      continue;
    }
    if (conflictingReceiptIds.has(receipt.receiptId)) continue;
    const itemReceipts = receiptsByItem.get(key) ?? [];
    itemReceipts.push(receipt);
    receiptsByItem.set(key, itemReceipts);
  }

  const transfers = requiredItems.map((item) => ({
    item,
    status: quarantinedItemKeys.has(itemKey(item))
      ? "unknown"
      : aggregateReceiptStatus(receiptsByItem.get(itemKey(item)) ?? []),
  }));
  const affectedItemIds = transfers
    .filter((transfer) => transfer.status !== "confirmed")
    .map((transfer) => transfer.item.itemId);

  for (const transfer of transfers) {
    if (transfer.status === "failed") issues.add("transfer_failed");
    if (transfer.status === "unknown") issues.add("transfer_unknown");
    if (transfer.status === "pending") issues.add("transfer_pending");
  }
  const inventoryStatus = scopeMatchesPlan(input.inventory.scope)
    ? input.inventory.status
    : "unavailable";
  const revocation = scopeMatchesPlan(input.revocation.scope)
    ? input.revocation
    : { state: "unknown" as const, oldAccessStatus: "unknown" as const };
  if (!scopeMatchesPlan(input.inventory.scope) || !scopeMatchesPlan(input.revocation.scope)) {
    issues.add("scope_mismatch");
  }
  if (inventoryStatus === "incomplete") issues.add("inventory_incomplete");
  if (inventoryStatus === "unavailable") issues.add("inventory_unavailable");
  if (revocation.state === "pending") issues.add("revocation_pending");
  if (revocation.state === "failed") issues.add("revocation_failed");
  if (revocation.state === "unknown") issues.add("revocation_unknown");
  if (revocation.state === "confirmed" && revocation.oldAccessStatus !== "revoked") {
    issues.add("revocation_access_conflict");
  }

  const transfersConfirmed = requiredItems.length > 0 && affectedItemIds.length === 0;
  const evidenceValid =
    !issues.has("scope_mismatch") &&
    !issues.has("foreign_receipt_item") &&
    !issues.has("conflicting_receipt_replay");
  const revocationReadiness =
    evidenceValid && transfersConfirmed && inventoryStatus === "resolved" ? "ready" : "not_ready";
  const complete =
    revocationReadiness === "ready" &&
    revocation.state === "confirmed" &&
    revocation.oldAccessStatus === "revoked";
  const blocked =
    !evidenceValid ||
    inventoryStatus !== "resolved" ||
    transfers.some((transfer) => transfer.status === "failed" || transfer.status === "unknown") ||
    revocation.state === "failed" ||
    revocation.state === "unknown" ||
    issues.has("revocation_access_conflict");

  return {
    authority: "assessment_only",
    overallStatus: complete ? "complete" : blocked ? "blocked" : "in_progress",
    revocationReadiness,
    oldAccessStatus: revocation.oldAccessStatus,
    transfers,
    affectedItemIds,
    issues: HANDOVER_ASSESSMENT_ISSUES.filter((issue) => issues.has(issue)),
  };
}

function aggregateReceiptStatus(
  receipts: readonly HandoverReceipt[],
): HandoverItemAssessment["status"] {
  if (receipts.some((receipt) => receipt.status === "confirmed")) return "confirmed";
  if (receipts.some((receipt) => receipt.status === "unknown")) return "unknown";
  if (receipts.some((receipt) => receipt.status === "failed")) return "failed";
  return "pending";
}

function itemKey(item: HandoverTransferItem): string {
  return `${item.kind}:${item.itemId}`;
}

function sameReceipt(left: HandoverReceipt, right: HandoverReceipt): boolean {
  return (
    left.receiptId === right.receiptId &&
    left.status === right.status &&
    left.item.kind === right.item.kind &&
    left.item.itemId === right.item.itemId &&
    sameScope(left.scope, right.scope)
  );
}

function sameScope(left: HandoverScope, right: HandoverScope): boolean {
  return scopeKey(left) === scopeKey(right);
}

function scopeKey(scope: HandoverScope): string {
  const selectedItems = [
    ...scope.selectedEngagementIds.map((engagementId) => `engagement:${engagementId}`),
    ...scope.organizationResources.map(
      (resource) => `organization_resource:${resource.resourceId}:${resource.disposition}`,
    ),
  ].sort();
  return [
    scope.operationKind,
    scope.operationId,
    String(scope.revision),
    scope.organizationId,
    scope.departingProfileId,
    scope.receivingProfileId,
    ...selectedItems,
  ].join("|");
}
