import { z } from "zod";

export const parityPlatformSchema = z.enum(["web", "mobile"]);
export type ParityPlatform = z.infer<typeof parityPlatformSchema>;

export const capabilityPolicySchema = z.enum(["both", "web_only", "mobile_only"]);
export type CapabilityPolicy = z.infer<typeof capabilityPolicySchema>;

export const implementationDispositionSchema = z.enum([
  "implemented",
  "partial",
  "missing",
  "intentional_absence",
]);
export const evidenceStrengthSchema = z.enum([
  "runtime",
  "screen/component",
  "source-only",
  "none",
]);
export type EvidenceStrength = z.infer<typeof evidenceStrengthSchema>;

export const capabilityPrioritySchema = z.enum(["P0", "P1", "P2", "P3"]);
export type CapabilityPriority = z.infer<typeof capabilityPrioritySchema>;
export const capabilityOwnerAreaSchema = z.string().trim().min(1);
export const requiredTestKindSchema = z.enum(["unit", "contract", "live-db", "component"]);
export const capabilityStatusSchema = z.enum(["active", "decision_pending", "intentional_absence"]);

export const capabilityPriorityFor = (id: string): CapabilityPriority =>
  /^(auth|privacy|share|record|activity\.(?:delete|change-visibility)|routes\.delete|integrations\.)/.test(
    id,
  )
    ? "P0"
    : /^(activity|calendar|goal|goals|route|routes|training|integrations\.)/.test(id)
      ? "P1"
      : /^(feed|discover|group|groups|messaging|social|notifications)/.test(id)
        ? "P2"
        : "P3";

const evidenceReferenceSchema = z.strictObject({
  identity: z.string().trim().min(1).optional(),
  kind: z.enum(["playwright", "maestro", "jest", "vitest", "live-db", "contract", "component"]),
  path: z.string().trim().min(1),
});

const missingStepSchema = z.strictObject({
  detail: z.string().trim().min(20),
  kind: z.enum(["implementation", "proof", "product-decision"]),
  stepId: z.string().regex(/^[a-z][a-z0-9-]*$/),
});

export const platformCapabilityEvidenceSchema = z.strictObject({
  coveredSteps: z.array(z.string().regex(/^[a-z][a-z0-9-]*$/)),
  evidenceStrength: evidenceStrengthSchema,
  implementation: implementationDispositionSchema,
  missingSteps: z.array(missingStepSchema),
  sources: z.array(z.string().trim().min(1)),
  tests: z.array(evidenceReferenceSchema),
  status: capabilityStatusSchema.default("active"),
});

const requiredStepSchema = z.strictObject({
  description: z.string().trim().min(1),
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
});

const intentionalDifferenceSchema = z.strictObject({
  difference: z.string().trim().min(1),
  rationale: z.string().trim().min(20),
});

export const atomicCapabilitySchema = z
  .strictObject({
    apiCapabilities: z.array(z.string().trim().min(1)).optional(),
    id: z.string().regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/),
    intentionalDifferences: z.array(intentionalDifferenceSchema).default([]),
    mobile: platformCapabilityEvidenceSchema,
    ownerArea: capabilityOwnerAreaSchema,
    outcome: z.string().trim().min(1),
    priority: capabilityPrioritySchema,
    policy: capabilityPolicySchema,
    requiredSteps: z.array(requiredStepSchema).min(1),
    title: z.string().trim().min(1),
    web: platformCapabilityEvidenceSchema,
    requiredTestKinds: z.array(requiredTestKindSchema),
  })
  .superRefine((capability, context) => {
    if (capability.priority !== capabilityPriorityFor(capability.id)) {
      context.addIssue({
        code: "custom",
        message: `priority must use the registry baseline ${capabilityPriorityFor(capability.id)}`,
        path: ["priority"],
      });
    }
    if (
      (capability.priority === "P0" || capability.priority === "P1") &&
      capability.requiredTestKinds.length === 0
    ) {
      context.addIssue({
        code: "custom",
        message: "P0 and P1 capabilities require at least one lower-layer test kind",
        path: ["requiredTestKinds"],
      });
    }
    const stepIds = capability.requiredSteps.map((step) => step.id);
    if (new Set(stepIds).size !== stepIds.length) {
      context.addIssue({
        code: "custom",
        message: "required step ids must be unique",
        path: ["requiredSteps"],
      });
    }

    for (const platform of ["web", "mobile"] as const) {
      const evidence = capability[platform];
      const intended = capability.policy === "both" || capability.policy === `${platform}_only`;
      const covered = new Set(evidence.coveredSteps);
      const implementationGaps = new Set(
        evidence.missingSteps.filter((gap) => gap.kind !== "proof").map((gap) => gap.stepId),
      );
      const decisionPending = evidence.missingSteps.some((gap) => gap.kind === "product-decision");
      if (evidence.status === "decision_pending" && (!intended || !decisionPending)) {
        context.addIssue({
          code: "custom",
          message:
            "decision-pending status requires an intended platform with a product-decision gap",
          path: [platform, "status"],
        });
      }
      if (
        evidence.status === "intentional_absence" &&
        evidence.implementation !== "intentional_absence"
      ) {
        context.addIssue({
          code: "custom",
          message: "intentional-absence status requires intentional_absence implementation",
          path: [platform, "status"],
        });
      }
      for (const stepId of [
        ...evidence.coveredSteps,
        ...evidence.missingSteps.map((gap) => gap.stepId),
      ]) {
        if (!stepIds.includes(stepId)) {
          context.addIssue({
            code: "custom",
            message: `unknown required step ${stepId}`,
            path: [platform],
          });
        }
      }
      for (const stepId of stepIds) {
        if (!covered.has(stepId) && !implementationGaps.has(stepId)) {
          context.addIssue({
            code: "custom",
            message: `required step ${stepId} has neither evidence nor a recorded gap`,
            path: [platform],
          });
        }
      }
      if (evidence.implementation === "implemented" && stepIds.some((id) => !covered.has(id))) {
        context.addIssue({
          code: "custom",
          message: "implemented disposition requires every required step to be covered",
          path: [platform, "implementation"],
        });
      }
      if (evidence.implementation === "partial" && implementationGaps.size === 0) {
        context.addIssue({
          code: "custom",
          message: "partial disposition requires an exact implementation gap",
          path: [platform, "implementation"],
        });
      }
      if (evidence.implementation === "missing" && evidence.coveredSteps.length > 0) {
        context.addIssue({
          code: "custom",
          message: "missing disposition cannot claim covered steps",
          path: [platform, "implementation"],
        });
      }
      if (intended && evidence.implementation === "intentional_absence") {
        context.addIssue({
          code: "custom",
          message: "a required platform cannot classify the capability as intentionally absent",
          path: [platform, "implementation"],
        });
      }
      if (!intended && evidence.implementation !== "intentional_absence") {
        context.addIssue({
          code: "custom",
          message: "a platform outside product policy must record intentional absence",
          path: [platform, "implementation"],
        });
      }
      if (evidence.evidenceStrength === "runtime") {
        if (!evidence.tests.some((test) => test.kind === "playwright" || test.kind === "maestro")) {
          context.addIssue({
            code: "custom",
            message: "runtime evidence requires a Playwright or Maestro reference",
            path: [platform, "tests"],
          });
        }
        if (evidence.missingSteps.some((gap) => gap.kind === "proof")) {
          context.addIssue({
            code: "custom",
            message: "runtime evidence cannot retain a proof gap",
            path: [platform, "missingSteps"],
          });
        }
      }
      for (const test of evidence.tests) {
        if ((test.kind === "playwright" || test.kind === "maestro") && !test.identity) {
          context.addIssue({
            code: "custom",
            message: "runtime test references require an exact test identity",
            path: [platform, "tests"],
          });
        }
      }
      if (evidence.evidenceStrength === "none" && evidence.tests.length > 0) {
        context.addIssue({
          code: "custom",
          message: "no evidence cannot list test references",
          path: [platform, "tests"],
        });
      }
    }
    const lowerLayerKinds = new Set(
      [capability.web, capability.mobile].flatMap((platform) =>
        platform.tests.flatMap((test) =>
          test.kind === "jest" || test.kind === "vitest"
            ? ["unit"]
            : ["live-db", "contract", "component"].includes(test.kind)
              ? [test.kind]
              : [],
        ),
      ),
    );
    for (const kind of capability.requiredTestKinds) {
      if (!lowerLayerKinds.has(kind)) {
        context.addIssue({
          code: "custom",
          message: `required lower-layer test kind ${kind} has no evidence reference`,
          path: ["requiredTestKinds"],
        });
      }
    }
  });

export type AtomicCapability = z.input<typeof atomicCapabilitySchema>;

type TestReference = z.input<typeof evidenceReferenceSchema>;
type Gap = { detail: string; kind?: "implementation" | "proof" | "product-decision" };
type PlatformOptions = {
  evidenceStrength: EvidenceStrength;
  gaps?: Readonly<Record<string, Gap>>;
  implementation: z.infer<typeof implementationDispositionSchema>;
  proofGap?: string;
  sources?: readonly string[];
  tests?: readonly TestReference[];
};

const pw = (path: string, identity?: string): TestReference => ({
  kind: "playwright",
  path,
  ...(identity ? { identity } : {}),
});
const maestro = (path: string, identity?: string): TestReference => ({
  kind: "maestro",
  path,
  ...(identity ? { identity } : {}),
});
const nativeJest = (path: string): TestReference => ({ kind: "jest", path });
const vitest = (path: string): TestReference => ({ kind: "vitest", path });
const liveDb = (path: string, identity?: string): TestReference => ({
  kind: "live-db",
  path,
  ...(identity ? { identity } : {}),
});

function platform(steps: readonly string[], options: PlatformOptions) {
  const gaps = options.gaps ?? {};
  const coveredSteps = steps.filter((stepId) => !(stepId in gaps));
  const missingSteps = Object.entries(gaps).map(([stepId, gap]) => ({
    detail: gap.detail,
    kind: gap.kind ?? ("implementation" as const),
    stepId,
  }));
  if (options.evidenceStrength !== "runtime" && options.implementation !== "intentional_absence") {
    for (const stepId of coveredSteps) {
      missingSteps.push({
        detail:
          options.proofGap ??
          "No maintained full runtime flow currently proves this implemented user step.",
        kind: "proof",
        stepId,
      });
    }
  }
  return {
    coveredSteps,
    evidenceStrength: options.evidenceStrength,
    implementation: options.implementation,
    missingSteps,
    sources: [...(options.sources ?? [])],
    status:
      options.implementation === "intentional_absence"
        ? "intentional_absence"
        : missingSteps.some((gap) => gap.kind === "product-decision")
          ? "decision_pending"
          : "active",
    tests: [...(options.tests ?? [])],
  };
}

const implemented = (
  steps: readonly string[],
  evidenceStrength: EvidenceStrength,
  sources: readonly string[],
  tests: readonly TestReference[] = [],
  proofGap?: string,
) =>
  platform(steps, {
    evidenceStrength,
    implementation: "implemented",
    ...(proofGap !== undefined ? { proofGap } : {}),
    sources,
    tests,
  });

const partial = (
  steps: readonly string[],
  evidenceStrength: EvidenceStrength,
  sources: readonly string[],
  tests: readonly TestReference[],
  gaps: Readonly<Record<string, Gap>>,
) => platform(steps, { evidenceStrength, gaps, implementation: "partial", sources, tests });

const missing = (steps: readonly string[], detail: string) =>
  platform(steps, {
    evidenceStrength: "none",
    gaps: Object.fromEntries(steps.map((stepId) => [stepId, { detail }])),
    implementation: "missing",
  });

const intentional = (steps: readonly string[], detail: string) =>
  platform(steps, {
    evidenceStrength: "none",
    gaps: Object.fromEntries(
      steps.map((stepId) => [stepId, { detail, kind: "product-decision" as const }]),
    ),
    implementation: "intentional_absence",
  });

type CapabilityOptions = {
  apiCapabilities?: readonly string[];
  differences?: readonly { difference: string; rationale: string }[];
  id: string;
  mobile: ReturnType<typeof platform>;
  ownerArea?: string;
  outcome: string;
  policy?: CapabilityPolicy;
  steps: readonly string[];
  title: string;
  web: ReturnType<typeof platform>;
  priority?: CapabilityPriority;
  requiredTestKinds?: readonly z.infer<typeof requiredTestKindSchema>[];
};

const ownerFor = (id: string) => `${id.split(".")[0]} surfaces`;

const descriptions: Record<string, string> = {
  browse: "Browse the available records.",
  callback: "Handle the trusted callback and expose success or failure.",
  complete: "Complete the stated user outcome.",
  create: "Create and persist the new record.",
  delete: "Delete the selected record safely.",
  detail: "Open and inspect the selected record.",
  discard: "Discard the local artifact and leave the flow safely.",
  edit: "Edit and persist the selected record.",
  finish: "Finish the active operation and freeze its result.",
  open: "Open the destination successfully.",
  pause: "Pause the active operation.",
  recover: "Recover safely after interruption or failure.",
  resume: "Resume the paused operation.",
  retry: "Retry without duplicating the completed effect.",
  submit: "Submit and persist the reviewed result.",
};

