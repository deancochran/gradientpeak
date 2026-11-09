import { z } from "zod";

export const capabilityPlatformScopeSchema = z.enum([
  "both_platforms",
  "web_only",
  "mobile_only",
  "internal_server_only",
  "public_sharing",
]);
export type CapabilityPlatformScope = z.infer<typeof capabilityPlatformScopeSchema>;

export const capabilityLifecycleSchema = z.enum(["active", "deprecated", "retired"]);
export const capabilityProcedureTypeSchema = z.enum(["query", "mutation", "subscription"]);
export const capabilityAccessSchema = z.enum([
  "authenticated_session",
  "public_share_identifier",
  "internal_server_context",
]);

const mutationSafetyClassificationSchema = z.enum([
  "idempotency_key",
  "state_guarded",
  "transactional",
  "non_idempotent",
]);
const mutationSafetySchema = z.strictObject({
  assurance: z.literal("classification_only"),
  classification: mutationSafetyClassificationSchema,
  rationale: z.string().trim().min(20),
});

export const apiCapabilitySchema = z
  .strictObject({
    access: capabilityAccessSchema,
    authorizationAssurance: z.enum(["authentication_boundary", "resource_boundary"]),
    authorizationPolicy: z.string().regex(/^[a-z][a-z0-9.-]+\.v[1-9][0-9]*$/),
    evidenceIds: z.array(z.string().trim().min(1)).min(1),
    id: z.string().regex(/^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)+$/),
    lifecycle: capabilityLifecycleSchema,
    mutationSafety: mutationSafetySchema.optional(),
    owner: z.string().regex(/^api\/[a-z][a-z0-9-]*$/),
    platform: z.strictObject({
      rationale: z.string().trim().min(20),
      scope: capabilityPlatformScopeSchema,
    }),
    procedureType: capabilityProcedureTypeSchema,
    testRequirements: z
      .array(z.enum(["authorization", "contract", "mutation_safety", "runtime_release"]))
      .min(2),
  })
  .superRefine((capability, context) => {
    if (capability.procedureType === "mutation" && !capability.mutationSafety) {
      context.addIssue({
        code: "custom",
        message: "mutation capabilities require mutation safety metadata",
        path: ["mutationSafety"],
      });
    }
    if (capability.procedureType !== "mutation" && capability.mutationSafety) {
      context.addIssue({
        code: "custom",
        message: "only mutation capabilities may declare mutation safety metadata",
        path: ["mutationSafety"],
      });
    }
    if (
      capability.procedureType === "mutation" &&
      !capability.testRequirements.includes("mutation_safety")
    ) {
      context.addIssue({
        code: "custom",
        message: "mutation capabilities must require mutation safety tests",
        path: ["testRequirements"],
      });
    }
  });
export type ApiCapability = z.infer<typeof apiCapabilitySchema>;

export const actualProcedureSchema = z.strictObject({
  id: z.string().regex(/^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)+$/),
  procedureType: capabilityProcedureTypeSchema,
});
export type ActualProcedure = z.infer<typeof actualProcedureSchema>;

const domainPolicySchema = z.strictObject({
  access: capabilityAccessSchema.default("authenticated_session"),
  mutationSafetyDefault: mutationSafetyClassificationSchema.default("state_guarded"),
  owner: z.string().regex(/^api\/[a-z][a-z0-9-]*$/),
  resourceAuthorizationPolicy: z
    .string()
    .regex(/^[a-z][a-z0-9.-]+\.v[1-9][0-9]*$/)
    .optional(),
  scope: capabilityPlatformScopeSchema.default("both_platforms"),
});

