import { discoverUserFacingSurfaces } from "./parity.mjs";

const mobileTests = {
  "activity-plan.manage":
    "apps/mobile/app/(internal)/(standard)/__tests__/activity-plan-detail-scheduling.jest.test.tsx",
  "activities.manage":
    "apps/mobile/app/(internal)/(standard)/__tests__/activity-detail-screen.jest.test.tsx",
  "auth.access": "apps/mobile/app/(external)/__tests__/capability-p0-auth-entry.jest.test.tsx",
  "calendar.manage": "apps/mobile/app/(internal)/(tabs)/__tests__/calendar-screen.jest.test.tsx",
  "chatbot.assistant": "apps/mobile/components/chatbot/__tests__/ChatScreen.jest.test.tsx",
  "discovery.search":
    "apps/mobile/app/(internal)/(tabs)/__tests__/capability-p2-discovery-feed.jest.test.tsx",
  "goals.manage":
    "apps/mobile/app/(internal)/(standard)/__tests__/capability-p1-goals.jest.test.tsx",
  "groups.manage":
    "apps/mobile/app/(internal)/(standard)/__tests__/capability-p2-groups-core.jest.test.tsx",
  "integrations.manage":
    "apps/mobile/app/(internal)/(standard)/__tests__/integrations.jest.test.tsx",
  "messages.manage":
    "apps/mobile/app/(internal)/(standard)/__tests__/messages-list-screen.jest.test.tsx",
  "navigation.shell": "apps/mobile/app/__tests__/capability-p3-navigation.jest.test.tsx",
  "notifications.manage":
    "apps/mobile/app/(internal)/(tabs)/__tests__/capability-p2-notifications.jest.test.tsx",
  "onboarding.complete": "apps/mobile/app/(internal)/(standard)/__tests__/onboarding.jest.test.tsx",
  "record.lifecycle":
    "apps/mobile/app/(internal)/record/__tests__/capability-p0-record-lifecycle.jest.test.tsx",
  "routes.manage":
    "apps/mobile/app/(internal)/(standard)/__tests__/capability-p1-routes.jest.test.tsx",
  "settings.manage": "apps/mobile/app/(internal)/(standard)/__tests__/settings.jest.test.tsx",
  "social.profile":
    "apps/mobile/app/(internal)/(standard)/__tests__/capability-p2-social.jest.test.tsx",
  "thresholds.view": "apps/mobile/app/(internal)/(standard)/__tests__/thresholds.jest.test.tsx",
  "training-plan.manage":
    "apps/mobile/app/(internal)/(standard)/__tests__/capability-p1-training-plans.jest.test.tsx",
};