function capability(options: CapabilityOptions) {
  const requiredTestKinds = options.requiredTestKinds ?? [
    ...new Set(
      [options.web, options.mobile].flatMap((platform) =>
        platform.tests.flatMap((test) =>
          test.kind === "jest" || test.kind === "vitest"
            ? ["unit" as const]
            : test.kind === "live-db"
              ? ["live-db" as const]
              : [],
        ),
      ),
    ),
  ];
  return {
    ...(options.apiCapabilities ? { apiCapabilities: [...options.apiCapabilities] } : {}),
    id: options.id,
    intentionalDifferences: [...(options.differences ?? [])],
    mobile: options.mobile,
    ownerArea: options.ownerArea ?? ownerFor(options.id),
    outcome: options.outcome,
    policy: options.policy ?? "both",
    priority: options.priority ?? capabilityPriorityFor(options.id),
    requiredSteps: options.steps.map((id) => ({
      id,
      description: descriptions[id] ?? id.replaceAll("-", " "),
    })),
    title: options.title,
    web: options.web,
    requiredTestKinds,
  };
}

const M = "apps/mobile";
const W = "apps/web";
const mobileScreen = (path: string) => `${M}/app/${path}`;
const webRoute = (path: string) => `${W}/src/routes/${path}`;
const mobileTest = (path: string) => nativeJest(`${M}/${path}`);
const webE2e = (file: string, identity: string) => pw(`${W}/e2e/specs/${file}`, identity);

/**
 * Atomic product capability ledger. Source paths are literal evidence indexes, not
 * ownership globs. A route may support more than one atomic outcome.
 */
