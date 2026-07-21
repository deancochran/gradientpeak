export type E2eJourneyStatus =
  | "executable"
  | "implemented-unverified"
  | "missing-web-capability"
  | "needs-seed";

export type JourneyTestEvidence = {
  spec: string;
  testTitle: string;
};

export type JourneyPriorGap = {
  detail: string;
  status: Extract<E2eJourneyStatus, "missing-web-capability" | "needs-seed">;
};

export type MobileWebJourney = {
  id: string;
  title: string;
  status: E2eJourneyStatus;
  evidence: JourneyTestEvidence[];
  priorGap?: JourneyPriorGap;
  support?: string[];
  seed?: string;
  runtimeBlocker?: string;
};

export type MobileWebJourneyDomain = {
  id: string;
  title: string;
  journeys: MobileWebJourney[];
};

type RuntimeSupport = {
  runtimeBlocker: string;
  spec: string;
  support?: string[];
};

function runtimeSupportFor(id: string): RuntimeSupport {
  const domain = id.split(".")[0];
  if (domain === "auth" || domain === "onboarding") {
    return {
      runtimeBlocker:
        "The implemented auth/onboarding behavior still needs a successful dedicated auth-lane run with its disposable PostgreSQL database and captured-email transport.",
      spec: domain === "auth" ? "auth.spec.ts" : "onboarding.spec.ts",
      support: ["../lane-support/auth/lane-test.ts", "../lane-support/auth/mailbox.ts"],
    };
  }
  if (domain === "feed" || domain === "discover") {
    return {
      runtimeBlocker:
        "The implemented feed/discovery behavior is runtime-unverified because the persisted-data run requires a local Supabase service-role credential.",
      spec: "feed-discovery.spec.ts",
      support: ["../lane-support/feed/discovery.ts"],
    };
  }
  if (domain === "profiles" || domain === "social" || domain === "profile") {
    return {
      runtimeBlocker:
        "The implemented profile/social behavior is runtime-unverified because the multi-actor run requires locally seeded confirmed users and a Supabase service-role credential.",
      spec: "profiles-social.spec.ts",
      support: ["../utils/testData.ts"],
    };
  }
  if (domain === "groups" || domain === "group-events") {
    return {
      runtimeBlocker:
        "The implemented groups/events behavior is runtime-unverified because the owner/member fixture requires locally seeded confirmed users and a Supabase service-role credential.",
      spec: "groups-events.spec.ts",
      support: ["../lane-support/groups/journeys.ts"],
    };
  }
  if (
    domain === "planning" ||
    domain === "calendar" ||
    domain === "agenda" ||
    domain === "events" ||
    domain === "scheduled-activities" ||
    domain === "goals"
  ) {
    return {
      runtimeBlocker:
        "The implemented planning behavior is runtime-unverified because its persisted athlete fixture requires a local Supabase service-role credential.",
      spec: "planning.spec.ts",
      support: ["../planning/journeys.ts"],
    };
  }
  if (domain === "activity-plans") {
    return {
      runtimeBlocker:
        "The implemented activity-plan behavior still needs a successful run against the local PostgreSQL/API/storage stack with its deterministic plan matrix.",
      spec: "activity-plans.spec.ts",
      support: ["../seeds/activity-plans.ts"],
    };
  }
  if (domain === "training-plans" || domain === "training-preferences") {
    return {
      runtimeBlocker:
        "The implemented training-plan behavior is runtime-unverified because the confirmed athlete fixture requires a local Supabase service-role credential.",
      spec: "training-plans.spec.ts",
      support: ["../training-plans/journeys.ts"],
    };
  }
  if (domain === "activities") {
    return {
      runtimeBlocker:
        "The implemented activity/import behavior still needs a successful run against local auth, PostgreSQL, object storage, and file-processing services.",
      spec: "activities.spec.ts",
      support: ["../activities/fixture-files.ts"],
    };
  }
  if (domain === "routes") {
    return {
      runtimeBlocker:
        "The implemented route behavior is runtime-unverified because authenticated persistence and upload processing require the local stack plus a Supabase service-role credential.",
      spec: "routes.spec.ts",
      support: ["../utils/testData.ts"],
    };
  }
  if (domain === "metrics" || domain === "efforts" || domain === "trends") {
    return {
      runtimeBlocker:
        "The implemented metrics/efforts/trends behavior is runtime-unverified because its confirmed athlete history fixture requires a local Supabase service-role credential.",
      spec: "metrics-efforts-trends.spec.ts",
      support: ["../utils/testData.ts"],
    };
  }
  if (domain === "integrations") {
    return {
      runtimeBlocker:
        "The implemented provider behavior is runtime-unverified because it requires local seeded users and PROVIDER_OAUTH_TEST_ADAPTER=1; no real provider is contacted.",
      spec: "integrations.spec.ts",
      support: ["../integrations/journey.ts"],
    };
  }
  if (domain === "messaging" || domain === "notifications") {
    return {
      runtimeBlocker:
        "The implemented messaging/notification behavior still needs a successful run with the disposable three-actor live-DB fixture.",
      spec: "messaging-notifications.spec.ts",
      support: ["../fixtures/messaging.ts"],
    };
  }
  if (domain === "recording") {
    return {
      runtimeBlocker:
        id === "recording.sensors"
          ? "Browser BLE/FTMS parity remains intentionally unavailable; only the implemented manual timer and explicit capability adapters can be runtime-verified without a supported desktop bridge and hardware profile."
          : "The implemented recording behavior still needs a successful browser run against real IndexedDB and the local authenticated submission API.",
      spec: "recording.spec.ts",
      support: ["../recording/indexed-db.ts", "../recording/navigation.ts"],
    };
  }
  throw new Error(`Journey ${id} has no domain E2E support mapping.`);
}