const webTests = {
  "activities.manage": {
    identity:
      "imports real GPX, exposes streams, recovers engagement, enforces sharing, filters history, and deletes",
    path: "apps/web/e2e/specs/activities.spec.ts",
  },
  "activity-plan.manage": {
    identity:
      "V5 authoring persists zero targets, recovers invalid drafts, and schedules its UI-edited RPE plan reference",
    path: "apps/web/e2e/specs/activity-plans.spec.ts",
  },
  "auth.access": {
    identity: "protected routes preserve a local return path and reject hostile login redirects",
    path: "apps/web/e2e/specs/auth.spec.ts",
  },
  "onboarding.complete": {
    identity: "completes identity-first profile-only onboarding on",
    path: "apps/web/e2e/specs/onboarding.spec.ts",
  },
  "calendar.manage": {
    identity: "calendar.events creates durable one-off, all-day, and bounded recurring events",
    path: "apps/web/e2e/specs/calendar-events.spec.ts",
  },
  "chatbot.assistant": {
    identity: "authenticated athlete completes and restores a durable assistant conversation",
    path: "apps/web/e2e/specs/chatbot.spec.ts",
  },
  "training-plan.manage": {
    identity: "athlete creates, reloads, edits, and cleans a persisted training plan",
    path: "apps/web/e2e/specs/training-plans.spec.ts",
  },
  "goals.manage": {
    identity: "goals.lifecycle and goals.intelligence persist exact owned goals",
    path: "apps/web/e2e/specs/goals.spec.ts",
  },
  "groups.manage": {
    identity: "owner creates, edits, RSVPs to, cancels an event, and archives its group",
    path: "apps/web/e2e/specs/groups-events.spec.ts",
  },
  "messages.manage": {
    identity: "creates a DM and a three-actor group with independent unread state",
    path: "apps/web/e2e/specs/messaging-notifications.spec.ts",
  },
  "notifications.manage": {
    identity: "opening a notification reaches its destination and persists read state",
    path: "apps/web/e2e/specs/capability-p1-notifications.spec.ts",
  },
  "social.profile": {
    identity: "private profiles protect details while a follow request persists and is restored",
    path: "apps/web/e2e/specs/profiles-social.spec.ts",
  },
  "integrations.manage": {
    identity: "local adapter connects, retries sync, rejects callback replay, and disconnects",
    path: "apps/web/e2e/specs/integrations.spec.ts",
  },
  "discovery.search": {
    identity: "athlete searches every API-backed discovery scope and can page results",
    path: "apps/web/e2e/specs/feed-discovery.spec.ts",
  },
  "thresholds.view": {
    identity: "performance.threshold-overview opens the athlete's calculated threshold history",
    path: "apps/web/e2e/specs/capability-p3-threshold-overview.spec.ts",
  },
  "coaching.workspace": {
    identity: "coaching.view-dashboard opens an authorized organization dashboard",
    path: "apps/web/e2e/specs/capability-p3-settings-coaching.spec.ts",
  },
  "navigation.shell": {
    identity: "navigation.mobile:escape-focus",
    path: "apps/web/e2e/specs/shell-screen-variations.spec.ts",
  },
  "sharing.public-links": {
    identity: "public activity-plan and training-plan links render anonymous readers",
    path: "apps/web/e2e/specs/capability-p0-public-share.spec.ts",
  },
  "settings.manage": {
    identity: "settings.select-theme persists a chosen theme across reloads",
    path: "apps/web/e2e/specs/capability-p3-settings-coaching.spec.ts",
  },
  "record.lifecycle": {
    identity:
      "athlete recovers after refresh, then reviews and discards an atomic finalized artifact",
    path: "apps/web/e2e/specs/recording.spec.ts",
  },
  "routes.manage": {
    identity:
      "[variation:routes.preview:detail-history] route detail preview launches recording and browser back restores map and elevation",
    path: "apps/web/e2e/specs/route-variations.spec.ts",
  },
};