export const atomicCapabilityRegistry = [
  capability({
    id: "auth.open-access-options",
    title: "Reach sign-in and recovery",
    outcome: "A signed-out person can reach sign-in, sign-up, and password recovery.",
    steps: ["open"],
    mobile: implemented(
      ["open"],
      "runtime",
      [
        mobileScreen("(external)/sign-in.tsx"),
        mobileScreen("(external)/sign-up.tsx"),
        mobileScreen("(external)/forgot-password.tsx"),
      ],
      [
        maestro(`${M}/.maestro/flows/smoke/auth_navigation.yaml`, "auth.sign_in"),
        mobileTest("app/(external)/__tests__/sign-in.jest.test.tsx"),
        mobileTest("app/(external)/__tests__/forgot-password.jest.test.tsx"),
      ],
    ),
    web: implemented(
      ["open"],
      "runtime",
      [
        webRoute("auth/login.tsx"),
        webRoute("auth/sign-up.tsx"),
        webRoute("auth/forgot-password.tsx"),
      ],
      [
        vitest(`${W}/src/components/login-form.test.tsx`),
        webE2e(
          "auth.spec.ts",
          "real password reset changes the credential and revokes a second session",
        ),
      ],
    ),
  }),
  capability({
    id: "auth.sign-in",
    title: "Sign in",
    outcome: "An existing user establishes a protected session.",
    steps: ["complete"],
    mobile: implemented(
      ["complete"],
      "screen/component",
      [
        mobileScreen("(external)/sign-in.tsx"),
        `${M}/lib/auth/client.ts`,
        `${M}/lib/auth/secure-session-cache.ts`,
      ],
      [mobileTest("app/(external)/__tests__/sign-in.jest.test.tsx")],
    ),
    web: partial(
      ["complete"],
      "runtime",
      [webRoute("auth/login.tsx"), `${W}/src/lib/auth/server-actions.ts`],
      [
        webE2e(
          "auth.spec.ts",
          "protected routes preserve a local return path and reject hostile login redirects",
        ),
      ],
      {
        complete: {
          detail:
            "The browser suite proves guarded return paths but has no standalone successful ordinary-login journey.",
        },
      },
    ),
  }),
  capability({
    id: "auth.sign-out",
    requiredTestKinds: ["unit"],
    title: "Sign out",
    outcome: "A signed-in user ends the current session and returns to public access.",
    steps: ["complete"],
    mobile: partial(
      ["complete"],
      "source-only",
      [mobileScreen("(internal)/(tabs)/profile.tsx")],
      [mobileTest("lib/stores/auth-store.jest.test.ts")],
      {
        complete: {
          detail: "No focused mobile test proves sign-out and the post-sign-out redirect.",
        },
      },
    ),
    web: partial(
      ["complete"],
      "source-only",
      [webRoute("_protected/settings.tsx"), `${W}/src/lib/auth/server-actions.ts`],
      [vitest(`${W}/src/lib/auth/route-guards.test.ts`)],
      {
        complete: {
          detail:
            "No focused browser test proves the settings sign-out action and resulting redirect.",
        },
      },
    ),
  }),
  capability({
    id: "auth.create-account",
    title: "Create an account",
    outcome: "A new person creates an account and reaches the verification state.",
    steps: ["create"],
    mobile: implemented(
      ["create"],
      "screen/component",
      [mobileScreen("(external)/sign-up.tsx")],
      [mobileTest("app/(external)/__tests__/sign-up.jest.test.tsx")],
    ),
    web: implemented(
      ["create"],
      "runtime",
      [webRoute("auth/sign-up.tsx"), webRoute("auth/sign-up-success.tsx")],
      [
        webE2e(
          "auth.spec.ts",
          "sign-up verification rejects expiry and replay while preserving responsive onboarding",
        ),
      ],
    ),
  }),
  capability({
    id: "auth.verify-email",
    title: "Verify email",
    outcome: "A person verifies an account from a valid one-use link.",
    steps: ["callback", "complete"],
    mobile: implemented(
      ["callback", "complete"],
      "screen/component",
      [
        mobileScreen("(external)/verify.tsx"),
        mobileScreen("(external)/verification-success.tsx"),
        mobileScreen("(external)/callback.tsx"),
      ],
      [
        mobileTest("app/(external)/__tests__/verify.jest.test.tsx"),
        mobileTest("app/(external)/__tests__/callback.jest.test.tsx"),
      ],
      "No device flow proves delivery of the operating-system deep link.",
    ),
    web: implemented(
      ["callback", "complete"],
      "runtime",
      [
        webRoute("auth/verify.tsx"),
        webRoute("auth/verification-success.tsx"),
        webRoute("auth/confirm.ts"),
      ],
      [
        webE2e(
          "auth.spec.ts",
          "sign-up verification rejects expiry and replay while preserving responsive onboarding",
        ),
      ],
    ),
  }),
  capability({
    id: "auth.reset-password",
    title: "Reset a password",
    outcome: "A person requests a reset, chooses a new password, and invalidates old sessions.",
    steps: ["callback", "complete"],
    mobile: implemented(
      ["callback", "complete"],
      "screen/component",
      [
        mobileScreen("(external)/forgot-password.tsx"),
        mobileScreen("(external)/reset-password.tsx"),
        mobileScreen("(external)/auth-error.tsx"),
      ],
      [
        mobileTest("app/(external)/__tests__/forgot-password.jest.test.tsx"),
        mobileTest("app/(external)/__tests__/reset-password.jest.test.tsx"),
        mobileTest("app/(external)/__tests__/auth-error.jest.test.tsx"),
      ],
    ),
    web: implemented(
      ["callback", "complete"],
      "runtime",
      [
        webRoute("auth/forgot-password.tsx"),
        webRoute("auth/update-password.tsx"),
        webRoute("auth/error.tsx"),
      ],
      [
        webE2e(
          "auth.spec.ts",
          "real password reset changes the credential and revokes a second session",
        ),
      ],
    ),
  }),
  capability({
    id: "auth.protected-entry",
    title: "Protect signed-in routes",
    outcome: "Protected content admits signed-in users and redirects everyone else safely.",
    steps: ["complete"],
    mobile: implemented(
      ["complete"],
      "screen/component",
      [
        mobileScreen("(external)/_layout.tsx"),
        mobileScreen("(external)/index.tsx"),
        mobileScreen("(internal)/_layout.tsx"),
        mobileScreen("(internal)/(standard)/_layout.tsx"),
      ],
      [mobileTest("app/(external)/__tests__/layout-guard.jest.test.tsx")],
    ),
    web: implemented(
      ["complete"],
      "runtime",
      [webRoute("_protected.tsx")],
      [
        webE2e(
          "auth.spec.ts",
          "protected routes preserve a local return path and reject hostile login redirects",
        ),
      ],
    ),
  }),
  capability({
    id: "navigation.not-found-recovery",
    title: "Recover from an unknown route",
    outcome: "A person who opens an unknown location gets a clear route back into the product.",
    steps: ["recover"],
    mobile: partial(["recover"], "source-only", [mobileScreen("+not-found.tsx")], [], {
      recover: {
        detail:
          "The native not-found screen has no focused test for authenticated and signed-out recovery destinations.",
      },
    }),
    web: implemented(
      ["recover"],
      "screen/component",
      [webRoute("__root.tsx")],
      [vitest(`${W}/src/routes/__root.test.tsx`)],
    ),
  }),
  capability({
    id: "startup.restore-session-and-recording",
    title: "Restore startup state",
    outcome:
      "Startup restores authentication and recoverable recording work before showing app content.",
    steps: ["recover"],
    mobile: implemented(
      ["recover"],
      "screen/component",
      [
        mobileScreen("_layout.tsx"),
        `${M}/components/auth/AppBootstrapGate.tsx`,
        `${M}/lib/services/mobileRecordingStartup.ts`,
      ],
      [
        mobileTest("app/__tests__/root-layout.jest.test.tsx"),
        vitest(`${M}/lib/services/mobileRecordingStartup.test.ts`),
      ],
      "No process-death device flow proves startup recovery timing.",
    ),
    web: implemented(
      ["recover"],
      "runtime",
      [
        webRoute("__root.tsx"),
        webRoute("_protected/record/session.tsx"),
        `${W}/src/lib/recording/draft-storage.ts`,
      ],
      [
        webE2e(
          "recording.spec.ts",
          "athlete recovers after refresh, then reviews and discards an atomic finalized artifact",
        ),
      ],
    ),
    differences: [
      {
        difference:
          "Mobile restores native recording journals; web restores a paused browser draft.",
        rationale:
          "The two runtimes persist interruption-safe recording state through different storage and lifecycle systems.",
      },
    ],
  }),
  capability({
    id: "navigation.primary-destinations",
    title: "Navigate primary destinations",
    outcome: "A signed-in user can reach the product's primary areas.",
    steps: ["complete"],
    mobile: implemented(
      ["complete"],
      "screen/component",
      [
        mobileScreen("(internal)/(tabs)/_layout.tsx"),
        mobileScreen("(internal)/record/_layout.tsx"),
      ],
      [mobileTest("app/(internal)/(tabs)/__tests__/tabs-layout.jest.test.tsx")],
    ),
    web: implemented(
      ["complete"],
      "runtime",
      [webRoute("_protected.tsx")],
      [
        webE2e("smoke.spec.ts", "mobile primary navigation opens, navigates, and closes"),
        webE2e("smoke.spec.ts", "desktop primary navigation exposes named destinations"),
      ],
    ),
  }),
  capability({
    id: "onboarding.complete-identity",
    title: "Complete identity onboarding",
    outcome: "A verified user supplies required identity information and enters the app.",
    steps: ["complete"],
    mobile: implemented(
      ["complete"],
      "screen/component",
      [mobileScreen("(internal)/(standard)/onboarding.tsx")],
      [mobileTest("app/(internal)/(standard)/__tests__/onboarding.jest.test.tsx")],
    ),
    web: implemented(
      ["complete"],
      "runtime",
      [webRoute("onboarding.tsx")],
      [
        webE2e("onboarding.spec.ts", "completes identity-first profile-only onboarding on desktop"),
        webE2e("onboarding.spec.ts", "completes identity-first profile-only onboarding on narrow"),
      ],
    ),
  }),
  capability({
    id: "onboarding.select-people-and-groups",
    title: "Follow people and groups during onboarding",
    outcome:
      "A new user discovers and follows people and joins or requests to join groups during setup.",
    steps: ["complete"],
    mobile: implemented(
      ["complete"],
      "screen/component",
      [`${M}/components/onboarding/steps/GroupsAndPeopleStep.tsx`],
      [mobileTest("components/onboarding/steps/GroupsAndPeopleStep.jest.test.tsx")],
    ),
    web: missing(
      ["complete"],
      "The web onboarding flow does not offer a people-and-groups selection step.",
    ),
  }),
  capability({
    id: "integrations.connect-provider",
    title: "Connect an activity provider",
    outcome:
      "A user completes the trusted browser authorization handoff and sees connection state.",
    steps: ["callback", "complete"],
    mobile: partial(
      ["callback", "complete"],
      "screen/component",
      [
        mobileScreen("(internal)/(standard)/integrations.tsx"),
        `${M}/components/integrations/IntegrationProviderList.tsx`,
        `${M}/lib/integration-oauth-callback.ts`,
      ],
      [
        mobileTest("app/(internal)/(standard)/__tests__/integrations.jest.test.tsx"),
        vitest(`${M}/lib/integration-oauth-callback.test.ts`),
      ],
      {
        complete: {
          detail:
            "No mobile device flow proves provider authorization, token exchange, and connected-state completion.",
        },
      },
    ),
    web: partial(
      ["callback", "complete"],
      "runtime",
      [
        webRoute("_protected/integrations.tsx"),
        `${W}/src/routes/api/integrations/callback/$provider.ts`,
      ],
      [
        webE2e(
          "integrations.spec.ts",
          "local PKCE connect succeeds once, replay fails safely, and disconnect retains history",
        ),
      ],
      {
        complete: {
          detail:
            "The browser journey is conditional on service credentials and the explicit local OAuth adapter.",
        },
      },
    ),
    differences: [
      {
        difference: "Mobile opens a secure system browser while web performs a browser redirect.",
        rationale:
          "Each platform uses its trusted OAuth handoff while preserving callback and PKCE protections.",
      },
    ],
  }),
  capability({
    id: "integrations.sync-now",
    title: "Synchronize a provider",
    outcome: "A connected user starts synchronization and sees its resulting state.",
    steps: ["complete"],
    mobile: partial(
      ["complete"],
      "screen/component",
      [
        mobileScreen("(internal)/(standard)/integrations.tsx"),
        `${M}/components/onboarding/ProviderProcessingStep.tsx`,
      ],
      [mobileTest("components/onboarding/recovery-actions.jest.test.ts")],
      {
        complete: {
          detail:
            "Mobile evidence does not prove that an import job reconciles and exposes its imported activities.",
        },
      },
    ),
    web: partial(["complete"], "source-only", [webRoute("_protected/integrations.tsx")], [], {
      complete: {
        detail: "Sync-now and refresh-setup actions do not each have a successful browser journey.",
      },
    }),
  }),
  capability({
    id: "integrations.recover-status",
    title: "Recover provider status",
    outcome: "A user retains last-known provider state and retries after a network failure.",
    steps: ["retry"],
    mobile: implemented(
      ["retry"],
      "screen/component",
      [
        mobileScreen("(internal)/(standard)/integrations.tsx"),
        `${M}/components/onboarding/recovery-actions.ts`,
      ],
      [mobileTest("components/onboarding/recovery-actions.jest.test.ts")],
    ),
    web: implemented(
      ["retry"],
      "runtime",
      [webRoute("_protected/integrations.tsx")],
      [
        webE2e(
          "integrations.spec.ts",
          "cached provider status survives a network error and recovers on retry",
        ),
      ],
    ),
  }),
  capability({
    id: "home.view-dashboard",
    title: "View dashboard",
    outcome: "A user sees current dashboard content and can recover a failed load.",
    steps: ["open", "recover"],
    mobile: implemented(
      ["open", "recover"],
      "screen/component",
      [mobileScreen("(internal)/(tabs)/index.tsx")],
      [mobileTest("app/(internal)/(tabs)/__tests__/home-screen.jest.test.tsx")],
    ),
    web: implemented(
      ["open", "recover"],
      "runtime",
      [webRoute("_protected/index.tsx")],
      [
        webE2e(
          "smoke.spec.ts",
          "dashboard presents an explicit error and recovers its server content",
        ),
      ],
    ),
  }),
  capability({
    id: "discover.search-resources",
    title: "Search product resources",
    outcome: "A user searches supported resource types and opens a result.",
    steps: ["complete"],
    mobile: partial(
      ["complete"],
      "source-only",
      [
        mobileScreen("(internal)/(standard)/search.tsx"),
        mobileScreen("(internal)/(tabs)/discover.tsx"),
      ],
      [],
      {
        complete: {
          detail: "No focused mobile search test proves result selection and detail navigation.",
        },
      },
    ),
    web: implemented(
      ["complete"],
      "runtime",
      [webRoute("_protected/search.tsx")],
      [
        webE2e(
          "feed-discovery.spec.ts",
          "athlete searches every API-backed discovery scope and can page results",
        ),
      ],
    ),
  }),
  capability({
    id: "discover.filter-feed",
    title: "Filter discovery results",
    outcome: "A user applies structured discovery filters and receives narrowed results.",
    steps: ["complete"],
    mobile: partial(
      ["complete"],
      "screen/component",
      [
        mobileScreen("(internal)/(tabs)/discover.tsx"),
        `${M}/components/discover/DiscoverFilterSheet.tsx`,
      ],
      [mobileTest("app/(internal)/(tabs)/__tests__/discover-screen.jest.test.tsx")],
      {
        complete: {
          detail:
            "Mobile evidence does not prove the backend interpretation of every exposed filter.",
        },
      },
    ),
    web: implemented(
      ["complete"],
      "runtime",
      [webRoute("_protected/search.tsx")],
      [
        webE2e(
          "feed-discovery.spec.ts",
          "athlete searches every API-backed discovery scope and can page results",
        ),
      ],
    ),
  }),
  capability({
    id: "feed.browse",
    title: "Browse the social feed",
    outcome: "A user refreshes and pages persisted social activity entries.",
    steps: ["browse"],
    mobile: implemented(
      ["browse"],
      "screen/component",
      [mobileScreen("(internal)/(tabs)/discover.tsx"), `${M}/components/feed/FeedList.tsx`],
      [mobileTest("app/(internal)/(tabs)/__tests__/discover-screen.jest.test.tsx")],
    ),
    web: implemented(
      ["browse"],
      "runtime",
      [`${W}/src/components/feed/activity-feed.tsx`, webRoute("_protected/index.tsx")],
      [
        webE2e(
          "feed-discovery.spec.ts",
          "athlete refreshes and pages the persisted social activity feed",
        ),
      ],
    ),
  }),
  capability({
    id: "feed.retry-failed-load",
    title: "Retry a failed feed load",
    outcome: "A feed failure stays distinct from empty data and recovers on retry.",
    steps: ["retry"],
    mobile: implemented(
      ["retry"],
      "screen/component",
      [mobileScreen("(internal)/(tabs)/discover.tsx"), `${M}/components/feed/FeedList.tsx`],
      [mobileTest("app/(internal)/(tabs)/__tests__/discover-screen.jest.test.tsx")],
    ),
    web: implemented(
      ["retry"],
      "runtime",
      [`${W}/src/components/feed/activity-feed.tsx`, webRoute("_protected/index.tsx")],
      [webE2e("feed-discovery.spec.ts", "athlete retries the feed after a refresh failure")],
    ),
  }),
  capability({
    id: "activities.browse-history",
    title: "Browse activity history",
    outcome: "An athlete browses completed activities and opens one.",
    steps: ["browse", "open"],
    mobile: implemented(
      ["browse", "open"],
      "screen/component",
      [mobileScreen("(internal)/(standard)/activities-list.tsx")],
      [mobileTest("app/(internal)/(standard)/__tests__/activities-list-screen.jest.test.tsx")],
    ),
    web: implemented(
      ["browse", "open"],
      "runtime",
      [webRoute("_protected/activities/index.tsx")],
      [
        webE2e(
          "activities.spec.ts",
          "imports real GPX, exposes streams, recovers engagement, enforces sharing, filters history, and deletes",
        ),
      ],
    ),
  }),
  capability({
    id: "activities.inspect-detail",
    title: "Inspect activity detail",
    outcome: "An athlete inspects activity metrics, charts, route, and available analysis.",
    steps: ["detail"],
    mobile: implemented(
      ["detail"],
      "screen/component",
      [
        mobileScreen("(internal)/(standard)/activity-detail.tsx"),
        `${M}/components/activity/charts/MultiMetricChart.tsx`,
        `${M}/components/activity/maps/ActivityRouteMap.tsx`,
      ],
      [mobileTest("app/(internal)/(standard)/__tests__/activity-detail-screen.jest.test.tsx")],
    ),
    web: implemented(
      ["detail"],
      "runtime",
      [webRoute("_protected/activities/$activityId/index.tsx")],
      [
        webE2e(
          "activities.spec.ts",
          "imports real GPX, exposes streams, recovers engagement, enforces sharing, filters history, and deletes",
        ),
      ],
    ),
  }),
  capability({
    id: "activity.import-historical-file",
    title: "Import a historical activity file",
    outcome: "An athlete imports a FIT, GPX, or TCX activity and opens the result.",
    steps: ["complete", "retry"],
    apiCapabilities: ["activityFiles.getSignedUploadUrl", "activityFiles.processActivityFile"],
    mobile: implemented(
      ["complete", "retry"],
      "screen/component",
      [mobileScreen("(internal)/(standard)/activity-import.tsx")],
      [mobileTest("app/(internal)/(standard)/__tests__/activity-import.jest.test.tsx")],
      "No maintained device flow proves a historical file import and visible retry against a live server.",
    ),
    web: implemented(
      ["complete", "retry"],
      "runtime",
      [
        webRoute("_protected/activities/import.tsx"),
        `${W}/src/components/protected/activity-import-form.tsx`,
      ],
      [
        webE2e(
          "activities.spec.ts",
          "keeps the selected file recoverable after a failed parse and retries with valid GPX",
        ),
        webE2e(
          "activities.spec.ts",
          "imports real GPX, exposes streams, recovers engagement, enforces sharing, filters history, and deletes",
        ),
      ],
    ),
  }),
  capability({
    id: "activity.record-session-rpe",
    title: "Record session effort",
    outcome: "An athlete records perceived exertion for a completed activity.",
    steps: ["complete"],
    apiCapabilities: ["activities.recordSessionRpe"],
    mobile: implemented(
      ["complete"],
      "screen/component",
      [`${M}/components/activity/SessionRpeCard.tsx`],
      [mobileTest("components/activity/SessionRpeCard.jest.test.tsx")],
    ),
    web: implemented(
      ["complete"],
      "runtime",
      [
        webRoute("_protected/activities/$activityId/index.tsx"),
        `${W}/src/components/activity/session-rpe-card.tsx`,
      ],
      [
        webE2e(
          "activities.spec.ts",
          "imports real GPX, exposes streams, recovers engagement, enforces sharing, filters history, and deletes",
        ),
      ],
    ),
  }),
  capability({
    id: "activity.like-and-comment",
    requiredTestKinds: ["unit"],
    title: "Like and comment on an activity",
    outcome: "A user likes an activity and posts a comment with retry-safe feedback.",
    steps: ["complete", "retry"],
    mobile: partial(
      ["complete", "retry"],
      "source-only",
      [
        `${M}/components/social/EntityCommentsSection.tsx`,
        mobileScreen("(internal)/(standard)/activity-detail.tsx"),
      ],
      [mobileTest("app/(internal)/(standard)/__tests__/activity-detail-screen.jest.test.tsx")],
      {
        complete: {
          detail: "No focused mobile test proves adding a comment or toggling an activity like.",
        },
        retry: { detail: "No focused mobile test proves comment or like recovery after failure." },
      },
    ),
    web: implemented(
      ["complete", "retry"],
      "runtime",
      [
        webRoute("_protected/activities/$activityId/index.tsx"),
        `${W}/src/components/protected/entity-comments-card.tsx`,
      ],
      [
        webE2e(
          "activities.spec.ts",
          "imports real GPX, exposes streams, recovers engagement, enforces sharing, filters history, and deletes",
        ),
      ],
    ),
  }),
  capability({
    id: "activity.change-visibility",
    requiredTestKinds: ["unit"],
    title: "Change activity visibility",
    outcome: "An activity owner changes who can see a completed activity.",
    steps: ["edit"],
    mobile: partial(
      ["edit"],
      "source-only",
      [mobileScreen("(internal)/(standard)/activity-detail.tsx")],
      [mobileTest("app/(internal)/(standard)/__tests__/activity-detail-screen.jest.test.tsx")],
      {
        edit: {
          detail:
            "The mobile ledger does not identify a focused visibility-persistence test on activity detail.",
        },
      },
    ),
    web: implemented(
      ["edit"],
      "runtime",
      [webRoute("_protected/activities/$activityId/index.tsx")],
      [
        webE2e(
          "activities.spec.ts",
          "imports real GPX, exposes streams, recovers engagement, enforces sharing, filters history, and deletes",
        ),
      ],
    ),
  }),
  capability({
    id: "activity.delete",
    requiredTestKinds: ["unit"],
    title: "Delete an activity",
    outcome: "An owner confirms deletion and returns to activity history.",
    steps: ["delete"],
    mobile: missing(
      ["delete"],
      "No completed-activity deletion flow was identified in the mobile ledger.",
    ),
    web: implemented(
      ["delete"],
      "runtime",
      [
        webRoute("_protected/activities/index.tsx"),
        webRoute("_protected/activities/$activityId/index.tsx"),
      ],
      [
        webE2e(
          "activities.spec.ts",
          "imports real GPX, exposes streams, recovers engagement, enforces sharing, filters history, and deletes",
        ),
        vitest(`${W}/src/components/protected/activity-route-primitives.test.tsx`),
      ],
    ),
  }),
  capability({
    id: "share.open-public-activity-link",
    title: "Share and open a public activity",
    outcome: "Mobile generates a browser share URL and the public web reader enforces visibility.",
    steps: ["open"],
    apiCapabilities: ["publicShare.activity"],
    mobile: implemented(
      ["open"],
      "screen/component",
      [
        mobileScreen("(internal)/(standard)/activity-detail.tsx"),
        `${M}/components/shared/ActivityCard.tsx`,
      ],
      [
        mobileTest("app/(internal)/(standard)/__tests__/activity-detail-screen.jest.test.tsx"),
        mobileTest("components/shared/__tests__/ActivityCard.jest.test.tsx"),
      ],
      "No device flow proves the operating-system share sheet opening the generated browser URL.",
    ),
    web: partial(
      ["open"],
      "runtime",
      [webRoute("share/activities/$activityId.tsx"), `${W}/src/lib/public-share.ts`],
      [
        webE2e(
          "activities.spec.ts",
          "imports real GPX, exposes streams, recovers engagement, enforces sharing, filters history, and deletes",
        ),
        liveDb(
          "packages/api/src/routers/__tests__/public-share-visibility.live-db.test.ts",
          "returns only public activities and hides private and missing ids",
        ),
      ],
      {
        open: {
          detail:
            "Visibility is runtime-tested, but the full public activity disclosure contract is not directly asserted.",
        },
      },
    ),
    differences: [
      {
        difference:
          "Mobile hands the URL to the system share/browser UI; web owns the public reader.",
        rationale:
          "The native app intentionally links to the canonical browser reader instead of duplicating a public native screen.",
      },
    ],
  }),
  capability({
    id: "activity-plan.browse-and-inspect",
    title: "Browse and inspect activity plans",
    outcome: "An athlete finds an activity plan and inspects its structure and targets.",
    steps: ["browse", "detail"],
    mobile: implemented(
      ["browse", "detail"],
      "screen/component",
      [
        mobileScreen("(internal)/(standard)/activity-plans-list.tsx"),
        mobileScreen("(internal)/(standard)/activity-plan-detail.tsx"),
      ],
      [
        mobileTest("app/(internal)/(standard)/__tests__/activity-plans-list-screen.jest.test.tsx"),
        mobileTest("app/(internal)/(standard)/__tests__/activity-plan-detail-route.jest.test.tsx"),
      ],
    ),
    web: implemented(
      ["browse", "detail"],
      "runtime",
      [
        webRoute("_protected/activity-plans/index.tsx"),
        webRoute("_protected/activity-plans/$activityPlanId.tsx"),
      ],
      [webE2e("activity-plans.spec.ts", "athlete can discover and open the activity plan library")],
    ),
  }),
  capability({
    id: "activity-plan.create",
    title: "Create an activity plan",
    outcome: "An athlete creates an activity plan with its initial identity and metadata.",
    steps: ["create"],
    mobile: implemented(
      ["create"],
      "screen/component",
      [
        mobileScreen("(internal)/(standard)/create-activity-plan.tsx"),
        `${M}/components/activity-plan/ActivityPlanComposerScreen.tsx`,
      ],
      [
        mobileTest("app/(internal)/(standard)/__tests__/create-activity-plan-route.jest.test.tsx"),
        mobileTest("components/activity-plan/__tests__/ActivityPlanComposerScreen.jest.test.tsx"),
      ],
    ),
    web: implemented(
      ["create"],
      "runtime",
      [webRoute("_protected/activity-plans/index.tsx")],
      [
        webE2e(
          "activity-plans.spec.ts",
          "athlete can author, edit, schedule, comment on, and dependency-delete a plan",
        ),
      ],
    ),
  }),
  capability({
    id: "activity-plan.edit-basics",
    title: "Edit activity-plan basics",
    outcome: "An owner edits an activity plan's identity and metadata.",
    steps: ["edit"],
    mobile: implemented(
      ["edit"],
      "screen/component",
      [
        mobileScreen("(internal)/(standard)/activity-plan-detail.tsx"),
        `${M}/components/activity-plan/ActivityPlanComposerScreen.tsx`,
      ],
      [mobileTest("components/activity-plan/__tests__/ActivityPlanComposerScreen.jest.test.tsx")],
    ),
    web: implemented(
      ["edit"],
      "runtime",
      [webRoute("_protected/activity-plans/$activityPlanId.tsx")],
      [
        webE2e(
          "activity-plans.spec.ts",
          "athlete can author, edit, schedule, comment on, and dependency-delete a plan",
        ),
      ],
    ),
  }),
  capability({
    id: "activity-plan.edit-structured-steps",
    title: "Edit structured activity-plan steps",
    outcome: "An athlete adds, edits, and validates structured activity steps.",
    steps: ["edit", "complete"],
    mobile: implemented(
      ["edit", "complete"],
      "screen/component",
      [
        `${M}/components/activity-plan/structure/StructureBuilderCard.tsx`,
        `${M}/components/activity-plan/activity/StepEditorDialog.tsx`,
      ],
      [
        mobileTest("components/activity-plan/activity/StepEditorDialog.jest.test.tsx"),
        mobileTest("components/activity-plan/activity/StepDurationField.jest.test.tsx"),
      ],
    ),
    web: implemented(
      ["edit", "complete"],
      "runtime",
      [
        webRoute("_protected/activity-plans/$activityPlanId.tsx"),
        `${W}/src/lib/activity-plan-authoring.ts`,
      ],
      [
        webE2e(
          "activity-plans.spec.ts",
          "athlete can correct an invalid structure and retry authoring",
        ),
        webE2e(
          "activity-plans.spec.ts",
          "athlete can author, edit, schedule, comment on, and dependency-delete a plan",
        ),
      ],
    ),
  }),
  capability({
    id: "activity-plan.duplicate",
    title: "Duplicate an activity plan",
    outcome: "A user copies a shared activity plan into an owned editable plan.",
    steps: ["complete"],
    mobile: partial(
      ["complete"],
      "screen/component",
      [mobileScreen("(internal)/(standard)/activity-plan-detail.tsx")],
      [mobileTest("app/(internal)/(standard)/__tests__/activity-plan-detail-social.jest.test.tsx")],
      {
        complete: {
          detail:
            "Mobile evidence does not prove a successful duplicate followed by editing the owned copy.",
        },
      },
    ),
    web: implemented(
      ["complete"],
      "runtime",
      [webRoute("_protected/activity-plans/$activityPlanId.tsx")],
      [
        webE2e(
          "activity-plans.spec.ts",
          "athlete can duplicate a shared plan into an owned editable copy",
        ),
      ],
    ),
  }),
  capability({
    id: "activity-plan.schedule",
    title: "Schedule an activity plan",
    outcome: "An athlete schedules, reschedules, or removes an activity plan from the calendar.",
    steps: ["complete"],
    mobile: implemented(
      ["complete"],
      "screen/component",
      [
        mobileScreen("(internal)/(standard)/activity-plan-detail.tsx"),
        `${M}/components/ScheduleActivityModal.tsx`,
      ],
      [
        mobileTest("components/__tests__/ScheduleActivityModal.jest.test.tsx"),
        mobileTest(
          "app/(internal)/(standard)/__tests__/activity-plan-detail-scheduling.jest.test.tsx",
        ),
      ],
    ),
    web: implemented(
      ["complete"],
      "runtime",
      [webRoute("_protected/activity-plans/$activityPlanId.tsx")],
      [
        webE2e(
          "activity-plans.spec.ts",
          "athlete can author, edit, schedule, comment on, and dependency-delete a plan",
        ),
      ],
    ),
  }),
  capability({
    id: "activity-plan.like-and-comment",
    title: "Like and comment on an activity plan",
    outcome: "A user likes an activity plan and adds a comment.",
    steps: ["complete"],
    mobile: partial(
      ["complete"],
      "screen/component",
      [
        mobileScreen("(internal)/(standard)/activity-plan-detail.tsx"),
        `${M}/components/activity-plan/useActivityPlanSocialController.ts`,
      ],
      [
        mobileTest(
          "components/activity-plan/__tests__/useActivityPlanSocialController.jest.test.tsx",
        ),
      ],
      {
        complete: {
          detail:
            "Mobile controller tests do not prove the complete persisted like-and-comment user flow.",
        },
      },
    ),
    web: implemented(
      ["complete"],
      "runtime",
      [webRoute("_protected/activity-plans/$activityPlanId.tsx")],
      [
        webE2e(
          "activity-plans.spec.ts",
          "athlete can author, edit, schedule, comment on, and dependency-delete a plan",
        ),
      ],
    ),
  }),
  capability({
    id: "share.open-public-activity-plan-link",
    title: "Open a public activity-plan link",
    outcome: "A visitor opens a public activity-plan reader with visibility enforced.",
    steps: ["open"],
    apiCapabilities: ["publicShare.activityPlan"],
    mobile: missing(
      ["open"],
      "Mobile has activity-plan social controls but no evidenced public activity-plan browser share handoff.",
    ),
    web: partial(
      ["open"],
      "screen/component",
      [webRoute("share/activity-plans/$activityPlanId.tsx"), `${W}/src/lib/public-share.ts`],
      [
        vitest(`${W}/src/routes/share/activity-plans/$activityPlanId.test.tsx`),
        liveDb(
          "packages/api/src/routers/__tests__/public-share-visibility.live-db.test.ts",
          "returns only public activity plans and hides private and missing ids",
        ),
      ],
      {
        open: {
          detail:
            "No focused Playwright flow proves the public activity-plan rendering and visibility boundary.",
        },
      },
    ),
  }),
  capability({
    id: "record.manual-start",
    title: "Start a manual recording",
    outcome: "An athlete starts a manual foreground recording.",
    steps: ["complete"],
    mobile: implemented(
      ["complete"],
      "runtime",
      [
        mobileScreen("(internal)/(tabs)/record-launcher.tsx"),
        mobileScreen("(internal)/record/index.tsx"),
        mobileScreen("(internal)/record/activity.tsx"),
      ],
      [
        maestro(`${M}/.maestro/flows/smoke/record_lifecycle.yaml`, "record.quick_start"),
        mobileTest("app/(internal)/record/__tests__/record-screen.jest.test.tsx"),
        mobileTest("app/(internal)/record/__tests__/activity-screen.jest.test.tsx"),
      ],
    ),
    web: implemented(
      ["complete"],
      "runtime",
      [
        webRoute("_protected/record.tsx"),
        webRoute("_protected/record/index.tsx"),
        webRoute("_protected/record/session.tsx"),
      ],
      [
        webE2e(
          "recording.spec.ts",
          "athlete recovers after refresh, then reviews and discards an atomic finalized artifact",
        ),
      ],
    ),
    differences: [
      {
        difference:
          "Web is a foreground indoor timer; mobile additionally owns native sensor setup.",
        rationale:
          "Browser lifecycle limits and native Bluetooth APIs require intentionally different sensor capture implementations.",
      },
    ],
  }),
  capability({
    id: "record.from-activity-plan",
    title: "Record from an activity plan",
    outcome: "An athlete selects an executable plan and records against its targets and steps.",
    steps: ["complete"],
    mobile: implemented(
      ["complete"],
      "screen/component",
      [
        mobileScreen("(internal)/record/index.tsx"),
        `${M}/lib/services/ActivityRecorder/planExecution.ts`,
        `${M}/lib/services/ActivityRecorder/planSupport.ts`,
      ],
      [
        vitest(`${M}/lib/services/ActivityRecorder/planExecution.test.ts`),
        vitest(`${M}/lib/services/ActivityRecorder/planSupport.test.ts`),
        mobileTest("app/(internal)/record/__tests__/record-screen.jest.test.tsx"),
      ],
    ),
    web: partial(
      ["complete"],
      "screen/component",
      [
        webRoute("_protected/record/plan.tsx"),
        webRoute("_protected/record/index.tsx"),
        webRoute("_protected/record/session.tsx"),
      ],
      [
        vitest(`${W}/src/routes/_protected/record/plan.test.tsx`),
        vitest(`${W}/src/routes/_protected/record/session.test.tsx`),
      ],
      {
        complete: {
          detail:
            "No focused Playwright flow proves plan selection through locked execution and manual step completion.",
        },
      },
    ),
  }),
  capability({
    id: "record.pause",
    title: "Pause recording",
    outcome: "An athlete pauses metric progression without ending the recording.",
    steps: ["pause"],
    mobile: implemented(
      ["pause"],
      "runtime",
      [
        mobileScreen("(internal)/record/index.tsx"),
        `${M}/lib/services/ActivityRecorder/sessionController.ts`,
      ],
      [
        maestro(`${M}/.maestro/flows/smoke/record_lifecycle.yaml`, "record.quick_start"),
        mobileTest("lib/services/ActivityRecorder/lifecycle.jest.test.ts"),
      ],
    ),
    web: implemented(
      ["pause"],
      "runtime",
      [webRoute("_protected/record/session.tsx"), `${W}/src/lib/recording/provider.tsx`],
      [
        webE2e(
          "recording.spec.ts",
          "athlete recovers after refresh, then reviews and discards an atomic finalized artifact",
        ),
      ],
    ),
  }),
  capability({
    id: "record.resume",
    title: "Resume recording",
    outcome: "An athlete resumes metric progression in the same paused recording.",
    steps: ["resume"],
    mobile: implemented(
      ["resume"],
      "runtime",
      [
        mobileScreen("(internal)/record/index.tsx"),
        `${M}/lib/services/ActivityRecorder/sessionController.ts`,
      ],
      [
        maestro(`${M}/.maestro/flows/smoke/record_lifecycle.yaml`, "record.quick_start"),
        mobileTest("lib/services/ActivityRecorder/lifecycle.jest.test.ts"),
      ],
    ),
    web: implemented(
      ["resume"],
      "runtime",
      [webRoute("_protected/record/session.tsx"), `${W}/src/lib/recording/provider.tsx`],
      [
        webE2e(
          "recording.spec.ts",
          "athlete recovers after refresh, then reviews and discards an atomic finalized artifact",
        ),
      ],
    ),
  }),
  capability({
    id: "record.finish",
    title: "Finish recording",
    outcome: "An athlete freezes an active recording into one finalized local artifact.",
    steps: ["finish"],
    mobile: implemented(
      ["finish"],
      "runtime",
      [
        mobileScreen("(internal)/record/index.tsx"),
        `${M}/lib/services/ActivityRecorder/finalizedArtifactStorage.ts`,
      ],
      [
        maestro(`${M}/.maestro/flows/smoke/record_lifecycle.yaml`, "record.quick_start"),
        mobileTest("app/(internal)/record/__tests__/record-screen.jest.test.tsx"),
      ],
    ),
    web: implemented(
      ["finish"],
      "runtime",
      [webRoute("_protected/record/session.tsx"), `${W}/src/lib/recording/finalized-artifact.ts`],
      [
        webE2e(
          "recording.spec.ts",
          "athlete recovers after refresh, then reviews and discards an atomic finalized artifact",
        ),
      ],
    ),
  }),
  capability({
    id: "record.review-finalized",
    title: "Review a finalized recording",
    outcome:
      "An athlete reviews the summary and laps from one finalized recording before deciding what to do.",
    steps: ["detail"],
    mobile: implemented(
      ["detail"],
      "screen/component",
      [mobileScreen("(internal)/record/submit.tsx")],
      [mobileTest("app/(internal)/record/__tests__/submit-screen.jest.test.tsx")],
      "The maintained device flow reaches review, but no physical-device assertion checks the finalized summary and laps.",
    ),
    web: implemented(
      ["detail"],
      "runtime",
      [webRoute("_protected/record/session.tsx")],
      [
        webE2e(
          "recording.spec.ts",
          "athlete recovers after refresh, then reviews and discards an atomic finalized artifact",
        ),
      ],
    ),
  }),
  capability({
    id: "record.submit-finalized",
    title: "Submit a finalized recording",
    outcome: "An athlete saves one finalized recording as one completed activity.",
    steps: ["submit"],
    apiCapabilities: [
      "activities.createFromRecordingSummary",
      "activityFiles.beginMobileRecordingUpload",
    ],
    mobile: implemented(
      ["submit"],
      "screen/component",
      [mobileScreen("(internal)/record/submit.tsx"), `${M}/lib/hooks/useActivitySubmission.ts`],
      [
        mobileTest("app/(internal)/record/__tests__/submit-screen.jest.test.tsx"),
        vitest(`${M}/lib/services/fit/ActivityFileUploader.test.ts`),
      ],
      "No maintained device flow submits a finalized recording to a live server.",
    ),
    web: implemented(
      ["submit"],
      "runtime",
      [webRoute("_protected/record/session.tsx"), `${W}/src/lib/recording/submission-queue.ts`],
      [
        webE2e(
          "recording.spec.ts",
          "offline saves stay idempotent in IndexedDB and retry through the server handoff",
        ),
      ],
    ),
  }),
  capability({
    id: "record.discard-finalized",
    title: "Discard a finalized recording",
    outcome: "An athlete discards a local finalized recording without submitting it.",
    steps: ["discard"],
    mobile: implemented(
      ["discard"],
      "screen/component",
      [
        mobileScreen("(internal)/record/submit.tsx"),
        `${M}/lib/services/ActivityRecorder/finalizedArtifactStorage.ts`,
      ],
      [
        mobileTest("app/(internal)/record/__tests__/submit-screen.jest.test.tsx"),
        vitest(`${M}/lib/services/ActivityRecorder/finalizedArtifactStorage.test.ts`),
      ],
    ),
    web: implemented(
      ["discard"],
      "runtime",
      [webRoute("_protected/record/session.tsx")],
      [
        webE2e(
          "recording.spec.ts",
          "athlete recovers after refresh, then reviews and discards an atomic finalized artifact",
        ),
      ],
    ),
  }),
  capability({
    id: "record.retry-failed-submit",
    title: "Retry a failed recording submission",
    outcome: "A failed recording submission retries without creating duplicate work.",
    steps: ["retry"],
    mobile: partial(
      ["retry"],
      "screen/component",
      [
        mobileScreen("(internal)/record/submit.tsx"),
        `${M}/lib/services/activitySubmissionQueue/runner.ts`,
      ],
      [
        vitest(`${M}/lib/services/activitySubmissionQueue/runner.test.ts`),
        vitest(`${M}/lib/services/activitySubmissionQueue/storage.test.ts`),
      ],
      {
        retry: {
          detail: "No device flow proves the visible queue state and eventual successful retry.",
        },
      },
    ),
    web: implemented(
      ["retry"],
      "runtime",
      [webRoute("_protected/record/session.tsx"), `${W}/src/lib/recording/submission-queue.ts`],
      [
        webE2e(
          "recording.spec.ts",
          "offline saves stay idempotent in IndexedDB and retry through the server handoff",
        ),
      ],
    ),
  }),
  capability({
    id: "record.attach-route",
    title: "Attach a route to recording",
    outcome:
      "An athlete selects or uploads a route, attaches it to recording configuration, and retains the association on the resulting activity.",
    steps: ["complete"],
    mobile: implemented(
      ["complete"],
      "screen/component",
      [
        mobileScreen("(internal)/record/index.tsx"),
        mobileScreen("(internal)/(standard)/route-upload.tsx"),
        `${M}/lib/hooks/useRouteUpload.ts`,
      ],
      [
        mobileTest("app/(internal)/(standard)/__tests__/route-upload.jest.test.tsx"),
        mobileTest("lib/validation/route-upload.jest.test.ts"),
      ],
    ),
    web: partial(
      ["complete"],
      "source-only",
      [
        webRoute("_protected/record/route/index.tsx"),
        webRoute("_protected/record/route-preview/$routeId.tsx"),
      ],
      [
        webE2e(
          "capability-p0-route-gaps.spec.ts",
          "recording route preview carries the selected route into recording setup",
        ),
      ],
      {
        complete: {
          detail:
            "The web route redirects without carrying a route ID into recording or persisting an association.",
        },
      },
    ),
  }),
  capability({
    id: "record.transfer-cross-tab",
    requiredTestKinds: ["unit"],
    title: "Transfer browser recorder ownership",
    outcome: "A browser recording transfers to another tab while fencing the old owner.",
    steps: ["complete"],
    policy: "web_only",
    mobile: intentional(
      ["complete"],
      "Native recording has one app-owned recorder service, so browser-tab ownership transfer does not apply.",
    ),
    web: implemented(
      ["complete"],
      "runtime",
      [webRoute("_protected/record/session.tsx"), `${W}/src/lib/recording/provider.tsx`],
      [
        webE2e(
          "recording.spec.ts",
          "cross-tab takeover fences the old recorder and recovers in the new tab",
        ),
        vitest(`${W}/src/lib/recording-web.test.ts`),
      ],
    ),
  }),
  capability({
    id: "record.gps-free-live-session",
    title: "Keep live recording GPS-free",
    outcome:
      "An athlete records on web or mobile without a location permission, coordinate stream, or coordinate-bearing recording artifact.",
    steps: ["complete"],
    mobile: implemented(
      ["complete"],
      "screen/component",
      [
        `${M}/app.config.ts`,
        mobileScreen("(internal)/record/activity.tsx"),
        mobileScreen("(internal)/record/index.tsx"),
        `${M}/lib/services/ActivityRecorder/fitRecordWriter.ts`,
      ],
      [
        vitest(`${M}/lib/services/ActivityRecorder/recordingPrivacyPolicy.test.ts`),
        vitest(`${M}/lib/services/ActivityRecorder/fitRecordWriter.roundtrip.test.ts`),
      ],
      "No physical-device flow proves that a new recording never triggers a location prompt or emits coordinates.",
    ),
    web: implemented(
      ["complete"],
      "screen/component",
      [
        webRoute("_protected/record/session.tsx"),
        `${W}/src/lib/recording/provider.tsx`,
        "packages/core/schemas/recording-session.ts",
      ],
      [vitest(`${W}/src/routes/_protected/record/session.test.tsx`)],
      "No focused browser flow asserts that recording never requests geolocation or persists coordinates.",
    ),
    differences: [
      {
        difference:
          "Mobile can pair native Bluetooth sensors; the browser recorder remains timer-first.",
        rationale:
          "The GPS-free policy is shared, while native Bluetooth support requires operating-system APIs unavailable to the browser recorder.",
      },
    ],
  }),
  capability({
    id: "record.sensor-discovery",
    title: "Discover a native recording sensor",
    outcome: "A mobile athlete scans for and sees a supported nearby Bluetooth sensor.",
    steps: ["complete"],
    policy: "mobile_only",
    mobile: implemented(
      ["complete"],
      "screen/component",
      [
        mobileScreen("(internal)/record/sensors.tsx"),
        `${M}/lib/services/ActivityRecorder/BleScanController.ts`,
      ],
      [mobileTest("lib/services/ActivityRecorder/sensors.jest.test.ts")],
      "No physical-hardware journey proves nearby-sensor discovery.",
    ),
    web: intentional(
      ["complete"],
      "The approved browser recorder intentionally has no BLE sensor bridge.",
    ),
  }),
  capability({
    id: "record.sensor-connect",
    title: "Connect a native recording sensor",
    outcome: "A mobile athlete connects one selected Bluetooth sensor to the recorder.",
    steps: ["complete"],
    policy: "mobile_only",
    mobile: implemented(
      ["complete"],
      "screen/component",
      [
        mobileScreen("(internal)/record/sensors.tsx"),
        `${M}/lib/services/ActivityRecorder/sensors.ts`,
        `${M}/lib/services/ActivityRecorder/DeviceGattQueue.ts`,
      ],
      [mobileTest("lib/services/ActivityRecorder/sensors.jest.test.ts")],
      "No physical-hardware journey proves a selected sensor connection.",
    ),
    web: intentional(
      ["complete"],
      "The approved browser recorder intentionally has no BLE sensor bridge.",
    ),
  }),
  capability({
    id: "record.sensor-measurements",
    title: "Stream native sensor measurements",
    outcome: "A connected native sensor supplies live recording metrics without GPS.",
    steps: ["complete"],
    policy: "mobile_only",
    mobile: implemented(
      ["complete"],
      "screen/component",
      [
        `${M}/lib/services/ActivityRecorder/sensors.ts`,
        `${M}/lib/services/ActivityRecorder/LiveMetricsManager.ts`,
        `${M}/lib/services/ActivityRecorder/index.ts`,
      ],
      [
        mobileTest("lib/services/ActivityRecorder/sensors.jest.test.ts"),
        vitest(`${M}/lib/services/ActivityRecorder/LiveMetricsManager.test.ts`),
      ],
      "No physical-hardware journey proves a measurement stream into a live recording.",
    ),
    web: intentional(
      ["complete"],
      "The approved browser recorder intentionally has no BLE sensor bridge.",
    ),
  }),
  capability({
    id: "record.sensor-reconnect",
    title: "Reconnect a native recording sensor",
    outcome:
      "A known native sensor reconnects after an unexpected disconnect without changing recorder ownership.",
    steps: ["recover"],
    policy: "mobile_only",
    mobile: implemented(
      ["recover"],
      "screen/component",
      [
        `${M}/lib/services/ActivityRecorder/sensors.ts`,
        `${M}/lib/services/ActivityRecorder/KnownSensorRegistry.ts`,
      ],
      [mobileTest("lib/services/ActivityRecorder/sensors.jest.test.ts")],
      "No physical-hardware journey proves disconnect and successful reconnection.",
    ),
    web: intentional(
      ["recover"],
      "The approved browser recorder intentionally has no BLE sensor bridge.",
    ),
  }),
  capability({
    id: "record.ftms-command",
    title: "Execute an FTMS trainer command",
    outcome:
      "A mobile athlete or planned activity sends one supported target command to a connected trainer.",
    steps: ["complete"],
    policy: "mobile_only",
    mobile: implemented(
      ["complete"],
      "screen/component",
      [
        `${M}/components/recording/cockpit/cards/TrainerInsightCard.tsx`,
        `${M}/lib/services/ActivityRecorder/FTMSController.ts`,
        `${M}/lib/services/ActivityRecorder/trainerControl.ts`,
      ],
      [
        vitest(`${M}/lib/services/ActivityRecorder/FTMSController.test.ts`),
        vitest(`${M}/lib/services/ActivityRecorder/trainerControl.test.ts`),
      ],
      "No physical FTMS journey proves that a target command is accepted by a trainer.",
    ),
    web: intentional(
      ["complete"],
      "The browser recorder intentionally excludes native FTMS trainer control.",
    ),
  }),
  capability({
    id: "record.ftms-control-recovery",
    title: "Recover FTMS trainer control",
    outcome:
      "A mobile recording reports lost trainer control and safely reacquires it after reconnect.",
    steps: ["recover"],
    policy: "mobile_only",
    mobile: implemented(
      ["recover"],
      "screen/component",
      [
        `${M}/lib/services/ActivityRecorder/FTMSController.ts`,
        `${M}/lib/services/ActivityRecorder/trainerControl.ts`,
      ],
      [
        vitest(`${M}/lib/services/ActivityRecorder/FTMSController.test.ts`),
        vitest(`${M}/lib/services/ActivityRecorder/trainerControl.test.ts`),
      ],
      "No physical FTMS journey proves control loss and successful reacquisition.",
    ),
    web: intentional(
      ["recover"],
      "The browser recorder intentionally excludes native FTMS trainer control.",
    ),
  }),
  capability({
    id: "calendar.navigate-views",
    title: "Navigate calendar views",
    outcome: "An athlete navigates dates and inspects planned items for a day or range.",
    steps: ["complete"],
    mobile: implemented(
      ["complete"],
      "screen/component",
      [
        mobileScreen("(internal)/(tabs)/calendar.tsx"),
        mobileScreen("(internal)/(standard)/calendar-day.tsx"),
      ],
      [
        mobileTest("app/(internal)/(tabs)/__tests__/calendar-screen.jest.test.tsx"),
        mobileTest("app/(internal)/(standard)/__tests__/calendar-day-screen.jest.test.tsx"),
      ],
    ),
    web: implemented(
      ["complete"],
      "runtime",
      [
        webRoute("_protected/calendar.tsx"),
        webRoute("_protected/calendar/index.tsx"),
        webRoute("_protected/calendar/day/$date.tsx"),
      ],
      [
        webE2e(
          "planning.spec.ts",
          "planning.training-path and calendar.navigation expose the server-composed scheduled path",
        ),
      ],
    ),
  }),
  capability({
    id: "calendar.create-event",
    title: "Create a calendar event",
    outcome: "An athlete creates a durable one-off or recurring calendar event.",
    steps: ["create"],
    mobile: implemented(
      ["create"],
      "screen/component",
      [
        mobileScreen("(internal)/(standard)/agenda-create.tsx"),
        mobileScreen("(internal)/(standard)/event-detail.tsx"),
      ],
      [
        mobileTest("app/(internal)/(standard)/__tests__/event-detail-create.jest.test.tsx"),
        mobileTest("components/calendar/__tests__/PersonalPlannedSessionCreate.jest.test.tsx"),
      ],
    ),
    web: implemented(
      ["create"],
      "runtime",
      [
        webRoute("_protected/calendar/new.tsx"),
        webRoute("_protected/calendar/events/$eventId/index.tsx"),
      ],
      [
        webE2e(
          "calendar-events.spec.ts",
          "calendar.events creates durable one-off, all-day, and bounded recurring events",
        ),
      ],
    ),
  }),
  capability({
    id: "calendar.edit-event",
    title: "Edit a calendar event",
    outcome: "An athlete edits the intended occurrence, future range, or recurring series.",
    steps: ["edit"],
    mobile: partial(
      ["edit"],
      "screen/component",
      [
        mobileScreen("(internal)/(standard)/event-detail-update.tsx"),
        mobileScreen("(internal)/(standard)/event-detail.tsx"),
      ],
      [mobileTest("app/(internal)/(standard)/__tests__/event-detail-update.jest.test.tsx")],
      {
        edit: {
          detail:
            "Mobile evidence does not establish single, future, and whole-series recurrence scopes.",
        },
      },
    ),
    web: implemented(
      ["edit"],
      "runtime",
      [
        webRoute("_protected/calendar/events/$eventId/edit.tsx"),
        webRoute("_protected/calendar/events/$eventId/index.tsx"),
      ],
      [
        webE2e(
          "calendar-events.spec.ts",
          "calendar.events applies single, future, and series updates to exact recurring rows",
        ),
      ],
    ),
  }),
  capability({
    id: "calendar.delete-event",
    title: "Delete a calendar event",
    outcome: "An athlete deletes only the intended occurrence or recurring scope.",
    steps: ["delete"],
    mobile: partial(
      ["delete"],
      "screen/component",
      [mobileScreen("(internal)/(standard)/event-detail.tsx")],
      [
        mobileTest(
          "app/(internal)/(standard)/__tests__/event-detail-delete-redirect.jest.test.tsx",
        ),
      ],
      {
        delete: {
          detail:
            "Mobile evidence proves redirect behavior but not every recurring deletion scope.",
        },
      },
    ),
    web: implemented(
      ["delete"],
      "runtime",
      [webRoute("_protected/calendar/events/$eventId/index.tsx")],
      [
        webE2e(
          "calendar-events.spec.ts",
          "calendar.events applies delete scopes exactly and does not disclose athlete events to coaches",
        ),
      ],
    ),
  }),
  capability({
    id: "planning.view-training-path",
    title: "View the training path",
    outcome: "An athlete views scheduled work, adherence, and available load projections.",
    steps: ["complete"],
    mobile: implemented(
      ["complete"],
      "screen/component",
      [
        mobileScreen("(internal)/(tabs)/plan.tsx"),
        `${M}/components/plan/training-path/TrainingPathChart.tsx`,
      ],
      [
        mobileTest("app/(internal)/(tabs)/__tests__/plan-navigation.jest.test.tsx"),
        mobileTest("app/(internal)/(tabs)/__tests__/plan-range-hydration.jest.test.tsx"),
      ],
    ),
    web: implemented(
      ["complete"],
      "runtime",
      [webRoute("_protected/plan.tsx")],
      [
        webE2e(
          "planning.spec.ts",
          "planning.training-path and calendar.navigation expose the server-composed scheduled path",
        ),
      ],
    ),
  }),
  capability({
    id: "planning.view-day-agenda",
    title: "View a day agenda",
    outcome:
      "An athlete selects any day and sees its planned and completed information in one agenda.",
    steps: ["complete"],
    mobile: implemented(
      ["complete"],
      "screen/component",
      [
        mobileScreen("(internal)/(standard)/calendar-day.tsx"),
        mobileScreen("(internal)/(standard)/planning-ledger.tsx"),
      ],
      [mobileTest("app/(internal)/(standard)/__tests__/calendar-day-screen.jest.test.tsx")],
    ),
    web: implemented(
      ["complete"],
      "screen/component",
      [webRoute("_protected/calendar/day/$date.tsx")],
      [vitest(`${W}/src/routes/_protected/calendar/day/$date.test.tsx`)],
    ),
  }),
  capability({
    id: "training-plan.browse",
    title: "Browse training plans",
    outcome: "An athlete browses owned and template training plans and opens one.",
    steps: ["browse", "open"],
    mobile: implemented(
      ["browse", "open"],
      "screen/component",
      [
        mobileScreen("(internal)/(standard)/training-plans-list.tsx"),
        mobileScreen("(internal)/(standard)/training-plan-detail.tsx"),
      ],
      [
        mobileTest("app/(internal)/(standard)/__tests__/training-plans-list-screen.jest.test.tsx"),
        mobileTest("app/(internal)/(standard)/__tests__/training-plan-deeplink.jest.test.tsx"),
      ],
    ),
    web: implemented(
      ["browse", "open"],
      "runtime",
      [
        webRoute("_protected/training-plans/index.tsx"),
        webRoute("_protected/training-plans/$planId/index.tsx"),
      ],
      [
        webE2e(
          "training-plans.spec.ts",
          "athlete can browse persisted owned and template training-plan libraries",
        ),
      ],
    ),
  }),
  capability({
    id: "training-plan.create",
    title: "Create a training plan",
    outcome: "An athlete previews and creates a multi-week training plan.",
    steps: ["create"],
    mobile: implemented(
      ["create"],
      "screen/component",
      [mobileScreen("(internal)/(standard)/training-plan-create.tsx")],
      [
        mobileTest(
          "components/training-plan/create/__tests__/TrainingPlanBuilderScreen.jest.test.tsx",
        ),
        mobileTest(
          "components/training-plan/create/__tests__/useTrainingPlanBuilderController.jest.test.tsx",
        ),
      ],
    ),
    web: implemented(
      ["create"],
      "runtime",
      [webRoute("_protected/training-plans/create.tsx")],
      [
        webE2e(
          "training-plans.spec.ts",
          "athlete creates, reloads, edits, and cleans a persisted training plan",
        ),
      ],
    ),
  }),
  capability({
    id: "training-plan.edit",
    title: "Edit a training plan",
    outcome: "An athlete edits and persists an existing multi-week training plan.",
    steps: ["edit"],
    mobile: implemented(
      ["edit"],
      "screen/component",
      [mobileScreen("(internal)/(standard)/training-plan-edit.tsx")],
      [
        mobileTest(
          "components/training-plan/create/__tests__/TrainingPlanBuilderScreen.jest.test.tsx",
        ),
        mobileTest(
          "components/training-plan/create/__tests__/useTrainingPlanBuilderController.jest.test.tsx",
        ),
      ],
    ),
    web: implemented(
      ["edit"],
      "runtime",
      [webRoute("_protected/training-plans/$planId/edit.tsx")],
      [
        webE2e(
          "training-plans.spec.ts",
          "athlete creates, reloads, edits, and cleans a persisted training plan",
        ),
      ],
    ),
  }),
  capability({
    id: "training-plan.apply-and-remove-schedule",
    title: "Apply and remove a training-plan schedule",
    outcome: "An athlete applies a training plan and later removes its generated schedule safely.",
    steps: ["complete"],
    mobile: partial(
      ["complete"],
      "screen/component",
      [mobileScreen("(internal)/(standard)/training-plan-detail.tsx")],
      [
        mobileTest(
          "components/training-plan/__tests__/TrainingPlanDetailHeaderActionsSection.jest.test.tsx",
        ),
      ],
      {
        complete: {
          detail:
            "Full apply/remove success and revision-conflict behavior are not established on mobile.",
        },
      },
    ),
    web: partial(
      ["complete"],
      "source-only",
      [webRoute("_protected/training-plans/$planId/index.tsx")],
      [],
      {
        complete: {
          detail:
            "The focused browser suite does not prove each apply-template and remove-schedule mutation.",
        },
      },
    ),
  }),
  capability({
    id: "training-preferences.edit",
    title: "Edit training preferences",
    outcome: "An athlete validates, saves, and restores training preferences.",
    steps: ["edit"],
    mobile: implemented(
      ["edit"],
      "screen/component",
      [mobileScreen("(internal)/(standard)/training-preferences.tsx")],
      [
        mobileTest(
          "components/settings/training-preferences/TrainingPreferencesEditor.jest.test.tsx",
        ),
        mobileTest(
          "components/settings/training-preferences/TrainingPreferencesBottomSheet.jest.test.tsx",
        ),
      ],
    ),
    web: implemented(
      ["edit"],
      "runtime",
      [webRoute("_protected/training-preferences.tsx")],
      [
        webE2e(
          "training-plans.spec.ts",
          "athlete preferences hydrate, validate, persist, reload, and restore",
        ),
      ],
    ),
  }),
  capability({
    id: "share.open-public-training-plan-link",
    title: "Share and open a public training plan",
    outcome: "Mobile generates a browser URL and a visitor opens the public training-plan reader.",
    steps: ["open"],
    apiCapabilities: ["publicShare.trainingPlan"],
    mobile: implemented(
      ["open"],
      "screen/component",
      [
        mobileScreen("(internal)/(standard)/training-plan-detail.tsx"),
        `${M}/components/training-plan/useTrainingPlanHeaderSocialActions.ts`,
      ],
      [
        mobileTest(
          "components/training-plan/__tests__/TrainingPlanDetailHeaderActionsSection.jest.test.tsx",
        ),
      ],
    ),
    web: partial(
      ["open"],
      "source-only",
      [webRoute("share/training-plans/$trainingPlanId.tsx"), `${W}/src/lib/public-share.ts`],
      [
        liveDb(
          "packages/api/src/routers/__tests__/public-share-visibility.live-db.test.ts",
          "returns only public training plans and hides private and missing ids",
        ),
      ],
      {
        open: {
          detail:
            "No focused Playwright flow proves public training-plan rendering and visibility.",
        },
      },
    ),
    differences: [
      {
        difference: "Mobile hands off a canonical public URL; web renders the public reader.",
        rationale:
          "The native product intentionally uses the browser reader for anonymous public access.",
      },
    ],
  }),
  capability({
    id: "goals.browse-and-inspect",
    title: "Browse and inspect goals",
    outcome: "An athlete opens goals and inspects progress and readiness information.",
    steps: ["browse", "detail"],
    mobile: implemented(
      ["browse", "detail"],
      "screen/component",
      [
        mobileScreen("(internal)/(standard)/goals-list.tsx"),
        mobileScreen("(internal)/(standard)/goal-detail.tsx"),
      ],
      [
        mobileTest("app/(internal)/(standard)/__tests__/goals-list-screen.jest.test.tsx"),
        mobileTest("components/goals/__tests__/GoalIntelligenceCard.jest.test.tsx"),
      ],
    ),
    web: implemented(
      ["browse", "detail"],
      "runtime",
      [
        webRoute("_protected/goals.tsx"),
        webRoute("_protected/goals/index.tsx"),
        webRoute("_protected/goals/$goalId/index.tsx"),
      ],
      [webE2e("goals.spec.ts", "goals.lifecycle and goals.intelligence persist exact owned goals")],
    ),
  }),
  capability({
    id: "goals.create",
    title: "Create a goal",
    outcome: "An athlete validates and creates an owned goal.",
    steps: ["create"],
    mobile: implemented(
      ["create"],
      "screen/component",
      [mobileScreen("(internal)/(standard)/goal-create.tsx")],
      [
        mobileTest("app/(internal)/(standard)/__tests__/goal-create.jest.test.tsx"),
        mobileTest("components/goals/__tests__/GoalEditorForm.layout.jest.test.tsx"),
      ],
    ),
    web: implemented(
      ["create"],
      "runtime",
      [webRoute("_protected/goals/new.tsx")],
      [webE2e("goals.spec.ts", "goals.lifecycle and goals.intelligence persist exact owned goals")],
    ),
  }),
  capability({
    id: "goals.edit",
    title: "Edit a goal",
    outcome: "An athlete edits and persists an owned goal.",
    steps: ["edit"],
    mobile: implemented(
      ["edit"],
      "screen/component",
      [mobileScreen("(internal)/(standard)/goal-edit.tsx")],
      [mobileTest("components/goals/__tests__/GoalEditorForm.layout.jest.test.tsx")],
    ),
    web: implemented(
      ["edit"],
      "runtime",
      [webRoute("_protected/goals/$goalId/edit.tsx")],
      [webE2e("goals.spec.ts", "goals.lifecycle and goals.intelligence persist exact owned goals")],
    ),
  }),
  capability({
    id: "goals.delete",
    requiredTestKinds: ["unit"],
    title: "Delete a goal",
    outcome: "An athlete deletes an owned goal safely.",
    steps: ["delete"],
    mobile: missing(
      ["delete"],
      "No mobile goal-deletion flow was identified in the mobile ledger.",
    ),
    web: implemented(
      ["delete"],
      "runtime",
      [webRoute("_protected/goals/$goalId/index.tsx")],
      [
        webE2e("goals.spec.ts", "goals.lifecycle and goals.intelligence persist exact owned goals"),
        vitest(`${W}/src/components/planning/goal-card.test.tsx`),
      ],
    ),
  }),
  capability({
    id: "routes.browse-and-inspect",
    title: "Browse and inspect saved routes",
    outcome: "An athlete finds a saved route and inspects its map, elevation, and metadata.",
    steps: ["browse", "detail"],
    mobile: implemented(
      ["browse", "detail"],
      "screen/component",
      [
        mobileScreen("(internal)/(standard)/routes-list.tsx"),
        mobileScreen("(internal)/(standard)/route-detail.tsx"),
      ],
      [
        mobileTest("app/(internal)/(standard)/__tests__/routes-list-screen.jest.test.tsx"),
        mobileTest("app/(internal)/(standard)/__tests__/route-detail-screen.jest.test.tsx"),
      ],
    ),
    web: implemented(
      ["browse", "detail"],
      "runtime",
      [webRoute("_protected/routes/index.tsx"), webRoute("_protected/routes/$routeId/index.tsx")],
      [
        webE2e(
          "routes.spec.ts",
          "athlete can retry an XML upload and use the persisted route journey",
        ),
      ],
    ),
  }),
  capability({
    id: "routes.upload",
    title: "Upload a route",
    outcome: "An athlete validates and uploads a GPX or XML route file.",
    steps: ["complete", "retry"],
    mobile: implemented(
      ["complete", "retry"],
      "screen/component",
      [mobileScreen("(internal)/(standard)/route-upload.tsx")],
      [
        mobileTest("app/(internal)/(standard)/__tests__/route-upload.jest.test.tsx"),
        mobileTest("lib/validation/route-upload.jest.test.ts"),
      ],
    ),
    web: partial(
      ["complete", "retry"],
      "runtime",
      [webRoute("_protected/routes/upload.tsx")],
      [
        webE2e(
          "routes.spec.ts",
          "athlete can retry an XML upload and use the persisted route journey",
        ),
      ],
      {
        complete: {
          detail:
            "The upload browser journey is skipped unless service-role credentials are available.",
        },
      },
    ),
  }),
  capability({
    id: "routes.edit-metadata",
    title: "Edit route metadata",
    outcome: "A route owner edits and persists route name or description.",
    steps: ["edit"],
    mobile: implemented(
      ["edit"],
      "screen/component",
      [
        mobileScreen("(internal)/(standard)/route-edit.tsx"),
        mobileScreen("(internal)/(standard)/route-detail.tsx"),
      ],
      [mobileTest("app/(internal)/(standard)/__tests__/route-edit.jest.test.tsx")],
    ),
    web: implemented(
      ["edit"],
      "runtime",
      [webRoute("_protected/routes/$routeId/index.tsx")],
      [
        webE2e(
          "routes.spec.ts",
          "athlete can retry an XML upload and use the persisted route journey",
        ),
      ],
    ),
  }),
  capability({
    id: "routes.attach-to-calendar-event",
    title: "Attach a route to a calendar event",
    outcome: "An athlete associates a saved route with a calendar event.",
    steps: ["complete"],
    mobile: partial(
      ["complete"],
      "source-only",
      [
        mobileScreen("(internal)/(standard)/event-detail-update.tsx"),
        mobileScreen("(internal)/(standard)/route-detail.tsx"),
      ],
      [mobileTest("app/(internal)/(standard)/__tests__/capability-p1-routes.jest.test.tsx")],
      {
        complete: {
          detail:
            "No focused mobile test proves that route attachment persists and returns on the event.",
        },
      },
    ),
    web: implemented(
      ["complete"],
      "runtime",
      [
        webRoute("_protected/routes/$routeId/index.tsx"),
        `${W}/src/components/routes/route-event-attachment.tsx`,
      ],
      [
        webE2e(
          "capability-p1-routes.spec.ts",
          "routes.attach-to-calendar-event persists the selected route on an event",
        ),
        vitest(`${W}/src/components/routes/route-event-attachment.test.tsx`),
      ],
    ),
  }),
  capability({
    id: "routes.delete",
    requiredTestKinds: ["unit"],
    title: "Delete a route",
    outcome: "A route owner deletes a route and can understand pending storage deletion.",
    steps: ["delete", "recover"],
    mobile: missing(
      ["delete", "recover"],
      "No route deletion or deletion-pending recovery flow was identified on mobile.",
    ),
    web: partial(
      ["delete", "recover"],
      "runtime",
      [webRoute("_protected/routes/$routeId/index.tsx")],
      [
        webE2e(
          "routes.spec.ts",
          "athlete can retry an XML upload and use the persisted route journey",
        ),
        vitest(`${W}/src/components/routes/route-edit-form.test.tsx`),
      ],
      {
        recover: {
          detail:
            "The browser test seeds deletion-pending state directly and does not prove the asynchronous worker transition.",
        },
      },
    ),
  }),
  capability({
    id: "profile.view",
    title: "View a profile",
    outcome: "A user views their own or another permitted profile and linked content.",
    steps: ["open"],
    mobile: implemented(
      ["open"],
      "screen/component",
      [
        mobileScreen("(internal)/(tabs)/profile.tsx"),
        mobileScreen("(internal)/(standard)/user/[userId].tsx"),
      ],
      [
        mobileTest("app/(internal)/(tabs)/__tests__/profile-screen.jest.test.tsx"),
        mobileTest("app/(internal)/(standard)/__tests__/user-detail-screen.jest.test.tsx"),
      ],
    ),
    web: implemented(
      ["open"],
      "runtime",
      [webRoute("_protected/user/$userId/index.tsx")],
      [webE2e("profiles-social.spec.ts", "profile hub and settings expose owned profile journeys")],
    ),
  }),
  capability({
    id: "profile.edit",
    title: "Edit profile settings",
    outcome: "A user edits identity, units, theme, and profile images.",
    steps: ["edit"],
    mobile: implemented(
      ["edit"],
      "screen/component",
      [mobileScreen("(internal)/(standard)/profile-edit.tsx")],
      [
        mobileTest("app/(internal)/(standard)/__tests__/profile-edit.jest.test.tsx"),
        vitest(`${M}/lib/profile/__tests__/profile-edit-form.test.ts`),
      ],
    ),
    web: partial(
      ["edit"],
      "runtime",
      [webRoute("_protected/settings.tsx")],
      [webE2e("profiles-social.spec.ts", "profile hub and settings expose owned profile journeys")],
      {
        edit: {
          detail:
            "The browser journey exposes controls but does not prove profile, image, units, and theme persistence.",
        },
      },
    ),
  }),
  capability({
    id: "settings.select-theme",
    title: "Select and retain a theme",
    outcome: "A user selects light, dark, or system appearance and sees it restored.",
    steps: ["complete"],
    mobile: implemented(
      ["complete"],
      "screen/component",
      [`${M}/lib/stores/theme-store.ts`, mobileScreen("_layout.tsx")],
      [mobileTest("lib/stores/theme-store.jest.test.ts")],
    ),
    web: partial(
      ["complete"],
      "screen/component",
      [webRoute("_protected/settings.tsx")],
      [vitest(`${W}/src/routes/_protected/settings.test.tsx`)],
      {
        complete: {
          detail: "No browser journey proves that a changed web theme persists after reload.",
        },
      },
    ),
  }),
  capability({
    id: "social.request-follow",
    title: "Request and resolve a follow",
    outcome: "A user requests a private follow and the recipient accepts or rejects it.",
    steps: ["complete"],
    mobile: partial(
      ["complete"],
      "source-only",
      [
        mobileScreen("(internal)/(standard)/user/[userId].tsx"),
        mobileScreen("(internal)/(standard)/notifications/index.tsx"),
      ],
      [],
      {
        complete: {
          detail:
            "Mobile evidence does not prove the full request, notification, accept-or-reject lifecycle.",
        },
      },
    ),
    web: implemented(
      ["complete"],
      "runtime",
      [webRoute("_protected/user/$userId/index.tsx"), webRoute("_protected/notifications.tsx")],
      [
        webE2e(
          "profiles-social.spec.ts",
          "private profiles protect details while a follow request persists and is restored",
        ),
        webE2e(
          "messaging-notifications.spec.ts",
          "rejects and accepts follow requests from notifications",
        ),
      ],
    ),
  }),
  capability({
    id: "social.browse-followers",
    title: "Browse followers and following",
    outcome: "A user opens follower and following lists with empty and recovery states.",
    steps: ["browse", "recover"],
    mobile: partial(
      ["browse", "recover"],
      "source-only",
      [
        mobileScreen("(internal)/(standard)/followers.tsx"),
        mobileScreen("(internal)/(standard)/following.tsx"),
      ],
      [],
      {
        browse: {
          detail:
            "No focused mobile test proves follower or following list content and navigation.",
        },
        recover: { detail: "No focused mobile test proves empty, pagination, or retry behavior." },
      },
    ),
    web: implemented(
      ["browse", "recover"],
      "runtime",
      [
        webRoute("_protected/user/$userId/followers.tsx"),
        webRoute("_protected/user/$userId/following.tsx"),
      ],
      [
        webE2e(
          "profiles-social.spec.ts",
          "social graph pages expose data, empty, error recovery, and bounded controls",
        ),
      ],
    ),
  }),
  capability({
    id: "groups.browse-and-join",
    title: "Browse and join groups",
    outcome: "A user discovers a group, opens it, and joins or requests membership.",
    steps: ["browse", "complete"],
    mobile: partial(
      ["browse", "complete"],
      "screen/component",
      [
        mobileScreen("(internal)/(tabs)/groups.tsx"),
        mobileScreen("(internal)/(standard)/group-detail.tsx"),
      ],
      [
        mobileTest("components/groups/__tests__/GroupList.jest.test.tsx"),
        mobileTest("app/(internal)/(standard)/__tests__/group-requests.jest.test.tsx"),
      ],
      {
        complete: {
          detail:
            "Mobile evidence does not prove every open-group join and closed-group request outcome.",
        },
      },
    ),
    web: implemented(
      ["browse", "complete"],
      "runtime",
      [webRoute("_protected/groups/index.tsx"), webRoute("_protected/groups/$groupId/index.tsx")],
      [
        webE2e(
          "groups-events.spec.ts",
          "a member discovers, joins, reloads, RSVPs, and cannot manage the owner's group",
        ),
      ],
    ),
  }),
  capability({
    id: "groups.create",
    title: "Create a group",
    outcome: "An owner validates and creates a group.",
    steps: ["create"],
    mobile: partial(
      ["create"],
      "source-only",
      [mobileScreen("(internal)/(standard)/group-create.tsx")],
      [],
      { create: { detail: "No dedicated mobile route test proves group creation." } },
    ),
    web: implemented(
      ["create"],
      "runtime",
      [webRoute("_protected/groups/new.tsx")],
      [
        webE2e(
          "groups-events.spec.ts",
          "owner creates, edits, RSVPs to, cancels an event, and archives its group",
        ),
      ],
    ),
  }),
  capability({
    id: "groups.edit",
    title: "Edit a group",
    outcome: "An owner edits and persists group details.",
    steps: ["edit"],
    mobile: partial(
      ["edit"],
      "source-only",
      [mobileScreen("(internal)/(standard)/group-edit.tsx")],
      [],
      { edit: { detail: "No dedicated mobile route test proves group editing." } },
    ),
    web: implemented(
      ["edit"],
      "runtime",
      [webRoute("_protected/groups/$groupId/edit.tsx")],
      [
        webE2e(
          "groups-events.spec.ts",
          "owner creates, edits, RSVPs to, cancels an event, and archives its group",
        ),
      ],
    ),
  }),
  capability({
    id: "group.manage-invitations",
    title: "Manage group invitations and requests",
    outcome: "Members and owners act on invitations and pending join requests.",
    steps: ["complete"],
    mobile: partial(
      ["complete"],
      "screen/component",
      [
        mobileScreen("(internal)/(standard)/group-invites.tsx"),
        mobileScreen("(internal)/(standard)/group-join-requests.tsx"),
        mobileScreen("(internal)/(standard)/group-requests.tsx"),
      ],
      [mobileTest("app/(internal)/(standard)/__tests__/group-requests.jest.test.tsx")],
      {
        complete: {
          detail:
            "Invitation acceptance and owner-side request approval are not fully proven on mobile.",
        },
      },
    ),
    web: partial(
      ["complete"],
      "source-only",
      [
        webRoute("_protected/groups/$groupId/requests.tsx"),
        webRoute("_protected/groups/index.tsx"),
      ],
      [],
      {
        complete: {
          detail:
            "The browser journey checks empty request tabs but does not execute invitation or approval actions.",
        },
      },
    ),
  }),
  capability({
    id: "groups.manage-members",
    title: "Manage group members",
    outcome: "A group owner changes supported member roles or membership safely.",
    steps: ["complete"],
    mobile: partial(
      ["complete"],
      "source-only",
      [mobileScreen("(internal)/(standard)/group-members.tsx")],
      [],
      { complete: { detail: "No focused mobile route test proves a member-management action." } },
    ),
    web: partial(
      ["complete"],
      "source-only",
      [
        webRoute("_protected/groups/$groupId/members.tsx"),
        webRoute("_protected/groups/$groupId/requests.tsx"),
      ],
      [],
      {
        complete: {
          detail:
            "No browser journey proves promotion, removal, ownership transfer, or request approval.",
        },
      },
    ),
  }),
  capability({
    id: "group-event.create",
    title: "Create a group event",
    outcome: "A group owner creates a scheduled group event.",
    steps: ["create"],
    mobile: implemented(
      ["create"],
      "screen/component",
      [mobileScreen("(internal)/(standard)/group-event-create.tsx")],
      [mobileTest("app/(internal)/(standard)/__tests__/event-detail-create.jest.test.tsx")],
    ),
    web: implemented(
      ["create"],
      "runtime",
      [webRoute("_protected/groups/$groupId/events/new.tsx")],
      [
        webE2e(
          "groups-events.spec.ts",
          "owner creates, edits, RSVPs to, cancels an event, and archives its group",
        ),
      ],
    ),
  }),
  capability({
    id: "group-event.edit",
    title: "Edit a group event",
    outcome: "A group owner edits and persists event details.",
    steps: ["edit"],
    mobile: implemented(
      ["edit"],
      "screen/component",
      [mobileScreen("(internal)/(standard)/group-event-edit.tsx")],
      [mobileTest("app/(internal)/(standard)/__tests__/group-event-edit.jest.test.tsx")],
    ),
    web: implemented(
      ["edit"],
      "runtime",
      [webRoute("_protected/groups/events/$groupEventId/edit.tsx")],
      [
        webE2e(
          "groups-events.spec.ts",
          "owner creates, edits, RSVPs to, cancels an event, and archives its group",
        ),
      ],
    ),
  }),
  capability({
    id: "group-event.delete",
    title: "Cancel or delete a group event",
    outcome: "A group owner removes or cancels a group event safely.",
    steps: ["delete"],
    mobile: implemented(
      ["delete"],
      "screen/component",
      [mobileScreen("(internal)/(standard)/group-event-detail.tsx")],
      [
        mobileTest(
          "app/(internal)/(standard)/__tests__/event-detail-delete-redirect.jest.test.tsx",
        ),
      ],
    ),
    web: implemented(
      ["delete"],
      "runtime",
      [webRoute("_protected/groups/events/$groupEventId/index.tsx")],
      [
        webE2e(
          "groups-events.spec.ts",
          "owner creates, edits, RSVPs to, cancels an event, and archives its group",
        ),
      ],
    ),
  }),
  capability({
    id: "group-event.rsvp",
    title: "RSVP to a group event",
    outcome: "A permitted member changes attendance without seeing owner-only controls.",
    steps: ["complete"],
    mobile: partial(
      ["complete"],
      "screen/component",
      [mobileScreen("(internal)/(standard)/group-event-detail.tsx")],
      [
        mobileTest("app/(internal)/(standard)/__tests__/group-event-detail.jest.test.tsx"),
        mobileTest("app/(internal)/(standard)/__tests__/group-event-detail-access.jest.test.tsx"),
      ],
      {
        complete: {
          detail:
            "Mobile tests establish access presentation more clearly than successful remote RSVP persistence.",
        },
      },
    ),
    web: implemented(
      ["complete"],
      "runtime",
      [webRoute("_protected/groups/events/$groupEventId/index.tsx")],
      [
        webE2e(
          "groups-events.spec.ts",
          "a member discovers, joins, reloads, RSVPs, and cannot manage the owner's group",
        ),
      ],
    ),
  }),
  capability({
    id: "messaging.open-conversation",
    title: "Open a conversation",
    outcome: "A user browses conversation threads and reads one.",
    steps: ["browse", "open"],
    mobile: partial(
      ["browse", "open"],
      "screen/component",
      [
        mobileScreen("(internal)/(standard)/messages/index.tsx"),
        mobileScreen("(internal)/(standard)/messages/[id].tsx"),
      ],
      [mobileTest("app/(internal)/(standard)/__tests__/messages-list-screen.jest.test.tsx")],
      { open: { detail: "No focused mobile conversation-detail test was identified." } },
    ),
    web: implemented(
      ["browse", "open"],
      "runtime",
      [webRoute("_protected/messages.tsx")],
      [
        webE2e(
          "messaging-notifications.spec.ts",
          "creates a DM and a three-actor group with independent unread state",
        ),
      ],
    ),
  }),
  capability({
    id: "messaging.start-direct-message",
    title: "Start a direct message",
    outcome: "A user selects a recipient and sends the first direct message.",
    steps: ["complete"],
    mobile: implemented(
      ["complete"],
      "screen/component",
      [mobileScreen("(internal)/(standard)/messages/new.tsx")],
      [mobileTest("app/(internal)/(standard)/__tests__/messages-new-screen.jest.test.tsx")],
    ),
    web: implemented(
      ["complete"],
      "runtime",
      [webRoute("_protected/messages.tsx")],
      [
        webE2e(
          "messaging-notifications.spec.ts",
          "creates a DM and a three-actor group with independent unread state",
        ),
      ],
    ),
  }),
  capability({
    id: "messaging.create-group-conversation",
    title: "Create a group conversation",
    outcome: "A user starts a multi-person conversation with independent unread state.",
    steps: ["complete"],
    mobile: missing(
      ["complete"],
      "The mobile ledger identifies direct-message composition but no proven group-conversation creation flow.",
    ),
    web: implemented(
      ["complete"],
      "runtime",
      [webRoute("_protected/messages.tsx")],
      [
        webE2e(
          "messaging-notifications.spec.ts",
          "creates a DM and a three-actor group with independent unread state",
        ),
      ],
    ),
  }),
  capability({
    id: "notifications.browse",
    title: "Browse notifications",
    outcome: "A user views notification items and follows their destinations.",
    steps: ["browse"],
    mobile: implemented(
      ["browse"],
      "screen/component",
      [mobileScreen("(internal)/(standard)/notifications/index.tsx")],
      [mobileTest("app/(internal)/(standard)/__tests__/notifications.jest.test.tsx")],
    ),
    web: implemented(
      ["browse"],
      "runtime",
      [webRoute("_protected/notifications.tsx")],
      [
        webE2e(
          "screen-functionality.spec.ts",
          "every protected top-level screen renders without a route failure",
        ),
      ],
    ),
  }),
  capability({
    id: "notifications.mark-read",
    title: "Mark notifications read",
    outcome: "A user updates notification read state and sees it persist.",
    steps: ["complete"],
    mobile: implemented(
      ["complete"],
      "screen/component",
      [mobileScreen("(internal)/(standard)/notifications/index.tsx")],
      [mobileTest("app/(internal)/(standard)/__tests__/notifications.jest.test.tsx")],
    ),
    web: partial(["complete"], "source-only", [webRoute("_protected/notifications.tsx")], [], {
      complete: { detail: "Browser evidence does not prove successful mark-all-read persistence." },
    }),
  }),
  capability({
    id: "coaching.protected-entry",
    title: "Protect coaching workspaces",
    outcome: "Only authorized coaches enter organization coaching routes.",
    steps: ["complete"],
    policy: "web_only",
    mobile: intentional(
      ["complete"],
      "The approved mobile product remains athlete-focused and intentionally excludes organization coaching administration.",
    ),
    web: implemented(
      ["complete"],
      "runtime",
      [
        webRoute("_coaching.tsx"),
        webRoute("_coaching/organizations/$organizationId.tsx"),
        webRoute("_coaching/organizations/$organizationId/index.tsx"),
        webRoute("_coaching/organizations/index.tsx"),
      ],
      [
        webE2e(
          "smoke.spec.ts",
          "organization coaching routes fail closed outside an authorized coach membership",
        ),
      ],
    ),
    differences: [
      {
        difference: "Organization coaching administration is web-only.",
        rationale:
          "Dense multi-athlete administration is an approved browser workspace rather than an unimplemented mobile request.",
      },
    ],
  }),
  capability({
    id: "coaching.view-dashboard",
    title: "View authorized coaching dashboard",
    outcome: "An authorized coach views organization athlete and coaching information.",
    steps: ["open"],
    policy: "web_only",
    mobile: intentional(
      ["open"],
      "The approved mobile product intentionally excludes the organization coaching dashboard.",
    ),
    web: partial(
      ["open"],
      "source-only",
      [webRoute("_coaching/organizations/$organizationId/dashboard.tsx")],
      [],
      {
        open: {
          detail: "No authorized-coach Playwright flow establishes functional dashboard behavior.",
        },
      },
    ),
  }),
] as const;

/** Development-only or framework-generated routes with no independent product outcome. */
export const paritySurfaceExceptions = [
  {
    path: "apps/mobile/app/(external)/storybook.tsx",
    rationale:
      "The checked-in Storybook route is a development-only component explorer, not a shipped user capability.",
  },
] as const;

// Compatibility aliases for callers migrating from the broad feature registry.
export const crossPlatformFeatureRegistry = atomicCapabilityRegistry;
export const crossPlatformFeatureSchema = atomicCapabilitySchema;
export type CrossPlatformFeature = AtomicCapability;
export type AtomicCapabilityId = (typeof atomicCapabilityRegistry)[number]["id"];
