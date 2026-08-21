import { getRequiredWebParityFeatures, type ParityFeatureId } from "@repo/core/parity";
import {
  type JourneyEvidence,
  type JourneyEvidenceVerificationStatus,
  journeyEvidenceSchema,
} from "@repo/core/testing/journeys";

export type WebJourneyFeatureRelation = "approximate" | "direct" | "umbrella";

export type WebJourneyFeatureMapping = {
  featureId: ParityFeatureId;
  rationale?: string;
  relation: WebJourneyFeatureRelation;
};

export type WebJourneyRuntimeVerification = {
  evidence: readonly JourneyEvidence[];
  status: JourneyEvidenceVerificationStatus;
};

export type WebJourneyCoverageEntry = {
  mappings: readonly WebJourneyFeatureMapping[];
  runtimeVerification: WebJourneyRuntimeVerification;
};

export type WebJourneyCoverageManifest = Readonly<Record<string, WebJourneyCoverageEntry>>;

function entry(...mappings: WebJourneyFeatureMapping[]): WebJourneyCoverageEntry {
  return {
    mappings,
    runtimeVerification: {
      evidence: [],
      status: "declared",
    },
  };
}

function direct(featureId: ParityFeatureId): WebJourneyFeatureMapping {
  return { featureId, relation: "direct" };
}

function umbrella(featureId: ParityFeatureId, rationale: string): WebJourneyFeatureMapping {
  return { featureId, rationale, relation: "umbrella" };
}

function approximate(featureId: ParityFeatureId, rationale: string): WebJourneyFeatureMapping {
  return { featureId, rationale, relation: "approximate" };
}

const groupDiscoveryRationale =
  "The feature registry has no group feature; discover.browse is the nearest discovery surface.";
const groupManagementRationale =
  "The feature registry has no group administration feature; profile.settings is the nearest owned-resource management surface.";
const groupRelationshipRationale =
  "The feature registry has no group membership feature; profile.user_detail is the nearest actor relationship surface.";
const groupEventRationale =
  "The feature registry has no group-event feature; scheduled event and calendar features own the shared event lifecycle.";

/**
 * One entry per canonical mobile-to-web journey. Runtime verification starts as declared-only and
 * can only advance with machine-produced runtime-flow evidence.
 */