function testTitleFor(id: string): string {
  if (id === "auth.identity-onboarding") {
    return "persists full onboarding with baseline provenance, preferences, goal, and available social choices on desktop";
  }
  if (id === "profile.sign-out") {
    return "sign-up verification rejects expiry and replay while preserving responsive onboarding";
  }
  if (id === "auth.password-recovery") {
    return "real password reset changes the credential and revokes a second session";
  }
  if (id.startsWith("auth.")) {
    return "sign-up verification rejects expiry and replay while preserving responsive onboarding";
  }
  if (id.startsWith("onboarding.")) {
    return "persists full onboarding with baseline provenance, preferences, goal, and available social choices on desktop";
  }
  if (id === "feed.timeline") {
    return "athlete refreshes and pages the persisted social activity feed";
  }
  if (id.startsWith("discover.")) {
    return "athlete searches every API-backed discovery scope and can page results";
  }
  if (id === "social.followers") {
    return "social graph pages provide failure-safe pagination controls";
  }
  if (id.startsWith("profiles.") || id.startsWith("social.")) {
    return "social profile launches follow and direct-message actions";
  }
  if (id.startsWith("groups.") || id.startsWith("group-events.")) {
    return "owner creates, edits, RSVPs to, cancels an event, and archives its group";
  }
  if (id === "planning.training-path" || id === "calendar.navigation") {
    return "planning.training-path and calendar.navigation expose daily, weekly, month, and day paths";
  }
  if (id === "agenda.create" || id === "events.recurrence") {
    return "agenda.create and events.recurrence persist a bounded series and honor delete scope";
  }
  if (id.startsWith("scheduled-activities.")) {
    return "scheduled-activities.library and scheduled-activities.detail expose filters and persisted controls";
  }
  if (id.startsWith("goals.")) {
    return "goals.lifecycle and goals.intelligence create, edit, evaluate, and delete";
  }
  if (id === "activity-plans.library-detail" || id === "activity-plans.search-filter-page") {
    return "athlete can discover and open the activity plan library";
  }
  if (id === "activity-plans.duplicate") {
    return "athlete can duplicate a shared plan into an owned editable copy";
  }
  if (id.startsWith("activity-plans.")) {
    return "athlete can author, edit, schedule, comment on, and dependency-delete a plan";
  }
  if (id === "training-plans.library") {
    return "athlete can browse owned and template training-plan libraries";
  }
  if (id === "training-preferences") {
    return "athlete preferences hydrate, validate, persist, and survive reload";
  }
  if (id.startsWith("training-plans.")) {
    return "training-plan create and reorder journeys expose durable controls and states";
  }
  if (id === "activities.import") {
    return "keeps the selected file recoverable after a failed parse and retries with valid GPX";
  }
  if (id.startsWith("activities.")) {
    return "imports real GPX, exposes streams, recovers engagement, enforces sharing, filters history, and deletes";
  }
  if (id.startsWith("routes.")) {
    return "athlete can retry an XML upload and use the persisted route journey";
  }
  if (id.startsWith("metrics.")) {
    return "athlete can manage dated profile history and record an atomic CSS test";
  }
  if (id.startsWith("efforts.") || id.startsWith("trends.")) {
    return "athlete can inspect effort evidence and full real trends analytics";
  }
  if (id.startsWith("profile.")) {
    return "profile hub and settings expose owned profile journeys";
  }
  if (id === "integrations.polling") {
    return "cached provider status survives a network error and recovers on retry";
  }
  if (id.startsWith("integrations.")) {
    return "local PKCE connect succeeds once, replay fails safely, and disconnect retains history";
  }
  if (id === "notifications.follow-actions") {
    return "rejects and accepts follow requests from notifications";
  }
  if (id === "messaging.mobile-viewport") {
    return "message composer opens from the empty inbox";
  }
  if (id.startsWith("messaging.") || id.startsWith("notifications.")) {
    return "creates a DM and a three-actor group with independent unread state";
  }
  if (id === "recording.cross-tab") {
    return "cross-tab takeover fences the old recorder and recovers in the new tab";
  }
  if (id === "recording.submission") {
    return "offline saves stay idempotent in IndexedDB and retry through the server handoff";
  }
  if (id.startsWith("recording.")) {
    return "athlete recovers after refresh, then reviews and discards an atomic finalized artifact";
  }
  throw new Error(`Journey ${id} has no exact E2E test-title evidence.`);
}