/** Router-level product policy. It intentionally contains no procedure-name inventory. */
export const apiDomainPolicy = {
  activities: policy("api/activities"),
  activityFiles: policy("api/activity-files"),
  activityPlans: policy("api/activity-plans"),
  athleteIntelligence: policy("api/athlete-intelligence"),
  athleteCheckIns: policy("api/athlete-check-ins", {
    resourceAuthorizationPolicy: "athlete-check-ins.athlete-owned-occurrence.v1",
  }),
  calendar: policy("api/calendar"),
  events: policy("api/events"),
  feed: policy("api/feed"),
  goals: policy("api/goals"),
  groups: policy("api/groups"),
  "groups.events": policy("api/group-events"),
  home: policy("api/home"),
  integrations: policy("api/integrations"),
  messaging: policy("api/messaging"),
  notifications: policy("api/notifications"),
  onboarding: policy("api/onboarding"),
  organizations: policy("api/organizations", {
    scope: "web_only",
  }),
  plannedSessions: policy("api/planned-sessions"),
  profileAccess: policy("api/profile-access"),
  profiles: policy("api/profiles"),
  publicShare: policy("api/public-share", {
    access: "public_share_identifier",
    resourceAuthorizationPolicy: "public-share.visibility-and-identifier.v1",
    scope: "public_sharing",
  }),
  routes: policy("api/routes"),
  social: policy("api/social"),
  storage: policy("api/storage"),
  trainingPlans: policy("api/training-plans"),
} as const satisfies Record<string, z.input<typeof domainPolicySchema>>;

function policy(owner: string, extra: Partial<z.input<typeof domainPolicySchema>> = {}) {
  return { owner, ...extra };
}

const operationPolicyOverrideSchema = z.strictObject({
  authorizationAssurance: z.literal("resource_boundary").optional(),
  lifecycle: capabilityLifecycleSchema.optional(),
  mutationSafety: mutationSafetyClassificationSchema.optional(),
  scope: capabilityPlatformScopeSchema.optional(),
});

/**
 * Exceptional decisions that cannot be read from the router. Most mutations use the
 * domain default (state guarded), so only different safety semantics are named here.
 */
export const apiOperationPolicyOverrides = {
  "activities.createFromRecordingSummary": { mutationSafety: "idempotency_key" },
  "activities.recordSessionRpe": { mutationSafety: "idempotency_key" },
  "activityFiles.beginMobileRecordingUpload": { mutationSafety: "idempotency_key" },
  "activityFiles.getSignedUploadUrl": { mutationSafety: "non_idempotent" },
  "activityFiles.processActivityFile": { mutationSafety: "idempotency_key" },
  "activityFiles.retryPendingMobileRecordingCleanup": { mutationSafety: "idempotency_key" },
  "activityPlans.create": { mutationSafety: "non_idempotent" },
  "activityPlans.duplicate": { mutationSafety: "non_idempotent" },
  "athleteCheckIns.get": { authorizationAssurance: "resource_boundary" },
  "athleteCheckIns.list": { authorizationAssurance: "resource_boundary" },
  "athleteCheckIns.submit": {
    authorizationAssurance: "resource_boundary",
    mutationSafety: "idempotency_key",
  },
  "plannedSessions.changePlanOnly": { mutationSafety: "transactional" },
  "athleteIntelligence.requestRecalculationRepair": { mutationSafety: "idempotency_key" },
  "events.create": { mutationSafety: "non_idempotent" },
  "events.reconcileHistoricalCompletions": { mutationSafety: "idempotency_key" },
  "goals.create": { mutationSafety: "non_idempotent" },
  "groups.create": { mutationSafety: "non_idempotent" },
  "groups.events.create": { mutationSafety: "non_idempotent" },
  "groups.events.createRecurringEventSeries": { mutationSafety: "transactional" },
  "groups.events.rsvpEventSeries": { mutationSafety: "transactional" },
  "groups.transferOwnership": { mutationSafety: "transactional" },
  "integrations.getAuthUrl": { mutationSafety: "non_idempotent" },
  "integrations.refreshSetupData": { mutationSafety: "idempotency_key" },
  "integrations.syncNow": { mutationSafety: "idempotency_key" },
  "messaging.createConversation": { mutationSafety: "non_idempotent" },
  "messaging.markAsRead": { mutationSafety: "idempotency_key" },
  "messaging.sendMessage": { mutationSafety: "non_idempotent" },
  "notifications.markRead": { mutationSafety: "idempotency_key" },
  "onboarding.completeLifecycleSetup": { mutationSafety: "idempotency_key" },
  "onboarding.reconcileStatus": { mutationSafety: "idempotency_key" },
  "onboarding.retryProviderProcessing": { mutationSafety: "idempotency_key" },
  "publicShare.activity": { authorizationAssurance: "resource_boundary" },
  "publicShare.activityPlan": { authorizationAssurance: "resource_boundary" },
  "publicShare.route": { authorizationAssurance: "resource_boundary" },
  "publicShare.trainingPlan": { authorizationAssurance: "resource_boundary" },
  "routes.upload": { mutationSafety: "non_idempotent" },
  "social.addComment": { mutationSafety: "non_idempotent" },
  "storage.createSignedUploadUrl": { mutationSafety: "non_idempotent" },
  "trainingPlans.applyApplication": { mutationSafety: "transactional" },
  "trainingPlans.commit": { mutationSafety: "transactional" },
  "trainingPlans.removeAppliedSchedule": { mutationSafety: "transactional" },
} as const satisfies Record<string, z.input<typeof operationPolicyOverrideSchema>>;