export const webJourneyCoverageManifest = {
  // Authentication and onboarding
  "auth.guards": entry(
    direct("auth.sign_in"),
    umbrella(
      "auth.auth_error",
      "Guard failures surface through the shared authentication error boundary.",
    ),
  ),
  "auth.identity-onboarding": entry(
    direct("account.onboarding"),
    umbrella(
      "home.dashboard",
      "Successful onboarding terminates at the authenticated home surface.",
    ),
  ),
  "auth.sign-in-return": entry(direct("auth.sign_in"), direct("auth.callback")),
  "auth.sign-out": entry(
    umbrella(
      "profile.settings",
      "The parity registry models sign-out inside the settings surface.",
    ),
  ),
  "auth.sign-up-verify": entry(
    direct("auth.sign_up"),
    direct("auth.verify_email"),
    direct("auth.callback"),
    direct("auth.verification_success"),
  ),
  "auth.password-recovery": entry(direct("auth.forgot_password"), direct("auth.reset_password")),
  "onboarding.baselines": entry(direct("account.onboarding")),
  "onboarding.preferences-goals": entry(
    direct("account.onboarding"),
    umbrella("planning.plan_tab", "The initial goal becomes planning input after onboarding."),
  ),
  "onboarding.social-provider": entry(
    direct("account.onboarding"),
    direct("integrations.management"),
    approximate(
      "discover.browse",
      "The registry has no onboarding-specific group or social feature.",
    ),
  ),

  // Feed, discovery, and social profiles
  "feed.timeline": entry(
    umbrella(
      "home.dashboard",
      "The registry has no feed feature; the timeline is the authenticated home surface.",
    ),
  ),
  "discover.scopes": entry(direct("discover.browse")),
  "discover.filters": entry(direct("discover.browse")),
  "profiles.public": entry(direct("profile.user_detail")),
  "social.follow": entry(direct("profile.user_detail")),
  "social.followers": entry(direct("profile.followers"), direct("profile.following")),
  "social.profile-dm": entry(direct("profile.user_detail"), direct("messaging.new")),

  // Groups and group events: the parity feature registry has no direct group IDs.
  "groups.library": entry(
    approximate("discover.browse", groupDiscoveryRationale),
    approximate("profile.settings", groupManagementRationale),
  ),
  "groups.crud": entry(approximate("profile.settings", groupManagementRationale)),
  "groups.membership": entry(
    approximate("profile.user_detail", groupRelationshipRationale),
    approximate("profile.settings", groupManagementRationale),
  ),
  "groups.invitations": entry(
    approximate("profile.settings", groupManagementRationale),
    approximate(
      "notifications.list",
      "The registry has no group invitation feature; notifications is the nearest invitation inbox.",
    ),
  ),
  "groups.roles": entry(approximate("profile.settings", groupManagementRationale)),
  "group-events.crud": entry(
    approximate("scheduled_activities.event_detail", groupEventRationale),
    approximate("scheduled_activities.event_update", groupEventRationale),
    approximate("planning.calendar_tab", groupEventRationale),
  ),
  "group-events.rsvp": entry(
    approximate("scheduled_activities.event_detail", groupEventRationale),
    approximate("planning.calendar_tab", groupEventRationale),
  ),
  "group-events.attachments": entry(
    direct("routes.detail"),
    direct("activity_plans.detail"),
    approximate("scheduled_activities.event_detail", groupEventRationale),
  ),

  // Planning, calendar, scheduled activities, and goals
  "planning.training-path": entry(direct("planning.plan_tab")),
  "calendar.navigation": entry(
    direct("planning.calendar_tab"),
    direct("scheduled_activities.calendar_day"),
  ),
  "agenda.create": entry(
    direct("planning.calendar_tab"),
    direct("scheduled_activities.event_detail"),
  ),
  "events.recurrence": entry(
    direct("scheduled_activities.event_detail"),
    direct("scheduled_activities.event_update"),
    direct("planning.calendar_tab"),
  ),
  "goals.lifecycle": entry(direct("goals.detail"), direct("planning.plan_tab")),
  "goals.intelligence": entry(direct("goals.detail"), direct("planning.plan_tab")),

  // Activity plans
  "activity-plans.library-detail": entry(
    direct("activity_plans.list"),
    direct("activity_plans.detail"),
  ),
  "activity-plans.search-filter-page": entry(direct("activity_plans.list")),
  "activity-plans.rich-detail": entry(direct("activity_plans.detail")),
  "activity-plans.author": entry(direct("activity_plans.create")),
  "activity-plans.duplicate": entry(direct("activity_plans.detail")),
  "activity-plans.schedule": entry(
    direct("activity_plans.detail"),
    direct("scheduled_activities.event_detail"),
  ),
  "activity-plans.delete": entry(direct("activity_plans.detail")),

  // Training plans and preferences
  "training-plans.library": entry(direct("training_plans.list")),
  "training-plans.detail": entry(direct("training_plans.detail")),
  "training-plans.composer": entry(direct("training_plans.create"), direct("training_plans.edit")),
  "training-plans.schedule": entry(
    direct("training_plans.detail"),
    direct("scheduled_activities.event_detail"),
  ),
  "training-plans.social": entry(
    direct("training_plans.detail"),
    approximate(
      "profile.user_detail",
      "The registry has no training-plan social feature; profile detail owns the actor relationship.",
    ),
  ),
  "training-preferences": entry(direct("profile.training_preferences")),

  // Completed activities and imports
  "activities.library": entry(direct("activities.list")),
  "activities.rich-detail": entry(direct("activities.detail")),
  "activities.social": entry(direct("activities.detail")),
  "activities.visibility-share": entry(direct("activities.detail")),
  "activities.delete": entry(direct("activities.detail")),
  "activities.import": entry(direct("activities.import")),

  // Routes
  "routes.library": entry(direct("routes.list")),
  "routes.detail": entry(direct("routes.detail")),
  "routes.edit": entry(direct("routes.detail")),
  "routes.upload": entry(direct("routes.upload")),
  "routes.delete": entry(direct("routes.detail")),
  "routes.attach-plan": entry(direct("activity_plans.create"), direct("routes.detail")),
  "routes.attach-event": entry(
    direct("scheduled_activities.event_detail"),
    direct("routes.detail"),
  ),
  "routes.record-entry": entry(direct("record.session")),

  // Profile and settings
  "profile.hub": entry(
    umbrella("profile.settings", "The profile hub is the account-owned resource summary surface."),
    direct("activities.list"),
    direct("activity_plans.list"),
    direct("training_plans.list"),
    direct("routes.list"),
  ),
  "profile.edit": entry(direct("profile.edit")),
  "profile.units": entry(
    direct("profile.edit"),
    umbrella(
      "profile.settings",
      "Unit preference is managed from settings and affects other surfaces.",
    ),
  ),
  "profile.theme": entry(direct("profile.settings")),
  "profile.email": entry(
    direct("profile.settings"),
    umbrella("auth.verify_email", "Email changes reuse the verified-email lifecycle."),
  ),
  "profile.password": entry(
    umbrella("profile.settings", "The registry has no account-security settings feature."),
  ),
  "profile.sign-out": entry(direct("profile.settings")),

  // Provider integrations
  "integrations.status": entry(direct("integrations.management")),
  "integrations.oauth": entry(direct("integrations.management")),
  "integrations.reconnect": entry(direct("integrations.management")),
  "integrations.disconnect": entry(direct("integrations.management")),
  "integrations.polling": entry(direct("integrations.management")),
  "integrations.capability-truth": entry(direct("integrations.management")),

  // Messaging and notifications
  "messaging.inbox": entry(direct("messaging.list"), direct("messaging.detail")),
  "messaging.dm": entry(direct("messaging.new"), direct("messaging.detail")),
  "messaging.group": entry(direct("messaging.new"), direct("messaging.detail")),
  "messaging.mobile-viewport": entry(direct("messaging.list"), direct("messaging.new")),
  "notifications.inbox": entry(direct("notifications.list")),
  "notifications.follow-actions": entry(
    direct("notifications.list"),
    direct("profile.user_detail"),
  ),

  // Recording and recovery
  "recording.quick-timer": entry(
    direct("record.launcher"),
    direct("record.activity"),
    direct("record.session"),
    direct("record.submit"),
  ),
  "recording.plan-route": entry(direct("record.session")),
  "recording.refresh": entry(direct("record.session")),
  "recording.cross-tab": entry(direct("record.session")),
  "recording.finish": entry(direct("record.session"), direct("record.submit")),
  "recording.submission": entry(direct("record.submit")),
  "recording.sensors": entry(direct("record.sensors"), direct("record.ftms")),
} as const satisfies WebJourneyCoverageManifest;