const executable = (id: string, title: string, spec: string, seed: string): MobileWebJourney => ({
  evidence: [{ spec, testTitle: testTitleFor(id) }],
  id,
  title,
  status: "executable",
  seed,
});

const blocked = (
  id: string,
  title: string,
  priorStatus: JourneyPriorGap["status"],
  priorGap: string,
): MobileWebJourney => {
  const runtime = runtimeSupportFor(id);
  return {
    evidence: [{ spec: runtime.spec, testTitle: testTitleFor(id) }],
    runtimeBlocker: runtime.runtimeBlocker,
    id,
    priorGap: { detail: priorGap, status: priorStatus },
    status:
      priorStatus === "missing-web-capability"
        ? "missing-web-capability"
        : "implemented-unverified",
    ...(runtime.support ? { support: runtime.support } : {}),
    title,
  };
};

export const mobileWebJourneyDomains: MobileWebJourneyDomain[] = [
  {
    id: "auth-onboarding",
    title: "Authentication and onboarding",
    journeys: [
      executable(
        "auth.guards",
        "Anonymous, unverified, incomplete, and completed guards",
        "auth.spec.ts",
        "auth actors",
      ),
      executable(
        "auth.identity-onboarding",
        "Identity onboarding completion",
        "onboarding.spec.ts",
        "onboarding actor",
      ),
      executable(
        "auth.sign-in-return",
        "Sign in and protected return",
        "auth.spec.ts",
        "athlete actor",
      ),
      executable("auth.sign-out", "Sign out", "auth.spec.ts", "isolated athlete session"),
      blocked(
        "auth.sign-up-verify",
        "Sign up, email delivery, verification and replay",
        "needs-seed",
        "test mailbox and verification-token fixture",
      ),
      blocked(
        "auth.password-recovery",
        "Real reset token, password change and session revocation",
        "needs-seed",
        "test mailbox and second-session fixture",
      ),
      blocked(
        "onboarding.baselines",
        "Athlete baseline and imported provenance",
        "needs-seed",
        "web onboarding baseline steps",
      ),
      blocked(
        "onboarding.preferences-goals",
        "Preferences and initial goal",
        "needs-seed",
        "web onboarding preference and goal steps",
      ),
      blocked(
        "onboarding.social-provider",
        "Groups, people and provider setup",
        "needs-seed",
        "web onboarding social and provider steps",
      ),
    ],
  },
  {
    id: "feed-discovery-social",
    title: "Feed, discovery, search and public profiles",
    journeys: [
      executable(
        "feed.timeline",
        "Paginated social activity feed and refresh",
        "feed-discovery.spec.ts",
        "persisted athlete feed fixture",
      ),
      blocked(
        "discover.scopes",
        "Activity-plan, training-plan, route, user and group discovery",
        "needs-seed",
        "four missing web discovery scopes",
      ),
      blocked(
        "discover.filters",
        "Per-scope filters, sort and pagination",
        "needs-seed",
        "web discovery filter contracts",
      ),
      blocked(
        "profiles.public",
        "Public/private profile access matrix",
        "needs-seed",
        "public, private, follower and outsider actors",
      ),
      blocked(
        "social.follow",
        "Follow, request, cancel and unfollow",
        "needs-seed",
        "multi-actor relationship seed",
      ),
      executable(
        "social.followers",
        "Followers/following pagination and failures",
        "profiles-social.spec.ts",
        "seeded athlete social graph",
      ),
      blocked(
        "social.profile-dm",
        "Direct message from profile",
        "needs-seed",
        "two-actor messaging seed",
      ),
    ],
  },
  {
    id: "groups-events",
    title: "Groups, membership and group events",
    journeys: [
      blocked(
        "groups.library",
        "Discover, joined and owned groups",
        "needs-seed",
        "web groups routes",
      ),
      blocked(
        "groups.crud",
        "Create, edit, media and archive",
        "needs-seed",
        "web group management",
      ),
      blocked(
        "groups.membership",
        "Join, request, cancel and leave",
        "needs-seed",
        "web membership flows",
      ),
      blocked(
        "groups.invitations",
        "Invite, accept, decline and revoke",
        "needs-seed",
        "web invitation flows",
      ),
      blocked(
        "groups.roles",
        "Roles, removal and ownership transfer",
        "needs-seed",
        "web member administration",
      ),
      blocked(
        "group-events.crud",
        "One-off and recurring event lifecycle",
        "needs-seed",
        "web group event routes",
      ),
      blocked(
        "group-events.rsvp",
        "Occurrence and series RSVP precedence",
        "needs-seed",
        "web group RSVP",
      ),
      blocked(
        "group-events.attachments",
        "Attached routes and activity plans",
        "needs-seed",
        "group-content access contract and UI",
      ),
    ],
  },
  {
    id: "planning-goals",
    title: "Plan, calendar, scheduled events and goals",
    journeys: [
      blocked(
        "planning.training-path",
        "Daily and weekly load path",
        "needs-seed",
        "web training-path visualization",
      ),
      blocked(
        "calendar.navigation",
        "Month, week and day navigation",
        "needs-seed",
        "web calendar week view",
      ),
      blocked(
        "agenda.create",
        "Custom, race, planned activity and goal creation",
        "needs-seed",
        "web agenda creation",
      ),
      blocked(
        "events.recurrence",
        "Recurring create/edit/delete scopes",
        "needs-seed",
        "web recurrence controls",
      ),
      executable(
        "scheduled-activities.library",
        "Scheduled-activity list and filters",
        "planning.spec.ts",
        "persisted athlete schedule fixture",
      ),
      executable(
        "scheduled-activities.detail",
        "Detail, attach, reschedule and remove",
        "planning.spec.ts",
        "persisted scheduled-activity detail fixture",
      ),
      blocked(
        "goals.lifecycle",
        "Goal list, create, detail, edit and delete",
        "needs-seed",
        "full web goal routes",
      ),
      blocked(
        "goals.intelligence",
        "Goal intelligence and retry",
        "needs-seed",
        "web goal intelligence",
      ),
    ],
  },
  {
    id: "activity-plans",
    title: "Activity-plan library and authoring",
    journeys: [
      executable(
        "activity-plans.library-detail",
        "Owned library to deterministic detail",
        "activity-plans.spec.ts",
        "activity plan seed",
      ),
      executable(
        "activity-plans.search-filter-page",
        "Search, category, multisport and pagination",
        "activity-plans.spec.ts",
        "22-plan matrix seed",
      ),
      blocked(
        "activity-plans.rich-detail",
        "Structure, route, owner, likes and comments",
        "needs-seed",
        "rich detail composition",
      ),
      blocked(
        "activity-plans.author",
        "Create and edit structured workout",
        "needs-seed",
        "web activity-plan composer",
      ),
      blocked(
        "activity-plans.duplicate",
        "Duplicate shared plan",
        "needs-seed",
        "web duplicate action",
      ),
      blocked(
        "activity-plans.schedule",
        "Schedule, reschedule and remove",
        "needs-seed",
        "web plan scheduling",
      ),
      blocked(
        "activity-plans.delete",
        "Delete and dependency recovery",
        "needs-seed",
        "web delete flow",
      ),
    ],
  },
  {
    id: "training-plans",
    title: "Training plans and preferences",
    journeys: [
      executable(
        "training-plans.library",
        "Owned and template libraries",
        "training-plans.spec.ts",
        "owned and template training-plan fixture",
      ),
      blocked(
        "training-plans.detail",
        "Structure, progress, insights and linked workouts",
        "needs-seed",
        "protected detail route",
      ),
      blocked(
        "training-plans.composer",
        "Create/edit composer and preview",
        "needs-seed",
        "web training-plan composer",
      ),
      blocked(
        "training-plans.schedule",
        "Apply, conflict replacement and removal",
        "needs-seed",
        "web schedule lifecycle",
      ),
      blocked(
        "training-plans.social",
        "Visibility, like, duplicate and share",
        "needs-seed",
        "protected owner/non-owner actions",
      ),
      blocked(
        "training-plans.reorder",
        "Workout reorder and failure recovery",
        "needs-seed",
        "web reorder surface",
      ),
      executable(
        "training-preferences",
        "Hydrate, validate, save and retry preferences",
        "training-plans.spec.ts",
        "confirmed athlete preference fixture",
      ),
    ],
  },
  {
    id: "activities-import",
    title: "Completed activities, detail and import",
    journeys: [
      blocked(
        "activities.library",
        "History search, filter, sort and pagination",
        "needs-seed",
        "web activity history search, filter, and sort controls",
      ),
      blocked(
        "activities.rich-detail",
        "Streams, charts, laps, zones, map and swim",
        "needs-seed",
        "remaining rich-detail presentation",
      ),
      blocked(
        "activities.social",
        "Like and comments with failure recovery",
        "needs-seed",
        "multi-actor activity social seed",
      ),
      blocked(
        "activities.visibility-share",
        "Visibility and public share privacy",
        "needs-seed",
        "owner/follower/outsider activity seed",
      ),
      blocked(
        "activities.delete",
        "Delete cancel, failure and success",
        "needs-seed",
        "observable delete failure and retry state",
      ),
      blocked(
        "activities.import",
        "FIT, GPX and TCX import with retry",
        "needs-seed",
        "browser upload files and cleanup",
      ),
    ],
  },
  {
    id: "routes",
    title: "Route library and course management",
    journeys: [
      blocked(
        "routes.library",
        "Search, filter, sort and pagination",
        "needs-seed",
        "web route search, filter, and sort controls",
      ),
      blocked(
        "routes.detail",
        "Geometry, map, elevation and social detail",
        "needs-seed",
        "route geometry and social seed",
      ),
      blocked(
        "routes.upload",
        "GPX, TCX and XML upload/retry",
        "needs-seed",
        "browser route files",
      ),
      blocked(
        "routes.delete",
        "Delete and linked-event conflict",
        "needs-seed",
        "linked-event conflict and retry state",
      ),
      blocked(
        "routes.attach-plan",
        "Attach route to activity plan",
        "needs-seed",
        "web activity-plan authoring",
      ),
      blocked(
        "routes.attach-event",
        "Attach route to event",
        "needs-seed",
        "web event route picker",
      ),
      blocked(
        "routes.record-entry",
        "Attach and preview route before recording",
        "needs-seed",
        "recording route seed",
      ),
    ],
  },
  {
    id: "metrics-efforts-trends",
    title: "Profile metrics, efforts and trends",
    journeys: [
      blocked(
        "metrics.library-crud",
        "Metric groups, ranges, create, edit and delete",
        "needs-seed",
        "dense metric history seed",
      ),
      blocked(
        "metrics.override",
        "Source-preserving manual override",
        "needs-seed",
        "provider/activity metric seed",
      ),
      blocked(
        "metrics.css",
        "Atomic CSS protocol",
        "needs-seed",
        "deterministic CSS operation seed",
      ),
      blocked(
        "efforts.curves",
        "Observed curves, evidence labels and ranges",
        "needs-seed",
        "mixed effort evidence seed",
      ),
      blocked(
        "efforts.lifecycle",
        "Create, override, linkage and delete policy",
        "needs-seed",
        "manual and sourced effort seed",
      ),
      blocked(
        "trends.analytics",
        "Volume, load, consistency, zones and performance",
        "needs-seed",
        "web trends route",
      ),
      blocked(
        "trends.partial-retry",
        "Partial source failure and recovery",
        "needs-seed",
        "web trends error composition",
      ),
    ],
  },
  {
    id: "profile-settings",
    title: "Profile and settings",
    journeys: [
      blocked(
        "profile.hub",
        "Own summary, groups and owned libraries",
        "needs-seed",
        "complete web profile hub",
      ),
      blocked(
        "profile.edit",
        "Identity, bio, units, avatar and cover",
        "needs-seed",
        "full name, cover image, and media removal controls",
      ),
      blocked(
        "profile.units",
        "Metric/imperial persistence across surfaces",
        "needs-seed",
        "unit-sensitive domain records",
      ),
      blocked("profile.theme", "Light, dark and system theme", "needs-seed", "web theme control"),
      blocked("profile.email", "Verified email change", "needs-seed", "web email-change flow"),
      blocked(
        "profile.password",
        "Password change and session policy",
        "needs-seed",
        "web password-change flow",
      ),
      executable(
        "profile.sign-out",
        "Sign out with isolated session",
        "auth.spec.ts",
        "per-test athlete session",
      ),
    ],
  },
  {
    id: "integrations",
    title: "Provider integrations",
    journeys: [
      blocked(
        "integrations.status",
        "Configured, connected and failed provider states",
        "needs-seed",
        "provider overview fixture",
      ),
      blocked(
        "integrations.oauth",
        "Browser OAuth success and sanitized callback",
        "needs-seed",
        "secure browser OAuth contract and mock provider",
      ),
      blocked(
        "integrations.reconnect",
        "Reconnect and stale failure cleanup",
        "needs-seed",
        "browser reconnect flow",
      ),
      blocked(
        "integrations.disconnect",
        "Disconnect and retained history",
        "needs-seed",
        "connected provider and imported activity seed",
      ),
      blocked(
        "integrations.polling",
        "Queued/running/success polling and network recovery",
        "needs-seed",
        "web transitional polling",
      ),
      blocked(
        "integrations.capability-truth",
        "Scope and health-gated actions",
        "needs-seed",
        "scope/health matrix seed",
      ),
    ],
  },
  {
    id: "messaging-notifications",
    title: "Messaging and notifications",
    journeys: [
      executable(
        "messaging.inbox",
        "Inbox and unread lifecycle",
        "messaging-notifications.spec.ts",
        "two-actor conversation and unread-message seed",
      ),
      blocked("messaging.dm", "Create DM and send", "needs-seed", "new-recipient DM seed"),
      blocked(
        "messaging.group",
        "Group conversation and independent reads",
        "needs-seed",
        "participant read-state model",
      ),
      executable(
        "messaging.mobile-viewport",
        "New-message access at narrow viewport",
        "screen-functionality.spec.ts",
        "isolated athlete inbox",
      ),
      executable(
        "notifications.inbox",
        "All/unread, mark one and mark all",
        "messaging-notifications.spec.ts",
        "read and unread notification matrix seed",
      ),
      executable(
        "notifications.follow-actions",
        "Accept and reject follow requests",
        "messaging-notifications.spec.ts",
        "three-actor pending relationship fixture",
      ),
    ],
  },
  {
    id: "recording",
    title: "Recording, logging and recovery",
    journeys: [
      executable(
        "recording.quick-timer",
        "Category, start, pause and resume",
        "recording.spec.ts",
        "isolated athlete IndexedDB timer",
      ),
      blocked(
        "recording.plan-route",
        "Plan/event/route attachment and identity lock",
        "needs-seed",
        "scheduled plan and route seed",
      ),
      blocked(
        "recording.refresh",
        "IndexedDB checkpoint and refresh recovery",
        "needs-seed",
        "real IndexedDB fixture",
      ),
      blocked(
        "recording.cross-tab",
        "Lease fencing and takeover",
        "needs-seed",
        "multi-tab IndexedDB fixture",
      ),
      blocked(
        "recording.finish",
        "Finish, metadata, save and discard",
        "needs-seed",
        "finalized browser artifact workflow",
      ),
      blocked(
        "recording.submission",
        "Durable submission and retry",
        "needs-seed",
        "browser submission queue",
      ),
      blocked(
        "recording.sensors",
        "BLE and FTMS capability adapters",
        "missing-web-capability",
        "runtime adapters and supported hardware profile",
      ),
    ],
  },
];
