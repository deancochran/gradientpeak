import { describe, expect, it } from "vitest";

import {
  assessHandover,
  handoverAssessmentInputSchema,
  handoverAssessmentSchema,
  handoverInventorySchema,
  handoverPlanSchema,
} from "../index";

const organizationId = "11111111-1111-4111-8111-111111111111";
const departingProfileId = "22222222-2222-4222-8222-222222222222";
const receivingProfileId = "33333333-3333-4333-8333-333333333333";
const engagementId = "44444444-4444-4444-8444-444444444444";
const resourceId = "55555555-5555-4555-8555-555555555555";
const foreignId = "66666666-6666-4666-8666-666666666666";
const receiptId = "77777777-7777-4777-8777-777777777777";
const operationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function plan(overrides: Record<string, unknown> = {}) {
  return {
    operationKind: "coaching_handover",
    operationId,
    revision: 1,
    organizationId,
    departingProfileId,
    receivingProfileId,
    selectedEngagementIds: [engagementId],
    organizationResources: [{ resourceId, disposition: "transferred" }],
    ...overrides,
  };
}

function input(overrides: Record<string, unknown> = {}) {
  const currentPlan = handoverPlanSchema.parse(overrides.plan ?? plan());
  return handoverAssessmentInputSchema.parse({
    plan: currentPlan,
    inventory: {
      scope: currentPlan,
      status: "resolved",
      excludedResourceClasses: ["personal", "system"],
    },
    receipts: [],
    revocation: { scope: currentPlan, state: "pending", oldAccessStatus: "active" },
    ...overrides,
  });
}

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    receiptId,
    scope: plan(),
    item: { kind: "engagement", itemId: engagementId },
    status: "confirmed",
    ...overrides,
  };
}

function confirmedReceipts(scope = plan()) {
  return [
    receipt({ scope }),
    receipt({
      receiptId: "88888888-8888-4888-8888-888888888888",
      scope,
      item: { kind: "organization_resource", itemId: resourceId },
    }),
  ];
}