export type WebJourneyCoverageId = keyof typeof webJourneyCoverageManifest;

export type WebFeatureRuntimeCoverage = {
  approximateJourneyIds: string[];
  directJourneyIds: string[];
  featureId: ParityFeatureId;
  mappedJourneyIds: string[];
  runtimeVerificationStatus: JourneyEvidenceVerificationStatus;
  runtimeVerifiedJourneyIds: string[];
  umbrellaJourneyIds: string[];
};

export function getWebJourneyRuntimeCoverageReport(
  manifest: WebJourneyCoverageManifest = webJourneyCoverageManifest,
  requiredFeatureIds: readonly ParityFeatureId[] = getRequiredWebParityFeatures().map(
    (feature) => feature.id,
  ),
) {
  const journeyRows = Object.entries(manifest).map(([journeyId, coverage]) => ({
    journeyId,
    status: validateRuntimeVerification(journeyId, coverage.runtimeVerification),
  }));
  const featureIdSet = new Set(requiredFeatureIds);

  for (const [journeyId, coverage] of Object.entries(manifest)) {
    if (coverage.mappings.length === 0) {
      throw new Error(`${journeyId} has no parity feature mappings.`);
    }

    const duplicateFeatureIds = duplicateValues(
      coverage.mappings.map((mapping) => mapping.featureId),
    );
    if (duplicateFeatureIds.length > 0) {
      throw new Error(
        `${journeyId} has duplicate feature mappings: ${duplicateFeatureIds.join(", ")}`,
      );
    }

    for (const mapping of coverage.mappings) {
      if (!featureIdSet.has(mapping.featureId)) {
        throw new Error(`${journeyId} maps to non-required feature ${mapping.featureId}.`);
      }
      if (mapping.relation !== "direct" && !mapping.rationale?.trim()) {
        throw new Error(
          `${journeyId} ${mapping.relation} mapping to ${mapping.featureId} requires a rationale.`,
        );
      }
    }
  }

  const features: WebFeatureRuntimeCoverage[] = requiredFeatureIds.map((featureId) => {
    const mapped = Object.entries(manifest).filter(([, coverage]) =>
      coverage.mappings.some((mapping) => mapping.featureId === featureId),
    );
    if (mapped.length === 0) {
      throw new Error(`Required web parity feature ${featureId} has no mapped journeys.`);
    }

    const statuses = mapped.map(([journeyId, coverage]) =>
      validateRuntimeVerification(journeyId, coverage.runtimeVerification),
    );
    const mappedJourneyIds = mapped.map(([journeyId]) => journeyId).sort();

    return {
      approximateJourneyIds: mapped
        .filter(([, coverage]) =>
          coverage.mappings.some(
            (mapping) => mapping.featureId === featureId && mapping.relation === "approximate",
          ),
        )
        .map(([journeyId]) => journeyId)
        .sort(),
      directJourneyIds: mapped
        .filter(([, coverage]) =>
          coverage.mappings.some(
            (mapping) => mapping.featureId === featureId && mapping.relation === "direct",
          ),
        )
        .map(([journeyId]) => journeyId)
        .sort(),
      featureId,
      mappedJourneyIds,
      runtimeVerificationStatus: minimumVerificationStatus(statuses),
      runtimeVerifiedJourneyIds: mapped
        .filter(
          ([journeyId, coverage]) =>
            validateRuntimeVerification(journeyId, coverage.runtimeVerification) ===
            "runtime_verified",
        )
        .map(([journeyId]) => journeyId)
        .sort(),
      umbrellaJourneyIds: mapped
        .filter(([, coverage]) =>
          coverage.mappings.some(
            (mapping) => mapping.featureId === featureId && mapping.relation === "umbrella",
          ),
        )
        .map(([journeyId]) => journeyId)
        .sort(),
    };
  });

  return {
    features: {
      declared: features.filter((feature) => feature.runtimeVerificationStatus === "declared")
        .length,
      denominator: features.length,
      percentage: percentage(
        features.filter((feature) => feature.runtimeVerificationStatus === "runtime_verified")
          .length,
        features.length,
      ),
      rows: features,
      runtimeVerified: features.filter(
        (feature) => feature.runtimeVerificationStatus === "runtime_verified",
      ).length,
      syntaxChecked: features.filter(
        (feature) => feature.runtimeVerificationStatus === "syntax_checked",
      ).length,
    },
    journeys: {
      declared: journeyRows.filter((journey) => journey.status === "declared").length,
      denominator: journeyRows.length,
      percentage: percentage(
        journeyRows.filter((journey) => journey.status === "runtime_verified").length,
        journeyRows.length,
      ),
      runtimeVerified: journeyRows.filter((journey) => journey.status === "runtime_verified")
        .length,
      syntaxChecked: journeyRows.filter((journey) => journey.status === "syntax_checked").length,
    },
  };
}