const definitions = [
  {
    id: "auth.access",
    title: "Access and recover an account",
    outcome: "A signed-out person can enter, recover, and leave an authenticated session.",
    steps: ["open", "authenticate", "recover"],
    matches: (_platform, source) => /\/(?:auth\/|\(external\)\/)/.test(source),
  },
  {
    id: "onboarding.complete",
    title: "Complete onboarding",
    outcome: "A new person can complete the required onboarding flow.",
    steps: ["open", "complete"],
    matches: (_platform, source) => source.includes("onboarding"),
  },
  {
    id: "activities.manage",
    title: "Manage activity history",
    outcome: "A person can browse, inspect, and import recorded activities.",
    steps: ["browse", "inspect", "import"],
    matches: (_platform, source) =>
      /\/(?:activities|activity-detail|activity-import)(?:\/|\.|-|$)/.test(source),
  },
  {
    id: "activity-plan.manage",
    title: "Manage activity plans",
    outcome: "A person can browse, create, edit, and schedule an activity plan.",
    steps: ["browse", "create", "edit", "schedule"],
    matches: (_platform, source) => source.includes("activity-plan"),
  },
  {
    id: "record.lifecycle",
    title: "Record and submit an activity",
    outcome: "A person can start, control, review, and submit a recording.",
    steps: ["start", "control", "review", "submit"],
    matches: (_platform, source) =>
      /\/(?:record|record-launcher)(?:\/|\.|$)/.test(source) && !source.includes("record/sensors"),
  },
  {
    id: "record.sensors",
    title: "Use native recording sensors",
    outcome: "A person can manage sensors while recording on a native device.",
    policy: "mobile_only",
    steps: ["open", "connect", "measure"],
    matches: (platform, source) => platform === "mobile" && source.includes("record/sensors"),
    rationale: "Sensor control is exposed only by the native recording runtime.",
  },
  {
    id: "calendar.manage",
    title: "Manage calendar entries",
    outcome: "A person can browse calendar views and create, edit, or delete an entry.",
    steps: ["browse", "create", "edit", "delete"],
    matches: (_platform, source) => /\/(?:calendar|agenda-create|event-detail)/.test(source),
  },
  {
    id: "training-plan.manage",
    title: "Manage training plans",
    outcome: "A person can browse, create, edit, and apply a training plan.",
    steps: ["browse", "create", "edit", "apply"],
    matches: (_platform, source) =>
      /(?:training-plans?|plan-analysis|planning-ledger|\/plan\.)/.test(source),
  },
  {
    id: "goals.manage",
    title: "Manage goals",
    outcome: "A person can browse, create, edit, and delete goals.",
    steps: ["browse", "create", "edit", "delete"],
    matches: (_platform, source) => source.includes("goal"),
  },
  {
    id: "routes.manage",
    title: "Manage saved routes",
    outcome: "A person can browse, upload, edit, and inspect saved routes.",
    steps: ["browse", "upload", "edit", "inspect"],
    matches: (platform, source) =>
      platform === "web"
        ? source.includes("/routes/_protected/routes/")
        : /\/(?:routes-list|route-(?:detail|edit|upload))\.tsx$/.test(source),
  },
  {
    id: "groups.manage",
    title: "Manage groups and group events",
    outcome: "A person can browse groups and manage membership or group events.",
    steps: ["browse", "join", "manage"],
    matches: (_platform, source) => source.includes("group"),
  },
  {
    id: "chatbot.assistant",
    title: "Use the assistant conversation",
    outcome: "An authenticated person can open, send, and restore an assistant conversation.",
    steps: ["open", "send", "restore"],
    matches: (platform, source) =>
      platform === "web"
        ? source.endsWith("/routes/_protected.tsx")
        : source.includes("chatbot") || /\/chat\.tsx$/.test(source),
  },
  {
    id: "messages.manage",
    title: "Manage conversations",
    outcome: "A person can browse and compose conversations.",
    steps: ["browse", "compose"],
    matches: (_platform, source) => source.includes("message") || source.includes("inbox"),
  },
  {
    id: "notifications.manage",
    title: "Manage notifications",
    outcome: "A person can browse and act on notifications.",
    steps: ["browse", "act"],
    matches: (_platform, source) => source.includes("notification"),
  },
  {
    id: "social.profile",
    title: "View profiles and social connections",
    outcome: "A person can view a profile and social connection lists.",
    steps: ["view", "browse"],
    matches: (_platform, source) => /\/(?:profile|me|followers|following|user\/)/.test(source),
  },
  {
    id: "integrations.manage",
    title: "Manage connected integrations",
    outcome: "A person can view and manage connected integrations.",
    steps: ["view", "manage"],
    matches: (_platform, source) => source.includes("integration"),
  },
  {
    id: "discovery.search",
    title: "Discover product resources",
    outcome: "A person can browse discovery and search results.",
    steps: ["browse", "search"],
    matches: (_platform, source) => source.includes("discover") || source.includes("search"),
  },
  {
    id: "thresholds.view",
    title: "View threshold history",
    outcome: "A person can view the available threshold history.",
    steps: ["open", "view"],
    matches: (_platform, source) => source.includes("threshold"),
  },
  {
    id: "coaching.workspace",
    title: "Use coaching workspaces",
    outcome: "An authorized person can enter coaching workspaces.",
    policy: "web_only",
    steps: ["open", "view"],
    matches: (platform, source) => platform === "web" && source.includes("_coaching"),
    rationale: "Coaching workspaces are currently delivered through the web application only.",
  },
  {
    id: "navigation.shell",
    title: "Navigate the application shell",
    outcome: "A person can reach the primary application destinations.",
    steps: ["open", "navigate"],
    matches: (platform, source) =>
      platform === "web"
        ? /\/routes\/(?:__root|_protected)\.tsx$/.test(source) ||
          source.endsWith("/routes/_protected/index.tsx")
        : /\/app(?:\/.*)?\/(?:_layout|\+not-found)\.tsx$/.test(source) ||
          source.endsWith("/app/(internal)/(tabs)/index.tsx"),
  },
  {
    id: "sharing.public-links",
    title: "Open public shared links",
    outcome: "A reader can open a public shared resource without authenticated controls.",
    steps: ["open", "view"],
    matches: (platform, source) => platform === "web" && source.includes("/share/"),
    rationale: "Public share links are currently delivered through the web application only.",
    policy: "web_only",
  },
  {
    id: "settings.manage",
    title: "Manage account settings",
    outcome: "A person can open and manage account settings.",
    steps: ["open", "manage"],
    matches: (_platform, source) => source.includes("settings"),
  },
];

