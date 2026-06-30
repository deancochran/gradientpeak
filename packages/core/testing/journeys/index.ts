import { z } from "zod";
import type { ParityFeatureId } from "../../parity";

export const journeyPlatformSchema = z.enum(["mobile", "web"]);
export type JourneyPlatform = z.infer<typeof journeyPlatformSchema>;

export const journeyImplementationStatusSchema = z.enum([
  "planned",
  "scaffold",
  "partial",
  "validated",
]);
export type JourneyImplementationStatus = z.infer<typeof journeyImplementationStatusSchema>;

export const journeyCriticalitySchema = z.enum(["smoke", "critical", "extended"]);
export type JourneyCriticality = z.infer<typeof journeyCriticalitySchema>;

export const journeyEvidenceKindSchema = z.enum([
  "domain_test",
  "component_test",
  "route_test",
  "runtime_flow",
  "performance_flow",
]);
export type JourneyEvidenceKind = z.infer<typeof journeyEvidenceKindSchema>;

export const journeyEvidenceSchema = z.object({
  kind: journeyEvidenceKindSchema,
  path: z.string().min(1),
  status: journeyImplementationStatusSchema,
});
export type JourneyEvidence = z.infer<typeof journeyEvidenceSchema>;

export const journeyCoverageSchema = z.object({
  evidence: z.array(journeyEvidenceSchema).default([]),
  notes: z.array(z.string().min(1)).default([]),
  selectors: z.record(z.string().min(1), z.string().min(1)).default({}),
  status: journeyImplementationStatusSchema,
});
export type JourneyCoverage = z.infer<typeof journeyCoverageSchema>;
export type JourneyCoverageInput = z.input<typeof journeyCoverageSchema>;

export const productJourneySchema = z.object({
  acceptance: z.array(z.string().min(1)).min(1),
  area: z.string().min(1),
  criticality: journeyCriticalitySchema,
  fixtures: z.array(z.string().min(1)).default([]),
  id: z.string().min(1),
  parityFeatureIds: z.array(z.string().min(1)).default([]),
  requiredSelectorKeys: z.array(z.string().min(1)).default([]),
  title: z.string().min(1),
});
export type ProductJourney = Omit<z.infer<typeof productJourneySchema>, "parityFeatureIds"> & {
  parityFeatureIds: ParityFeatureId[];
};

export type ProductJourneyId = (typeof productJourneyRegistry)[number]["id"];

/**
 * Framework-neutral product journeys that should have equivalent behavioral
 * coverage across app surfaces over time. App-specific manifests attach the
 * actual selectors, files, and runtime flows that satisfy these contracts.
 */