function validateRuntimeVerification(
  journeyId: string,
  verification: WebJourneyRuntimeVerification,
): JourneyEvidenceVerificationStatus {
  const validatedEvidence = verification.evidence.map((evidence, index) => {
    const result = journeyEvidenceSchema.safeParse(evidence);
    if (!result.success) {
      throw new Error(
        `${journeyId} has invalid runtime evidence at index ${index}: ${result.error.issues
          .map((issue) => issue.message)
          .join(", ")}`,
      );
    }
    return result.data;
  });

  for (const evidence of validatedEvidence) {
    if (evidence.verificationStatus === "runtime_verified" && !evidence.execution) {
      throw new Error(`${journeyId} has runtime-verified evidence without execution metadata.`);
    }
  }

  const hasMachineRuntimeEvidence = validatedEvidence.some(
    (evidence) =>
      evidence.kind === "runtime_flow" &&
      evidence.verificationStatus === "runtime_verified" &&
      evidence.execution?.source === "machine",
  );
  if (verification.status === "runtime_verified" && !hasMachineRuntimeEvidence) {
    throw new Error(`${journeyId} claims runtime verification without machine runtime evidence.`);
  }

  return verification.status;
}

function minimumVerificationStatus(
  statuses: readonly JourneyEvidenceVerificationStatus[],
): JourneyEvidenceVerificationStatus {
  if (statuses.every((status) => status === "runtime_verified")) return "runtime_verified";
  if (statuses.every((status) => status !== "declared")) return "syntax_checked";
  return "declared";
}

function percentage(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Number(((numerator / denominator) * 100).toFixed(1));
}

function duplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}