function missing(steps) {
  return {
    coveredSteps: [],
    evidenceStrength: "none",
    implementation: "missing",
    missingSteps: steps.map((stepId) => ({
      detail: "No current surface is registered for this required capability on the platform.",
      kind: "implementation",
      stepId,
    })),
    sources: [],
    status: "active",
    tests: [],
  };
}

function absent(steps, rationale) {
  return {
    ...missing(steps),
    implementation: "intentional_absence",
    missingSteps: steps.map((stepId) => ({
      detail: rationale,
      kind: "product-decision",
      stepId,
    })),
    status: "intentional_absence",
  };
}

function evidence(id, platform, steps, sources) {
  const test = platform === "web" ? webTests[id] : mobileTests[id];
  const runtime = platform === "web" && test;
  return {
    coveredSteps: steps,
    evidenceStrength: runtime ? "runtime" : test ? "screen/component" : "source-only",
    implementation: "implemented",
    missingSteps: runtime
      ? []
      : steps.map((stepId) => ({
          detail: "No maintained runtime receipt currently proves this required capability step.",
          kind: "proof",
          stepId,
        })),
    sources,
    status: "active",
    tests: test
      ? [
          {
            ...(platform === "web" ? { identity: test.identity } : {}),
            kind: platform === "web" ? "playwright" : "jest",
            path: typeof test === "string" ? test : test.path,
          },
        ]
      : [],
  };
}

/** Current semantic capability registry. Materialized source paths stay literal. */
export async function buildParityRegistry(root) {
  const surfaces = await discoverUserFacingSurfaces(root);
  const assignments = new Map(
    definitions.map((definition) => [definition.id, { mobile: [], web: [] }]),
  );
  for (const surface of surfaces) {
    const definition = definitions.find((candidate) =>
      candidate.matches(surface.platform, surface.path),
    );
    if (definition) assignments.get(definition.id)[surface.platform].push(surface.path);
    else throw new Error(`Unclassified current surface: ${surface.path}`);
  }
  return [
    ...definitions.map((definition) => {
      const assigned = assignments.get(definition.id);
      const policy = definition.policy ?? "both";
      const platformEvidence = (platform) => {
        if (!policy.includes(platform) && policy !== "both")
          return absent(definition.steps, definition.rationale);
        return assigned[platform].length
          ? evidence(definition.id, platform, definition.steps, assigned[platform].sort())
          : missing(definition.steps);
      };
      return {
        id: definition.id,
        intentionalDifferences: definition.rationale
          ? [
              {
                difference: `${definition.title} is ${policy.replace("_", " ")}.`,
                rationale: definition.rationale,
              },
            ]
          : [],
        mobile: platformEvidence("mobile"),
        outcome: definition.outcome,
        policy,
        requiredSteps: definition.steps.map((id) => ({ description: id, id })),
        title: definition.title,
        web: platformEvidence("web"),
      };
    }),
  ];
}

export const paritySurfaceExceptions = [
  {
    path: "apps/mobile/app/(external)/storybook.tsx",
    rationale: "The component explorer is a development aid rather than a shipped product surface.",
  },
];