describe("handover assessment", () => {
  it("requires distinct identities and bounded unique selections", () => {
    const handoverPlan = plan({ organizationResources: [{ resourceId, disposition: "retained" }] });
    expect(
      handoverPlanSchema.safeParse({ ...handoverPlan, receivingProfileId: departingProfileId })
        .success,
    ).toBe(false);
    expect(
      handoverPlanSchema.safeParse({
        ...handoverPlan,
        selectedEngagementIds: [engagementId, engagementId],
      }).success,
    ).toBe(false);
    expect(
      handoverPlanSchema.safeParse({
        ...handoverPlan,
        organizationResources: [
          { resourceId, disposition: "retained" },
          { resourceId, disposition: "transferred" },
        ],
      }).success,
    ).toBe(false);
  });

  it("keeps personal and system resources excluded rather than transferring private asset identifiers", () => {
    const retainedPlan = plan({ organizationResources: [{ resourceId, disposition: "retained" }] });
    const assessment = assessHandover(
      input({
        plan: retainedPlan,
        receipts: [receipt({ scope: retainedPlan })],
      }),
    );

    expect(assessment.transfers).toEqual([
      { item: { kind: "engagement", itemId: engagementId }, status: "confirmed" },
    ]);
    expect(assessment.affectedItemIds).toEqual([]);
    expect(
      handoverInventorySchema.safeParse({
        scope: plan(),
        status: "resolved",
        excludedResourceClasses: ["personal", "personal"],
      }).success,
    ).toBe(false);
    expect(
      handoverInventorySchema.safeParse({
        scope: plan(),
        status: "resolved",
        excludedResourceClasses: ["personal"],
      }).success,
    ).toBe(false);
    expect(
      handoverInventorySchema.safeParse({
        scope: plan(),
        status: "resolved",
        excludedResourceClasses: [],
      }).success,
    ).toBe(false);
  });

  it("does not auto-complete an empty plan", () => {
    const assessment = assessHandover(
      input({
        plan: plan({ selectedEngagementIds: [], organizationResources: [] }),
        revocation: {
          scope: plan({ selectedEngagementIds: [], organizationResources: [] }),
          state: "confirmed",
          oldAccessStatus: "revoked",
        },
      }),
    );

    expect(assessment.overallStatus).toBe("in_progress");
    expect(assessment.revocationReadiness).toBe("not_ready");
    expect(assessment.issues).toContain("empty_plan");
  });

  it.each([
    ["failed", "failed"],
    ["unknown", "unknown"],
    ["pending", "pending"],
  ] as const)("keeps a %s receipt distinct", (receiptStatus, expectedStatus) => {
    const assessment = assessHandover(input({ receipts: [receipt({ status: receiptStatus })] }));
    const transfer = assessment.transfers[0];

    expect(transfer?.status).toBe(expectedStatus);
    expect(assessment.overallStatus).toBe(receiptStatus === "pending" ? "in_progress" : "blocked");
  });

  it("treats a timeout/unknown receipt as unresolved rather than failed or ready", () => {
    const assessment = assessHandover(input({ receipts: [receipt({ status: "unknown" })] }));

    expect(assessment.revocationReadiness).toBe("not_ready");
    expect(assessment.issues).toContain("transfer_unknown");
    expect(assessment.affectedItemIds).toContain(engagementId);
  });

  it("rejects foreign evidence and a replay that conflicts with the original item status", () => {
    const assessment = assessHandover(
      input({
        receipts: [
          receipt(),
          receipt({ item: { kind: "engagement", itemId: foreignId } }),
          receipt({ status: "failed" }),
        ],
      }),
    );

    expect(assessment.overallStatus).toBe("blocked");
    expect(assessment.issues).toContain("foreign_receipt_item");
    expect(assessment.issues).toContain("conflicting_receipt_replay");
  });

  it("quarantines every item associated with a conflicting receipt ID", () => {
    const assessment = assessHandover(
      input({
        receipts: [
          receipt(),
          receipt({
            item: { kind: "organization_resource", itemId: resourceId },
            status: "failed",
          }),
        ],
      }),
    );

    expect(assessment.transfers.map((transfer) => transfer.status)).toEqual(["unknown", "unknown"]);
    expect(assessment.affectedItemIds).toEqual([engagementId, resourceId]);
    expect(assessment.issues).toContain("conflicting_receipt_replay");
    expect(assessment.issues).toContain("transfer_unknown");
  });

  it.each([
    ["old operation", plan({ operationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" })],
    ["different receiver", plan({ receivingProfileId: foreignId })],
    ["prior revision", plan({ revision: 2 })],
  ])("does not confirm a receipt bound to a %s", (_label, staleScope) => {
    const assessment = assessHandover(input({ receipts: [receipt({ scope: staleScope })] }));

    expect(assessment.transfers[0]?.status).toBe("pending");
    expect(assessment.revocationReadiness).toBe("not_ready");
    expect(assessment.overallStatus).toBe("blocked");
    expect(assessment.issues).toContain("scope_mismatch");
  });

  it("does not use stale inventory or revocation evidence", () => {
    const staleScope = plan({ revision: 2 });
    const assessment = assessHandover(
      input({
        receipts: confirmedReceipts(),
        inventory: {
          scope: staleScope,
          status: "resolved",
          excludedResourceClasses: ["personal", "system"],
        },
        revocation: { scope: staleScope, state: "confirmed", oldAccessStatus: "revoked" },
      }),
    );

    expect(assessment.revocationReadiness).toBe("not_ready");
    expect(assessment.overallStatus).toBe("blocked");
    expect(assessment.oldAccessStatus).toBe("unknown");
    expect(assessment.issues).toContain("scope_mismatch");
  });

  it("returns an identical, canonically ordered assessment for receipt permutations", () => {
    const receipts = [
      receipt({ status: "failed" }),
      receipt({
        receiptId: "88888888-8888-4888-8888-888888888888",
        item: { kind: "organization_resource", itemId: resourceId },
        status: "pending",
      }),
      receipt({
        receiptId: "99999999-9999-4999-8999-999999999999",
        item: { kind: "engagement", itemId: foreignId },
      }),
    ];

    expect(assessHandover(input({ receipts: [...receipts].reverse() }))).toEqual(
      assessHandover(input({ receipts })),
    );
  });

  it("preserves a confirmed retry despite an earlier failure", () => {
    const assessment = assessHandover(
      input({
        receipts: [
          receipt({ receiptId, status: "failed" }),
          receipt({ receiptId: "88888888-8888-4888-8888-888888888888", status: "confirmed" }),
          receipt({
            receiptId: "99999999-9999-4999-8999-999999999999",
            item: { kind: "organization_resource", itemId: resourceId },
          }),
        ],
      }),
    );

    expect(assessment.transfers.map((transfer) => transfer.status)).toEqual([
      "confirmed",
      "confirmed",
    ]);
    expect(assessment.affectedItemIds).toEqual([]);
    expect(assessment.revocationReadiness).toBe("ready");
  });

  it("blocks readiness for unavailable or incomplete inventory", () => {
    for (const status of ["incomplete", "unavailable"] as const) {
      const assessment = assessHandover(
        input({
          inventory: { scope: plan(), status, excludedResourceClasses: ["personal"] },
          receipts: [
            receipt(),
            receipt({
              receiptId: "88888888-8888-4888-8888-888888888888",
              item: { kind: "organization_resource", itemId: resourceId },
            }),
          ],
        }),
      );
      expect(assessment.revocationReadiness).toBe("not_ready");
      expect(assessment.overallStatus).toBe("blocked");
    }
  });

  it("retains failed item IDs, makes old access explicit, and completes only after recovery and confirmed revocation", () => {
    const partial = assessHandover(
      input({
        receipts: [
          receipt(),
          receipt({
            receiptId: "88888888-8888-4888-8888-888888888888",
            item: { kind: "organization_resource", itemId: resourceId },
            status: "failed",
          }),
        ],
        revocation: { scope: plan(), state: "pending", oldAccessStatus: "active" },
      }),
    );
    expect(partial.affectedItemIds).toEqual([resourceId]);
    expect(partial.oldAccessStatus).toBe("active");
    expect(partial.overallStatus).toBe("blocked");

    const complete = assessHandover(
      input({
        receipts: [
          receipt(),
          receipt({
            receiptId: "88888888-8888-4888-8888-888888888888",
            item: { kind: "organization_resource", itemId: resourceId },
          }),
        ],
        revocation: { scope: plan(), state: "confirmed", oldAccessStatus: "revoked" },
      }),
    );
    expect(complete.authority).toBe("assessment_only");
    expect(complete.revocationReadiness).toBe("ready");
    expect(complete.overallStatus).toBe("complete");
    expect(handoverAssessmentSchema.safeParse({ ...complete, optimistic: true }).success).toBe(
      false,
    );
  });
});