const safetyRationales = {
  idempotency_key: "Repeat delivery is deduplicated by an operation key or a durable equivalent.",
  non_idempotent: "A successful call creates a new side effect, so callers must not retry blindly.",
  state_guarded: "The write is accepted only against the current authorized resource state.",
  transactional: "All related state changes commit or roll back together within one transaction.",
} as const;

function platformRationale(scope: CapabilityPlatformScope) {
  const rationales: Record<CapabilityPlatformScope, string> = {
    both_platforms: "The transport contract is available to authenticated web and mobile clients.",
    web_only: "The product capability is intentionally owned by the browser experience.",
    mobile_only: "The product capability depends on native behavior and is not offered on web.",
    internal_server_only: "The operation is reserved for trusted server orchestration.",
    public_sharing: "The read is intentionally available through a public sharing identifier.",
  };
  return rationales[scope];
}

export function createApiCapabilityCatalog(
  actualProcedures: readonly ActualProcedure[],
  {
    domainPolicy = apiDomainPolicy,
    operationOverrides = apiOperationPolicyOverrides,
  }: {
    domainPolicy?: Readonly<Record<string, unknown>>;
    operationOverrides?: Readonly<Record<string, unknown>>;
  } = {},
) {
  const parsedDomains = new Map(
    Object.entries(domainPolicy).flatMap(([id, input]) => {
      const result = domainPolicySchema.safeParse(input);
      return result.success ? [[id, result.data] as const] : [];
    }),
  );
  const parsedOverrides = new Map(
    Object.entries(operationOverrides).flatMap(([id, input]) => {
      const result = operationPolicyOverrideSchema.safeParse(input);
      return result.success ? [[id, result.data] as const] : [];
    }),
  );

  return actualProcedures
    .flatMap((procedure): ApiCapability[] => {
      const domain = longestPolicyDomain(procedure.id, parsedDomains.keys());
      const domainDecision = domain ? parsedDomains.get(domain) : undefined;
      if (!domainDecision) return [];
      const override = parsedOverrides.get(procedure.id);
      const resourceAuthorizationPolicy = domainDecision.resourceAuthorizationPolicy;
      let authorizationPolicy = "authenticated-session.v1";
      if (override?.authorizationAssurance === "resource_boundary") {
        if (!resourceAuthorizationPolicy) return [];
        authorizationPolicy = resourceAuthorizationPolicy;
      }
      const scope = override?.scope ?? domainDecision.scope;
      const evidenceIds = [
        `contract:${procedure.id}`,
        `authorization:${procedure.id}`,
        ...(procedure.procedureType === "mutation" ? [`mutation-safety:${procedure.id}`] : []),
      ];
      const safety =
        procedure.procedureType === "mutation"
          ? (override?.mutationSafety ?? domainDecision.mutationSafetyDefault)
          : undefined;
      return [
        {
          access: domainDecision.access,
          authorizationAssurance: override?.authorizationAssurance ?? "authentication_boundary",
          authorizationPolicy,
          evidenceIds,
          id: procedure.id,
          lifecycle: override?.lifecycle ?? "active",
          ...(safety
            ? {
                mutationSafety: {
                  assurance: "classification_only" as const,
                  classification: safety,
                  rationale: safetyRationales[safety],
                },
              }
            : {}),
          owner: domainDecision.owner,
          platform: { rationale: platformRationale(scope), scope },
          procedureType: procedure.procedureType,
          testRequirements:
            procedure.procedureType === "mutation"
              ? (["authorization", "contract", "mutation_safety"] as const)
              : (["authorization", "contract"] as const),
        },
      ];
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function longestPolicyDomain(operationId: string, domains: Iterable<string>) {
  return [...domains]
    .filter((domain) => operationId.startsWith(`${domain}.`))
    .sort((left, right) => right.length - left.length)[0];
}

export const capabilityEvidenceSchema = z
  .strictObject({
    id: z.string().trim().min(1),
    kind: z.enum(["external_contract", "governance_test", "router_test"]),
    path: z
      .string()
      .trim()
      .regex(/\.test\.[cm]?[jt]sx?$/),
    policyId: z.string().min(1).optional(),
    procedureIds: z.array(z.string().min(1)).min(1),
    proof: z.enum([
      "authentication_boundary",
      "resource_boundary",
      "router_introspection",
      "mutation_classification",
      "external_endpoint_contract",
    ]),
    requirement: z.enum(["authorization", "contract", "mutation_safety"]),
    status: z.literal("automated"),
    testName: z.string().trim().min(1).optional(),
  })
  .superRefine((evidence, context) => {
    if (evidence.proof === "resource_boundary" && !evidence.testName) {
      context.addIssue({
        code: "custom",
        message: "resource-boundary evidence requires an exact test name",
        path: ["testName"],
      });
    }
  });
export type CapabilityEvidence = z.infer<typeof capabilityEvidenceSchema>;

const resourceBoundaryEvidenceBindingSchema = z.strictObject({
  path: z.string().regex(/\.live-db\.test\.[cm]?[jt]sx?$/),
  testName: z.string().trim().min(1),
});

export const apiResourceBoundaryEvidence = {
  "athleteCheckIns.get": {
    path: "packages/api/src/routers/__tests__/athlete-check-ins.disposable.live-db.test.ts",
    testName:
      "fences private athlete data and proves submission, replay, lifecycle, concurrency and pagination",
  },
  "athleteCheckIns.list": {
    path: "packages/api/src/routers/__tests__/athlete-check-ins.disposable.live-db.test.ts",
    testName:
      "fences private athlete data and proves submission, replay, lifecycle, concurrency and pagination",
  },
  "athleteCheckIns.submit": {
    path: "packages/api/src/routers/__tests__/athlete-check-ins.disposable.live-db.test.ts",
    testName:
      "fences private athlete data and proves submission, replay, lifecycle, concurrency and pagination",
  },
  "publicShare.activity": {
    path: "packages/api/src/routers/__tests__/public-share-visibility.live-db.test.ts",
    testName: "returns only public activities and hides private and missing ids",
  },
  "publicShare.activityPlan": {
    path: "packages/api/src/routers/__tests__/public-share-visibility.live-db.test.ts",
    testName: "returns only public activity plans and hides private and missing ids",
  },
  "publicShare.trainingPlan": {
    path: "packages/api/src/routers/__tests__/public-share-visibility.live-db.test.ts",
    testName: "returns only public training plans and hides private and missing ids",
  },
  "publicShare.route": {
    path: "packages/api/src/routers/__tests__/public-share-visibility.live-db.test.ts",
    testName: "returns only public routes and hides private and missing ids",
  },
} as const satisfies Record<string, z.input<typeof resourceBoundaryEvidenceBindingSchema>>;

export function createCapabilityEvidenceRegistry(
  catalog: readonly ApiCapability[],
  resourceBoundaryEvidence: Readonly<Record<string, unknown>> = apiResourceBoundaryEvidence,
) {
  return [
    {
      id: "auth.package.contract",
      kind: "external_contract" as const,
      path: "packages/auth/src/runtime/server.test.ts",
      procedureIds: externalCapabilityExceptions.map((item) => item.id),
      proof: "external_endpoint_contract" as const,
      requirement: "contract" as const,
      status: "automated" as const,
    },
    ...catalog.flatMap((capability): CapabilityEvidence[] => {
      const resourceBindingResult = resourceBoundaryEvidenceBindingSchema.safeParse(
        resourceBoundaryEvidence[capability.id],
      );
      const resourceBinding = resourceBindingResult.success
        ? resourceBindingResult.data
        : undefined;
      return [
        {
          id: `contract:${capability.id}`,
          kind: "governance_test",
          path: "packages/api/src/capabilities/catalog.test.ts",
          procedureIds: [capability.id],
          proof: "router_introspection",
          requirement: "contract",
          status: "automated",
        },
        {
          id: `authorization:${capability.id}`,
          kind: resourceBinding ? "router_test" : "governance_test",
          path: resourceBinding?.path ?? "packages/api/src/capabilities/catalog.test.ts",
          policyId: capability.authorizationPolicy,
          procedureIds: [capability.id],
          proof: resourceBinding ? "resource_boundary" : "authentication_boundary",
          requirement: "authorization",
          status: "automated",
          ...(resourceBinding ? { testName: resourceBinding.testName } : {}),
        },
        ...(capability.procedureType === "mutation"
          ? [
              {
                id: `mutation-safety:${capability.id}`,
                kind: "governance_test" as const,
                path: "packages/api/src/capabilities/catalog.test.ts",
                procedureIds: [capability.id],
                proof: "mutation_classification" as const,
                requirement: "mutation_safety" as const,
                status: "automated" as const,
              },
            ]
          : []),
      ];
    }),
  ];
}

export const externalCapabilityExceptionSchema = z.strictObject({
  evidenceIds: z.array(z.string().min(1)).min(1),
  id: z.string().regex(/^auth\.[A-Za-z][A-Za-z0-9]*$/),
  owner: z.literal("@repo/auth"),
  rationale: z.string().trim().min(20),
});

/** Better Auth endpoints are not tRPC procedures and are intentionally outside appRouter. */
export const externalCapabilityExceptions = [
  "auth.requestPasswordReset",
  "auth.resetPassword",
  "auth.sendVerificationEmail",
  "auth.signInEmail",
  "auth.signOut",
  "auth.signUpEmail",
].map((id) => ({
  evidenceIds: ["auth.package.contract"],
  id,
  owner: "@repo/auth" as const,
  rationale: "Better Auth owns this HTTP endpoint outside the API package's tRPC appRouter.",
}));

export function reconcileApiCapabilityCatalog({
  actualProcedures,
  catalog,
  evidence,
  exceptions = externalCapabilityExceptions,
  existingTestPaths,
  existingTestNames,
  domainPolicy = apiDomainPolicy,
  operationOverrides = apiOperationPolicyOverrides,
  resourceBoundaryEvidence = apiResourceBoundaryEvidence,
}: {
  actualProcedures: readonly ActualProcedure[];
  catalog: readonly unknown[];
  evidence: readonly unknown[];
  exceptions?: readonly unknown[];
  existingTestPaths: ReadonlySet<string>;
  existingTestNames: ReadonlyMap<string, ReadonlySet<string>>;
  domainPolicy?: Readonly<Record<string, unknown>>;
  operationOverrides?: Readonly<Record<string, unknown>>;
  resourceBoundaryEvidence?: Readonly<Record<string, unknown>>;
}) {
  const issues: string[] = [];
  const validActual = parseRows(
    "router operation",
    actualProcedures,
    actualProcedureSchema,
    issues,
  );
  const validCatalog = parseRows("catalog", catalog, apiCapabilitySchema, issues);
  const validEvidence = parseRows("evidence", evidence, capabilityEvidenceSchema, issues);
  const validExceptions = parseRows(
    "exception",
    exceptions,
    externalCapabilityExceptionSchema,
    issues,
  );
  const catalogIds = collectUniqueIds("catalog capability", validCatalog, issues);
  const evidenceIds = collectUniqueIds("evidence", validEvidence, issues);
  collectUniqueIds("router operation", validActual, issues);
  collectUniqueIds("exception", validExceptions, issues);

  for (const [domain, input] of Object.entries(domainPolicy)) {
    const result = domainPolicySchema.safeParse(input);
    if (!result.success) pushZodIssues(`domain policy ${domain}`, result.error, issues);
  }
  const actualIds = new Set(validActual.map((item) => item.id));
  for (const [id, input] of Object.entries(operationOverrides)) {
    const result = operationPolicyOverrideSchema.safeParse(input);
    if (!result.success) pushZodIssues(`operation override ${id}`, result.error, issues);
    if (!actualIds.has(id)) issues.push(`stale operation policy override: ${id}`);
    const actual = validActual.find((item) => item.id === id);
    if (result.success && result.data.mutationSafety && actual?.procedureType !== "mutation") {
      issues.push(`${id}: mutation safety override applies to a non-mutation operation`);
    }
  }
  const validResourceBindings = new Map<
    string,
    z.infer<typeof resourceBoundaryEvidenceBindingSchema>
  >();
  for (const [id, input] of Object.entries(resourceBoundaryEvidence)) {
    const result = resourceBoundaryEvidenceBindingSchema.safeParse(input);
    if (!result.success) {
      pushZodIssues(`resource-boundary evidence ${id}`, result.error, issues);
      continue;
    }
    validResourceBindings.set(id, result.data);
    if (!actualIds.has(id)) issues.push(`stale resource-boundary evidence binding: ${id}`);
  }

  const expectedCatalog = createApiCapabilityCatalog(validActual, {
    domainPolicy,
    operationOverrides,
  });
  const expectedById = new Map(expectedCatalog.map((item) => [item.id, item]));
  for (const actual of validActual) {
    const capability = validCatalog.find((item) => item.id === actual.id);
    if (!capability) issues.push(`unclassified appRouter operation: ${actual.id}`);
    else if (capability.procedureType !== actual.procedureType) {
      issues.push(
        `${actual.id}: catalog declares ${capability.procedureType}, appRouter exposes ${actual.procedureType}`,
      );
    }
    if (!expectedById.has(actual.id)) {
      issues.push(`${actual.id}: no valid router/domain policy classifies this operation`);
    }
  }
  for (const capability of validCatalog) {
    if (!actualIds.has(capability.id)) {
      issues.push(`stale catalog operation not exposed by appRouter: ${capability.id}`);
    }
  }

  const evidenceById = new Map(validEvidence.map((item) => [item.id, item]));
  for (const item of validEvidence) {
    if (!existingTestPaths.has(item.path)) {
      issues.push(`${item.id}: executable evidence test path does not exist: ${item.path}`);
    }
  }
  for (const capability of validCatalog) {
    const bound = capability.evidenceIds.flatMap((id) => {
      const item = evidenceById.get(id);
      if (!item) {
        issues.push(`${capability.id}: unknown evidence id ${id}`);
        return [];
      }
      if (item.procedureIds.length !== 1 || item.procedureIds[0] !== capability.id) {
        issues.push(
          `${capability.id}: evidence ${id} must bind only this procedure, not ${item.procedureIds.join(", ")}`,
        );
      }
      return [item];
    });
    for (const requirement of capability.testRequirements) {
      if (requirement === "runtime_release") continue;
      if (!bound.some((item) => item.requirement === requirement)) {
        issues.push(`${capability.id}: required ${requirement} proof has no executable evidence`);
      }
    }
    const authorization = bound.find((item) => item.requirement === "authorization");
    if (authorization?.proof !== capability.authorizationAssurance) {
      issues.push(`${capability.id}: authorization assurance is not proved by bound evidence`);
    }
    if (authorization?.policyId !== capability.authorizationPolicy) {
      issues.push(`${capability.id}: authorization evidence binds the wrong policy`);
    }
    const resourceBinding = validResourceBindings.get(capability.id);
    if (capability.authorizationAssurance === "resource_boundary") {
      if (!resourceBinding) {
        issues.push(
          `${capability.id}: resource-boundary policy claim lacks a strict per-operation evidence binding`,
        );
      } else if (
        authorization?.path !== resourceBinding.path ||
        authorization.testName !== resourceBinding.testName
      ) {
        issues.push(
          `${capability.id}: resource-boundary authorization evidence does not match its exact bound test`,
        );
      } else if (!existingTestNames.get(resourceBinding.path)?.has(resourceBinding.testName)) {
        issues.push(
          `${capability.id}: bound resource-authorization test does not exist: ${resourceBinding.testName}`,
        );
      }
    } else if (resourceBinding) {
      issues.push(
        `${capability.id}: resource-boundary evidence is bound to an authentication-only capability`,
      );
    }
  }

  for (const exception of validExceptions) {
    if (catalogIds.has(exception.id) || actualIds.has(exception.id)) {
      issues.push(`${exception.id}: external exception now conflicts with appRouter`);
    }
    for (const id of exception.evidenceIds) {
      if (!evidenceIds.has(id)) issues.push(`${exception.id}: unknown exception evidence id ${id}`);
      else if (!evidenceById.get(id)?.procedureIds.includes(exception.id)) {
        issues.push(`${exception.id}: exception evidence ${id} is not bound to this endpoint`);
      }
    }
  }
  return issues;
}

function parseRows<T>(
  label: string,
  rows: readonly unknown[],
  schema: z.ZodType<T>,
  issues: string[],
) {
  return rows.flatMap((row, index): T[] => {
    const result = schema.safeParse(row);
    if (result.success) return [result.data];
    pushZodIssues(`${label}[${index}]`, result.error, issues);
    return [];
  });
}

function pushZodIssues(label: string, error: z.ZodError, issues: string[]) {
  issues.push(
    ...error.issues.map(
      (issue) => `${label} ${issue.path.join(".") || "record"}: ${issue.message}`,
    ),
  );
}

function collectUniqueIds(label: string, rows: readonly { id: string }[], issues: string[]) {
  const ids = new Set<string>();
  for (const row of rows) {
    if (ids.has(row.id)) issues.push(`duplicate ${label} id: ${row.id}`);
    ids.add(row.id);
  }
  return ids;
}

export type PlatformUsage = {
  bridgeReason?: string;
  callKind: string;
  confidence: "ast" | "registered_exception" | "validated_bridge";
  exceptionReason?: string;
  operationId: string;
  platform: "web" | "mobile";
  sourceFiles: readonly string[];
};

export function reconcilePlatformUsage({
  catalog,
  usage,
  decisions = [],
}: {
  catalog: readonly ApiCapability[];
  usage: readonly PlatformUsage[];
  decisions?: readonly {
    availability: "supported" | "intentionally_absent";
    operationId: string;
    platform: "web" | "mobile";
    rationale: string;
  }[];
}) {
  const issues: string[] = [];
  const catalogById = new Map(catalog.map((item) => [item.id, item]));
  const usageKeys = new Set<string>();
  for (const item of usage) {
    const key = `${item.platform}:${item.operationId}`;
    usageKeys.add(key);
    const capability = catalogById.get(item.operationId);
    if (!capability) issues.push(`${key}: generated client call is not a real appRouter operation`);
    else if (!supportsPlatform(capability.platform.scope, item.platform)) {
      issues.push(
        `${key}: generated client call is disallowed by ${capability.platform.scope} policy`,
      );
    }
  }
  const decisionKeys = new Set<string>();
  for (const decision of decisions) {
    const key = `${decision.platform}:${decision.operationId}`;
    if (decisionKeys.has(key)) issues.push(`${key}: duplicate platform decision`);
    decisionKeys.add(key);
    if (!catalogById.has(decision.operationId)) issues.push(`${key}: stale platform decision`);
    if (decision.availability === "supported" && !usageKeys.has(key)) {
      issues.push(`${key}: support is claimed without generated source use`);
    }
    if (decision.availability === "intentionally_absent" && usageKeys.has(key)) {
      issues.push(`${key}: intentional absence conflicts with an actual generated call`);
    }
  }
  return issues;
}

export function generatedPlatformClassifications(
  catalog: readonly ApiCapability[],
  usage: readonly PlatformUsage[],
) {
  const used = new Set(usage.map((item) => `${item.platform}:${item.operationId}`));
  return catalog.flatMap((capability) =>
    (["web", "mobile"] as const).map((platform) => ({
      operationId: capability.id,
      platform,
      classification: used.has(`${platform}:${capability.id}`)
        ? ("exposed_unverified" as const)
        : supportsPlatform(capability.platform.scope, platform)
          ? ("not_exposed" as const)
          : ("intentionally_absent" as const),
    })),
  );
}

function supportsPlatform(scope: CapabilityPlatformScope, platform: "web" | "mobile") {
  return (
    scope === "both_platforms" ||
    scope === "public_sharing" ||
    (scope === "web_only" && platform === "web") ||
    (scope === "mobile_only" && platform === "mobile")
  );
}