export const productJourneyRegistry = [
  {
    acceptance: [
      "unauthenticated users can reach the sign-in screen",
      "email and password can be entered",
      "a valid sign-in reaches the authenticated app shell",
    ],
    area: "auth",
    criticality: "smoke",
    fixtures: ["standard_user"],
    id: "auth.sign_in",
    parityFeatureIds: ["auth.sign_in"],
    requiredSelectorKeys: [
      "screen",
      "emailInput",
      "passwordInput",
      "submitButton",
      "authenticatedTab",
    ],
    title: "Sign in",
  },
  {
    acceptance: [
      "new or incomplete users can reach onboarding",
      "required onboarding choices can be completed",
      "completion lands in the authenticated app shell",
    ],
    area: "account",
    criticality: "critical",
    fixtures: ["onboarding_user"],
    id: "account.onboarding",
    parityFeatureIds: ["account.onboarding"],
    requiredSelectorKeys: ["screen", "completeButton", "authenticatedTab"],
    title: "Complete onboarding",
  },
  {
    acceptance: [
      "authenticated users can open the training plan composer",
      "a plan name can be entered",
      "users can move through goals and review",
      "the save action is visible when the draft is ready",
    ],
    area: "training_plans",
    criticality: "critical",
    fixtures: ["standard_user"],
    id: "training_plan.create",
    parityFeatureIds: ["training_plans.create"],
    requiredSelectorKeys: ["screen", "nameInput", "goalsTab", "reviewTab", "saveButton"],
    title: "Create training plan",
  },
  {
    acceptance: [
      "authenticated users can open a shared activity plan",
      "the plan can be duplicated or scheduled from its detail surface",
      "the scheduled copy can be removed or unscheduled without stale UI state",
    ],
    area: "activity_plans",
    criticality: "critical",
    fixtures: ["standard_user", "shared_plan_owner"],
    id: "activity_plan.schedule_shared",
    parityFeatureIds: ["activity_plans.detail", "scheduled_activities.event_detail"],
    requiredSelectorKeys: ["detailScreen", "scheduleButton"],
    title: "Schedule shared activity plan",
  },
  {
    acceptance: [
      "authenticated users can create a calendar event",
      "created events can be edited",
      "edited events can be deleted",
    ],
    area: "calendar",
    criticality: "critical",
    fixtures: ["standard_user"],
    id: "calendar.custom_event_crud",
    parityFeatureIds: ["planning.calendar_tab", "scheduled_activities.event_detail"],
    requiredSelectorKeys: ["calendarScreen", "createButton", "eventDetailScreen"],
    title: "Create, edit, and delete calendar event",
  },
  {
    acceptance: [
      "authenticated users can open recording",
      "a quick activity can be started",
      "the active recording can be paused, resumed, and finished",
    ],
    area: "record",
    criticality: "critical",
    fixtures: ["standard_user"],
    id: "record.quick_start",
    parityFeatureIds: ["record.launcher", "record.activity", "record.session", "record.submit"],
    requiredSelectorKeys: ["launcher", "activityScreen", "activeSession", "finishButton"],
    title: "Quick-start recording",
  },
  {
    acceptance: [
      "authenticated users can open the activity import entry point",
      "a FIT import path can be selected when fixture data is available",
      "import progress and completion states are visible",
    ],
    area: "activities",
    criticality: "extended",
    fixtures: ["standard_user", "historical_activity_file"],
    id: "activity.import_fit",
    parityFeatureIds: ["activities.import"],
    requiredSelectorKeys: ["screen", "selectFileButton", "status"],
    title: "Import historical activity file",
  },
  {
    acceptance: [
      "authenticated users can open profile settings",
      "settings sections expose account and integration entry points",
      "routine setting changes provide non-blocking feedback",
    ],
    area: "profile",
    criticality: "critical",
    fixtures: ["standard_user"],
    id: "profile.settings",
    parityFeatureIds: ["profile.settings", "integrations.management"],
    requiredSelectorKeys: ["profileScreen", "settingsSection", "integrationsButton"],
    title: "Profile settings",
  },
  {
    acceptance: [
      "authenticated users can open notifications",
      "recent notifications render with stable list state",
      "read-state actions settle without losing the inbox",
    ],
    area: "notifications",
    criticality: "critical",
    fixtures: ["standard_user"],
    id: "notifications.open",
    parityFeatureIds: ["notifications.list"],
    requiredSelectorKeys: ["screen", "list"],
    title: "Open notifications",
  },
  {
    acceptance: [
      "authenticated users can open the messages inbox",
      "existing conversations are discoverable",
      "new-message entry points are available when recipients exist",
    ],
    area: "messaging",
    criticality: "critical",
    fixtures: ["standard_user", "dm_receiver"],
    id: "messaging.open",
    parityFeatureIds: ["messaging.list", "messaging.new"],
    requiredSelectorKeys: ["screen", "list", "newMessageButton"],
    title: "Open messages",
  },
] as const satisfies readonly ProductJourney[];

export const allProductJourneyIds = productJourneyRegistry.map((journey) => journey.id);

export function getProductJourneyById(id: ProductJourneyId) {
  return productJourneyRegistry.find((journey) => journey.id === id);
}

export function getProductJourneysByCriticality(criticality: JourneyCriticality) {
  return productJourneyRegistry.filter((journey) => journey.criticality === criticality);
}
