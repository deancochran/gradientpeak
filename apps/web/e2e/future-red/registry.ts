import type { FutureJourneyActor, FutureJourneyBlueprint, FutureJourneyCheckpoint } from "./types";

const anonymous = ["running web server", "isolated anonymous browser context"] as const;
const athlete = [
  "local PostgreSQL/Supabase stack",
  "confirmed athlete with completed onboarding",
  "actor-scoped deterministic cleanup",
] as const;
const onboarding = [
  "confirmed incomplete onboarding actor",
  "deterministic profile reset",
  "actor-scoped deterministic cleanup",
] as const;
const multiActor = [
  "local PostgreSQL/Supabase stack",
  "confirmed isolated multi-actor fixture",
  "actor and artifact locks",
  "deterministic cleanup",
] as const;
const recording = [
  "confirmed athlete with completed onboarding",
  "fresh browser context and IndexedDB",
  "recording artifact cleanup",
] as const;

const testId = (value: string, purpose: string): FutureJourneyCheckpoint => ({
  kind: "testId",
  purpose,
  value,
});
const testIdPrefix = (value: string, purpose: string): FutureJourneyCheckpoint => ({
  kind: "testIdPrefix",
  purpose,
  value,
});
const role = (
  roleName: Extract<FutureJourneyCheckpoint, { kind: "role" }>["role"],
  name: string,
  purpose: string,
): FutureJourneyCheckpoint => ({ kind: "role", name, purpose, role: roleName });
const label = (value: string, purpose: string): FutureJourneyCheckpoint => ({
  kind: "label",
  purpose,
  value,
});
const text = (value: string, purpose: string): FutureJourneyCheckpoint => ({
  kind: "text",
  purpose,
  value,
});
const url = (value: string, purpose: string): FutureJourneyCheckpoint => ({
  kind: "url",
  purpose,
  value,
});

function journey(
  id: string,
  actor: FutureJourneyActor,
  path: string,
  prerequisites: FutureJourneyBlueprint["prerequisites"],
  checkpoints: FutureJourneyBlueprint["checkpoints"],
  acceptance: FutureJourneyBlueprint["acceptance"],
  options: Pick<FutureJourneyBlueprint, "viewport"> = {},
): FutureJourneyBlueprint {
  return { acceptance, actor, checkpoints, id, path, prerequisites, ...options };
}

export const futureJourneyBlueprints = [
  journey(
    "auth.guards",
    "anonymous",
    "/settings",
    anonymous,
    [
      url("/auth/login", "anonymous users return to login"),
      testId("auth-login-form", "login is an explicit accessible boundary"),
    ],
    [
      "Anonymous, unverified, incomplete, and completed users are routed to distinct authorized destinations.",
      "The original protected destination survives successful sign-in.",
      "Guard failures never flash protected content.",
    ],
  ),
  journey(
    "auth.identity-onboarding",
    "onboarding",
    "/onboarding",
    onboarding,
    [
      testId("onboarding-identity-step", "identity fields have a durable step boundary"),
      testId("onboarding-completion-state", "completion has an observable persisted state"),
    ],
    [
      "A unique identity can be completed once and persists after reload.",
      "Duplicate usernames and invalid identity fields remain editable with associated errors.",
    ],
  ),
  journey(
    "auth.sign-in-return",
    "anonymous",
    "/settings",
    anonymous,
    [
      url("redirect", "login receives the protected return target"),
      testId("auth-return-target", "the return target is represented without leaking credentials"),
    ],
    [
      "Successful sign-in returns to the exact protected URL including safe search parameters.",
      "Invalid credentials preserve the return target and expose a retryable error.",
    ],
  ),
  journey(
    "auth.sign-out",
    "athlete",
    "/settings",
    athlete,
    [
      testId("user-menu", "the authenticated user menu is stable"),
      testId("sign-out", "sign-out is a durable action"),
    ],
    [
      "Signing out clears the current session and rejects a subsequent protected navigation.",
      "Browser history cannot reveal protected content after sign-out.",
    ],
  ),
  journey(
    "auth.sign-up-verify",
    "authLane",
    "/auth/sign-up",
    ["captured-email auth lane", "disposable PostgreSQL actor", "unique email identity"],
    [
      testId("sign-up-form", "sign-up fields form one accessible boundary"),
      testId(
        "verification-result",
        "verification success, expiry, and replay have stable outcomes",
      ),
    ],
    [
      "Sign-up sends one captured verification email and valid verification starts onboarding.",
      "Expired and replayed tokens fail with stable safe error codes.",
    ],
  ),
  journey(
    "auth.password-recovery",
    "authLane",
    "/auth/forgot-password",
    ["captured-email auth lane", "disposable actor", "two isolated authenticated sessions"],
    [
      testId("password-recovery-form", "recovery request is selectorized"),
      testId("password-reset-result", "reset and replay outcomes are observable"),
    ],
    [
      "A real captured reset token changes the credential exactly once.",
      "Other sessions are revoked, the old password fails, and token replay is rejected.",
    ],
  ),
  journey(
    "onboarding.baselines",
    "onboarding",
    "/onboarding",
    onboarding,
    [
      testId("onboarding-baseline-step", "baseline fields have a stable boundary"),
      testIdPrefix("baseline-provenance-", "every imported/manual baseline exposes provenance"),
    ],
    [
      "Imported baseline values display source provenance before submission.",
      "Changed values and provenance persist after completion and reload.",
    ],
  ),
  journey(
    "onboarding.preferences-goals",
    "onboarding",
    "/onboarding",
    onboarding,
    [
      testId("onboarding-preferences-step", "preferences have a stable step"),
      testId("onboarding-goal-step", "the initial goal has a stable step"),
    ],
    [
      "Training preferences validate and persist with their exact values.",
      "The initial goal appears in the goal library after completion.",
    ],
  ),
  journey(
    "onboarding.social-provider",
    "onboarding",
    "/onboarding",
    [
      "onboarding actor",
      "seeded invitation, group, and profile suggestion",
      "local provider status adapter",
    ],
    [
      testId("onboarding-social-step", "social choices are deterministic"),
      testId("onboarding-provider-step", "provider capability truth is explicit"),
    ],
    [
      "Selected invitation, membership, and follow choices persist after onboarding.",
      "Provider setup truth never claims an OAuth connection that did not complete.",
    ],
  ),

  journey(
    "feed.timeline",
    "athlete",
    "/",
    [
      "athlete plus followed actor",
      "more than one page of visible activities",
      "deterministic activity IDs",
    ],
    [
      testIdPrefix("feed-activity-", "the first seeded activity renders as a canonical card"),
      testId("feed-load-more", "pagination has a durable action"),
    ],
    [
      "Refresh preserves deterministic content while updating through the feed API.",
      "Pagination adds unique second-page activities and recovers from a partial failure.",
    ],
  ),
  journey(
    "discover.scopes",
    "athlete",
    "/search",
    [
      "one discoverable resource per scope",
      "confirmed athlete actor",
      "deterministic search terms",
    ],
    [
      testId("discover-scope-tabs", "all discovery scopes share one stable tab list"),
      testIdPrefix("discover-activityPlans-", "positive activity-plan discovery renders a result"),
    ],
    [
      "Activity plans, training plans, routes, users, and groups each return a positive seeded result.",
      "Every result exposes its canonical detail action and inaccessible records remain absent.",
    ],
  ),
  journey(
    "discover.filters",
    "athlete",
    "/search",
    ["filter-distinguishable resources in every scope", "more than one result page"],
    [
      testId("discover-filter-controls", "scope-specific filters are grouped"),
      testId("discover-load-more", "pagination cannot be silently conditional"),
    ],
    [
      "Scope-specific filters and sorting visibly change the result set and order.",
      "Reset restores the baseline and pagination introduces no duplicates.",
    ],
  ),
  journey(
    "profiles.public",
    "profile",
    "/user/00000000-0000-4000-8000-000000000001",
    multiActor,
    [
      testId("profile-visibility", "profile visibility is explicit"),
      testId("profile-details", "authorized profile details have a stable boundary"),
    ],
    [
      "Public, private, follower, pending, outsider, and anonymous viewers see the correct matrix.",
      "Private data and activity statistics never leak to unauthorized viewers.",
    ],
  ),
  journey(
    "social.follow",
    "profile",
    "/user/00000000-0000-4000-8000-000000000001",
    multiActor,
    [
      testIdPrefix("follow-action-", "the target-specific follow action is stable"),
      testId("relationship-state", "accepted and pending states are observable"),
    ],
    [
      "Public follows accept immediately; private follows can be requested and cancelled.",
      "Accepted relationships can be unfollowed and mutation failures preserve the prior state.",
    ],
  ),
  journey(
    "social.followers",
    "profile",
    "/user/00000000-0000-4000-8000-000000000001/followers",
    ["target profile", "more than one page of relationships", "failure injection"],
    [
      testIdPrefix("relationship-row-", "relationship rows expose actor identity"),
      testId("relationship-load-more", "cursor pagination is explicit"),
    ],
    [
      "Followers and following lists paginate without duplicates and preserve back navigation.",
      "A failed page shows retry without collapsing already loaded relationships.",
    ],
  ),
  journey(
    "social.profile-dm",
    "profile",
    "/user/00000000-0000-4000-8000-000000000001",
    multiActor,
    [
      testIdPrefix("message-profile-", "profile messaging targets the correct actor"),
      testId("message-composer", "the resulting conversation is ready to send"),
    ],
    [
      "Message from profile creates or reuses the correct direct conversation.",
      "A sent message appears for the recipient and updates unread state.",
    ],
  ),

  journey(
    "groups.library",
    "athlete",
    "/groups",
    ["owned, joined, discoverable, invited, and requested groups", "pagination fixture"],
    [
      testId("group-library-tabs", "group libraries have stable tabs"),
      testIdPrefix("group-card-", "a seeded group renders canonically"),
    ],
    [
      "Owned, joined, discoverable, invitation, and request libraries contain only their intended groups.",
      "Search, pagination, empty, failure, and retry states remain distinct.",
    ],
  ),
  journey(
    "groups.crud",
    "athlete",
    "/groups/new",
    ["group owner actor", "avatar and cover fixtures", "storage service", "artifact cleanup"],
    [
      testId("group-create-form", "group creation is a stable form"),
      testId("group-detail-management", "created groups expose owner management"),
    ],
    [
      "Create, read, edit, reload, media replacement/removal, and archive form one persisted lifecycle.",
      "Validation, cancellation, mutation failure, retry, and post-archive access are explicit.",
    ],
  ),
  journey(
    "groups.membership",
    "profile",
    "/groups",
    multiActor,
    [
      testId("group-membership-state", "membership state is explicit"),
      testId("group-membership-action", "join/request/cancel/leave share a stable action"),
    ],
    [
      "Open groups join directly while restricted groups create and cancel requests.",
      "Members can leave and unauthorized users cannot gain member-only access.",
    ],
  ),
  journey(
    "groups.invitations",
    "profile",
    "/groups",
    multiActor,
    [
      testIdPrefix("group-invitation-row-", "invitations identify group and invitee"),
      testId("group-invitation-action", "accept, decline, and revoke are stable actions"),
    ],
    [
      "Owners/admins invite a selected actor and can revoke a pending invitation.",
      "Invitees can accept or decline and the resulting membership/invitation state persists.",
    ],
  ),
  journey(
    "groups.roles",
    "profile",
    "/groups/00000000-0000-4000-8000-000000000001/members",
    multiActor,
    [
      testIdPrefix("group-member-row-", "member rows expose identity and role"),
      testId("group-role-action", "role and ownership changes are stable actions"),
    ],
    [
      "Owner promotes, demotes, removes, and transfers ownership with persisted roles.",
      "Old owners and unauthorized actors immediately lose prohibited controls.",
    ],
  ),
  journey(
    "group-events.crud",
    "athlete",
    "/groups/00000000-0000-4000-8000-000000000001/events/new",
    ["group owner/admin actor", "one-off and recurring fixtures", "deterministic timezone"],
    [
      testId("group-event-form", "event creation/editing has a stable form"),
      testId("group-event-scope-controls", "occurrence and series scopes are explicit"),
    ],
    [
      "One-off and recurring events create, edit, reload, cancel occurrence, and cancel series correctly.",
      "Validation, authorization, failed mutation, and retry paths preserve input.",
    ],
  ),
  journey(
    "group-events.rsvp",
    "profile",
    "/groups/events/00000000-0000-4000-8000-000000000001",
    multiActor,
    [
      testId("group-event-rsvp", "RSVP controls target the displayed event"),
      testId("group-event-effective-rsvp", "series/occurrence precedence is explicit"),
    ],
    [
      "Series RSVP applies until an occurrence override is created or cleared.",
      "Cancelled events disable RSVP and failures preserve the effective prior response.",
    ],
  ),
  journey(
    "group-events.attachments",
    "athlete",
    "/groups/events/00000000-0000-4000-8000-000000000001",
    ["group event", "readable and unreadable route", "readable and unreadable activity plan"],
    [
      testId("group-event-attachments", "attachments have a stable section"),
      testIdPrefix(
        "group-event-attachment-",
        "each attached resource is independently addressable",
      ),
    ],
    [
      "Routes and activity plans can be attached, opened, replaced, removed, and reloaded.",
      "Inaccessible attachments render an explicit unavailable state instead of leaking data.",
    ],
  ),

  journey(
    "planning.training-path",
    "athlete",
    "/plan",
    ["active training plan", "scheduled events", "load history"],
    [
      testId("training-path", "the training path has a stable root"),
      testId("training-path-week", "daily and weekly composition is addressable"),
    ],
    [
      "Scheduled daily/weekly load paths render deterministic values and linked work.",
      "No-plan, empty, partial source failure, and retry states remain distinct.",
    ],
  ),
  journey(
    "calendar.navigation",
    "athlete",
    // biome-ignore lint/security/noSecrets: application query string, not a credential.
    "/calendar?view=month",
    ["events and goals across month boundaries", "deterministic planning timezone"],
    [
      testId("calendar-navigation", "calendar range controls are stable"),
      testIdPrefix("calendar-day-", "calendar days are independently addressable"),
    ],
    [
      "Month, week, agenda, and day navigation update the URL and visible range correctly.",
      "Boundary dates, invalid search values, empty ranges, errors, and retry are covered.",
    ],
  ),
  journey(
    "agenda.create",
    "athlete",
    "/calendar/new",
    ["athlete actor", "deterministic date", "event and goal cleanup"],
    [
      testId("agenda-create-form", "agenda creation has a stable root"),
      testId("agenda-create-type", "custom, race, planned, and goal types are explicit"),
    ],
    [
      "Custom, race, planned activity, and goal entries validate and persist into calendar views.",
      "Unauthorized, failed, duplicate-submit, and retry outcomes preserve user input.",
    ],
  ),
  journey(
    "events.recurrence",
    "athlete",
    "/calendar/new?type=custom",
    ["recurring event fixture", "bounded deterministic dates", "event cleanup"],
    [
      testId("event-recurrence-controls", "recurrence bounds are stable controls"),
      testId("event-recurrence-scope", "single occurrence and series cancellation are explicit"),
    ],
    [
      "Recurring create plus occurrence or series cancellation produces the exact bounded set.",
      "Invalid recurrence, authorization failure, cancel, failed mutation, and retry are observable.",
    ],
  ),
  journey(
    "goals.lifecycle",
    "athlete",
    "/goals",
    ["goal cleanup", "multiple categories, priorities, and dates"],
    [
      testId("goal-create", "goal creation entry is stable"),
      testIdPrefix("goal-card-", "persisted goals render as canonical rows"),
    ],
    [
      "Goal list/search/sort plus create/read/edit/delete persist through reload.",
      "Validation, cancel, failure, retry, empty, and cross-user denial are covered.",
    ],
  ),
  journey(
    "goals.intelligence",
    "athlete",
    "/goals/00000000-0000-4000-8000-000000000001",
    ["goal with sufficient evidence", "goal with insufficient evidence", "failure injection"],
    [
      testId("goal-intelligence", "goal intelligence has a stable card"),
      testId("goal-intelligence-retry", "failed evaluation has an explicit retry"),
    ],
    [
      "Available, partial, and unavailable intelligence render evidence and limits truthfully.",
      "Evaluation failure preserves goal detail and recovers through retry.",
    ],
  ),

  journey(
    "activity-plans.library-detail",
    "athlete",
    "/activity-plans",
    ["deterministic owned activity-plan matrix", "canonical structure fixture"],
    [
      testIdPrefix("activity-plan-card-", "owned plans render as stable cards"),
      testId("activity-plan-structure", "detail exposes canonical structure"),
    ],
    [
      "The owned library opens a deterministic canonical detail with owner and metrics.",
      "Loading, empty, error, retry, inaccessible, and invalid-structure states are explicit.",
    ],
  ),
  journey(
    "activity-plans.search-filter-page",
    "athlete",
    "/activity-plans",
    ["more than one page of categorized plans", "deterministic ordering"],
    [
      testId("activity-plan-search", "search has a stable control"),
      testId("activity-plan-load-more", "pagination is required, not conditional smoke"),
    ],
    [
      "Search, every category, clear, no-match, pagination, and order are behaviorally asserted.",
      "A list failure retains controls and recovers without duplicates.",
    ],
  ),
  journey(
    "activity-plans.rich-detail",
    "athlete",
    "/activity-plans/00000000-0000-4000-8000-000000000001",
    ["plan with route, owner, metrics, likes, and comments", "second actor"],
    [
      testId("activity-plan-structure", "structure is present"),
      testId("activity-plan-social", "likes and comments have a stable boundary"),
    ],
    [
      "Structure, route, metrics, owner, likes, and comments render from persisted resources.",
      "Like/comment failure, rollback, preserved drafts, retry, and read authorization are covered.",
    ],
  ),
  journey(
    "activity-plans.author",
    "athlete",
    "/activity-plans",
    ["activity-plan cleanup", "canonical editor fixture"],
    [
      testId("activity-plan-create", "authoring entry is stable"),
      testId("activity-plan-composer", "the canonical composer is selectorized"),
    ],
    [
      "Create and edit canonical structured plans with validation and persisted reload.",
      "Conflict, mutation failure, retry, cancellation, and duplicate-submit protection preserve the draft.",
    ],
  ),
  journey(
    "activity-plans.duplicate",
    "athlete",
    "/activity-plans/00000000-0000-4000-8000-000000000001",
    ["shared readable plan", "non-owner actor", "copy cleanup"],
    [
      testId("activity-plan-duplicate", "duplication is a stable action"),
      testId("activity-plan-copy-result", "the resulting owned copy is observable"),
    ],
    [
      "A readable shared plan duplicates into an independently editable owned copy.",
      "Failure, retry, deterministic naming, ownership, and cleanup are asserted.",
    ],
  ),
  journey(
    "activity-plans.schedule",
    "athlete",
    "/activity-plans/00000000-0000-4000-8000-000000000001",
    ["owned plan", "deterministic schedule date", "event cleanup"],
    [
      testId("activity-plan-schedule", "schedule controls have a stable card"),
      testId("activity-plan-schedule-state", "scheduled/rescheduled/removed state is explicit"),
    ],
    [
      "Schedule, reload, reschedule, and remove persist to scheduled activity detail.",
      "Invalid date, conflict, failed mutation, cancel, and retry are covered.",
    ],
  ),
  journey(
    "activity-plans.delete",
    "athlete",
    "/activity-plans/00000000-0000-4000-8000-000000000001",
    ["owned plan with dependencies", "dependency cleanup"],
    [
      testId("activity-plan-delete", "delete is a stable destructive action"),
      testId("activity-plan-delete-dependencies", "dependency impact is explicit"),
    ],
    [
      "Delete cancellation and dependency conflict preserve the plan and linked work.",
      "Recovery, retry, authorized success, and resulting library state are asserted.",
    ],
  ),

  journey(
    "training-plans.library",
    "athlete",
    "/training-plans",
    ["owned, template, inaccessible, empty, and paginated plan fixtures"],
    [
      testId("training-plan-library", "training libraries have a stable root"),
      testIdPrefix("training-plan-card-", "owned/template plans render canonically"),
    ],
    [
      "Owned and template libraries filter authorization, paginate, open detail, and render empty states.",
      "Loading, error, and retry remain distinct from no plans.",
    ],
  ),
  journey(
    "training-plans.detail",
    "athlete",
    "/training-plans/00000000-0000-4000-8000-000000000001",
    ["owned and shared training plans", "progress and insight fixtures", "linked activity plans"],
    [
      testId("training-plan-detail", "training plan detail has a stable root"),
      testId("training-plan-insights", "insights and progress are independently addressable"),
    ],
    [
      "Structure, progress, insights, and linked activity plans render with owner-aware controls.",
      "Missing, invalid, inaccessible, loading, error, and retry states are covered.",
    ],
  ),
  journey(
    "training-plans.composer",
    "athlete",
    "/training-plans/create",
    ["activity-plan fixtures", "training-plan cleanup", "preview service"],
    [
      testId("training-plan-composer", "composer fields share a stable root"),
      testId("training-plan-preview", "preview is an observable stage"),
    ],
    [
      "Create and edit a valid plan through preview and persisted detail.",
      "Validation, cancel, failed preview/create, retry, and draft preservation are asserted.",
    ],
  ),
  journey(
    "training-plans.schedule",
    "athlete",
    "/training-plans/00000000-0000-4000-8000-000000000001",
    ["owned plan", "existing conflicting schedule", "event cleanup"],
    [
      testId("training-plan-schedule", "schedule management has a stable root"),
      testId("training-plan-schedule-conflict", "replacement conflicts are explicit"),
    ],
    [
      "Apply, conflict cancel, conflict replacement, reload, and schedule removal persist correctly.",
      "Mutation failure and retry never partially replace the active schedule.",
    ],
  ),
  journey(
    "training-plans.social",
    "profile",
    "/training-plans/00000000-0000-4000-8000-000000000001",
    multiActor,
    [
      testId("training-plan-social", "visibility, like, duplicate, and share controls are grouped"),
      testId("training-plan-share-state", "share capability reflects visibility"),
    ],
    [
      "Owner visibility controls and non-owner like/duplicate/share behavior obey access rules.",
      "Like rollback, duplicate failure, private sharing denial, and public link access are asserted.",
    ],
  ),
  journey(
    "training-preferences",
    "athlete",
    "/training-preferences",
    ["known persisted preference baseline", "restoration cleanup"],
    [
      testId("training-preferences-form", "preference fields share a stable form"),
      testId("training-preferences-save", "save and retry use one action"),
    ],
    [
      "Preferences hydrate, validate boundaries, save, reload, and restore their original values.",
      "Failed save preserves the dirty draft and recovers through retry.",
    ],
  ),

  journey(
    "activities.library",
    "athlete",
    "/activities",
    ["more than one page of categorized dated activities", "second unauthorized actor"],
    [
      testId("activity-library", "activity history has a stable root"),
      testIdPrefix("activity-card-", "persisted activities render canonically"),
    ],
    [
      "Search, category/date/sort filters, clear, pagination, and deterministic ordering are asserted.",
      "Empty, invalid range, partial failure, retry, and authorization states are distinct.",
    ],
  ),
  journey(
    "activities.rich-detail",
    "athlete",
    "/activities/00000000-0000-4000-8000-000000000001",
    ["FIT/GPX/swim activities", "full, partial, processing, and failed artifacts"],
    [
      testId("activity-detail", "activity detail has a stable root"),
      testId("activity-stream-state", "stream processing/availability is explicit"),
    ],
    [
      "Streams, charts, laps, zones, map, swim, units, and analysis match persisted evidence.",
      "No-artifact, processing, partial, failed, inaccessible, error, and retry states are covered.",
    ],
  ),
  journey(
    "activities.social",
    "profile",
    "/activities/00000000-0000-4000-8000-000000000001",
    multiActor,
    [
      testId("activity-like", "like state is stable"),
      testId("activity-comments", "comment draft/list/retry share a stable boundary"),
    ],
    [
      "Like/unlike and comment success persist for authorized actors.",
      "Failure rollback, preserved text, duplicate-submit protection, retry, and unauthorized behavior are asserted.",
    ],
  ),
  journey(
    "activities.visibility-share",
    "profile",
    "/activities/00000000-0000-4000-8000-000000000001",
    multiActor,
    [
      testId("activity-visibility", "visibility is explicit"),
      testId("activity-share", "share capability reflects effective visibility"),
    ],
    [
      "Private, followers, and public visibility obey owner/follower/outsider/anonymous access.",
      "Public links expose only allowed data and private links never leak content.",
    ],
  ),
  journey(
    "activities.delete",
    "athlete",
    "/activities/00000000-0000-4000-8000-000000000001",
    ["owned activity with artifacts", "non-owner actor", "artifact cleanup"],
    [
      testId("activity-delete", "delete is a stable owner-only action"),
      testId("activity-delete-confirm", "confirmation and pending state are explicit"),
    ],
    [
      "Cancel and failed delete preserve detail, history, and artifacts before retry.",
      "Authorized success removes the activity and unauthorized deletion is impossible.",
    ],
  ),
  journey(
    "activities.import",
    "athlete",
    "/activities/import",
    [
      "valid and malformed FIT/GPX/TCX files",
      "storage and processing services",
      "artifact cleanup",
    ],
    [
      testId("activity-import-file-input", "file selection is stable"),
      testId("activity-import-phase", "reading/uploading/processing/success phases are explicit"),
    ],
    [
      "FIT, GPX, and TCX import into deterministic detail with format-specific evidence.",
      "Invalid/oversized files, upload/process/navigation failures, retry, and duplicate submit preserve recoverable input.",
    ],
  ),

  journey(
    "routes.library",
    "athlete",
    "/routes",
    ["owned, shared, system, unauthorized, and paginated routes"],
    [
      testId("route-library", "route library has a stable root"),
      testIdPrefix("route-card-", "persisted routes render canonically"),
    ],
    [
      "Search, ownership/distance/ascent filters, sort, clear, pagination, and order are asserted.",
      "Empty, invalid query, error, retry, and authorization states are distinct.",
    ],
  ),
  journey(
    "routes.detail",
    "athlete",
    "/routes/00000000-0000-4000-8000-000000000001",
    ["routes with and without geometry", "owner and non-owner actors", "social fixtures"],
    [
      testId("route-detail", "route detail has a stable root"),
      testId("route-geometry-state", "geometry loading/empty/error is explicit"),
    ],
    [
      "Map, elevation, geometry, owner, likes, and comments match persisted access.",
      "No geometry, geometry failure, retry, missing route, and unauthorized access are covered.",
    ],
  ),
  journey(
    "routes.edit",
    "athlete",
    "/routes/00000000-0000-4000-8000-000000000001",
    ["owned route", "non-owner readable route", "mutation failure injection"],
    [
      testIdPrefix("route-detail-edit-", "owner edit action is stable"),
      testId("route-edit-form", "metadata editing has a stable form"),
    ],
    [
      "Name/description edit validates, cancels, saves, reloads, fails, and retries without changing geometry.",
      "Non-owner deep links and controls cannot submit an update.",
    ],
  ),
  journey(
    "routes.upload",
    "athlete",
    "/routes/upload",
    ["valid/malformed/oversized GPX, TCX, and XML", "storage service", "route cleanup"],
    [
      testId("route-upload-form", "route upload has a stable form"),
      testId("route-upload-submit", "upload phase action is stable"),
    ],
    [
      "Each supported format uploads, parses, persists geometry, and opens detail.",
      "Invalid/oversized files, API failure, retry, selected-file recovery, cleanup, and duplicate-submit protection are asserted.",
    ],
  ),
  journey(
    "routes.delete",
    "athlete",
    "/routes/00000000-0000-4000-8000-000000000001",
    ["owned free route", "owned event-linked route", "non-owner actor"],
    [
      testIdPrefix("route-detail-delete-", "route deletion is stable"),
      testId("route-delete-conflict", "linked-event conflicts are explicit"),
    ],
    [
      "Cancel and event-link conflict preserve the route before unlink/retry.",
      "Failed deletion recovers; authorized success removes storage; non-owner deletion is unavailable.",
    ],
  ),
  journey(
    "routes.attach-plan",
    "athlete",
    "/activity-plans/00000000-0000-4000-8000-000000000001",
    ["owned plan", "readable and inaccessible routes", "attachment cleanup"],
    [
      testId("activity-plan-route-picker", "plan route selection is stable"),
      testId("activity-plan-route-attachment", "the persisted route attachment is canonical"),
    ],
    [
      "Attach, open, replace, remove, and reload a readable route on an activity plan.",
      "Invalid/inaccessible selection, mutation failure, and retry do not corrupt the plan.",
    ],
  ),
  journey(
    "routes.attach-event",
    "athlete",
    "/calendar/new?type=planned",
    ["event fixture", "readable and inaccessible routes", "attachment cleanup"],
    [
      testId("event-route-picker", "event route selection is stable"),
      testId("event-route-attachment", "the persisted attachment is canonical"),
    ],
    [
      "Create/edit can attach, open, replace, remove, and reload a route.",
      "Invalid/inaccessible route, failure, retry, and authorization outcomes are covered.",
    ],
  ),
  journey(
    "routes.record-entry",
    "athlete",
    "/record/route",
    ["saved route with geometry", "recording launcher state", "fresh IndexedDB"],
    [
      testId("record-route-picker", "recording route selection is stable"),
      testId("record-route-preview", "geometry preview is required before attach"),
    ],
    [
      "Select, preview, attach, detach, and reload a route before recording.",
      "Missing/inaccessible geometry fails safely and attached identity locks after start.",
    ],
  ),

  journey(
    "metrics.library-crud",
    "athlete",
    "/profile-metrics",
    ["dense dated metric history", "manual metric cleanup", "failure injection"],
    [
      testId("profile-metric-library", "metric groups have a stable root"),
      testIdPrefix("profile-metric-row-", "measurement rows expose identity and source"),
    ],
    [
      "Metric selection/ranges plus manual create/read/edit/delete persist through reload.",
      "Invalid values/dates, cancel, failure, retry, pagination, empty, and source labels are asserted.",
    ],
  ),
  journey(
    "metrics.override",
    "athlete",
    "/profile-metrics",
    ["provider/activity sourced metric", "manual override cleanup"],
    [
      testId("profile-metric-source", "source provenance is explicit"),
      testId("profile-metric-manual-override", "override is separate from source editing"),
    ],
    [
      "Manual override creates a separate row while preserving immutable source evidence.",
      "Duplicate/boundary validation, failure, retry, and authorization are asserted.",
    ],
  ),
  journey(
    "trends.analytics",
    "athlete",
    "/trends",
    ["dense activity/metric history", "zones and peak performance evidence"],
    [
      testId("trends-dashboard", "analytics share a stable dashboard"),
      testId("trends-range-controls", "range changes are stable"),
    ],
    [
      "Volume, load, consistency, zones, and performance use deterministic persisted evidence and units.",
      "Range changes, empty history, unavailable evidence, and authorization are asserted.",
    ],
  ),
  journey(
    "trends.partial-retry",
    "athlete",
    "/trends",
    ["independently fail-able trend sources", "cached successful source data"],
    [
      testId("trends-partial-error", "partial failure is explicit"),
      testId("trends-retry", "failed sources can recover without dropping successful data"),
    ],
    [
      "One failed source preserves successful analytics and identifies only unavailable panels.",
      "Retry recovers the failed source without duplicating or resetting the healthy data.",
    ],
  ),

  journey(
    "profile.hub",
    "athlete",
    "/profile",
    ["owned groups, activities, plans, routes, and metrics", "deterministic counts"],
    [
      testId("profile-hub", "own profile has a stable root"),
      testId("profile-library-links", "owned resource libraries are grouped"),
    ],
    [
      "Identity, groups, and owned resource summaries match persisted records and navigate correctly.",
      "Empty, partial failure, retry, and unauthorized cross-profile behavior are asserted.",
    ],
  ),
  journey(
    "profile.edit",
    "athlete",
    "/settings",
    ["known profile baseline", "avatar/cover files and storage", "restoration cleanup"],
    [
      testId("profile-edit-form", "identity/bio/units/media share a stable form"),
      testId("profile-edit-save", "save/retry is a stable action"),
    ],
    [
      "Identity, bio, units, avatar, and cover save, reload, replace, remove, and restore.",
      "Validation, upload failure, mutation failure, retry, and draft preservation are asserted.",
    ],
  ),
  journey(
    "profile.units",
    "athlete",
    "/settings",
    ["known metric baseline", "distance/elevation/weight/pace fixtures", "restoration cleanup"],
    [
      testId("profile-units-control", "unit preference is stable"),
      testId("unit-sensitive-preview", "all affected field types are previewed"),
    ],
    [
      "Metric/imperial preference persists across settings, cards, forms, charts, and reload.",
      "Stored canonical values do not change when presentation units change.",
    ],
  ),
  journey(
    "profile.theme",
    "athlete",
    "/settings",
    ["controlled browser color scheme", "theme restoration cleanup"],
    [
      testId("profile-theme-control", "light/dark/system selection is stable"),
      testId("theme-effective-state", "effective theme is observable"),
    ],
    [
      "Light, dark, and system themes persist and system follows browser color-scheme changes.",
      "Reload and hydration never flash the wrong effective theme.",
    ],
  ),
  journey(
    "profile.email",
    "athlete",
    "/settings",
    ["captured-email auth lane", "unique replacement email", "current password"],
    [
      testId("profile-email-form", "verified email change has a stable form"),
      testId("profile-email-verification-state", "pending/verified outcomes are explicit"),
    ],
    [
      "Email change requires current authorization and captured verification before identity changes.",
      "Invalid, duplicate, expired, replayed, failed, retry, and session outcomes are asserted.",
    ],
  ),
  journey(
    "profile.password",
    "athlete",
    "/settings",
    ["two authenticated sessions", "known credential", "credential restoration"],
    [
      testId("profile-password-form", "password change has a stable form"),
      testId("profile-password-session-policy", "session revocation choice is explicit"),
    ],
    [
      "Password change validates current/new credentials and applies the selected session policy.",
      "Old/new login, second-session revocation, failure, retry, and restoration are asserted.",
    ],
  ),
  journey(
    "profile.sign-out",
    "athlete",
    "/profile",
    athlete,
    [
      testId("user-menu", "profile exposes the authenticated menu"),
      testId("sign-out", "sign-out targets only the current session"),
    ],
    [
      "Sign-out clears only the current isolated session and returns to an unauthenticated surface.",
      "Other explicitly retained sessions follow the documented policy.",
    ],
  ),

  journey(
    "integrations.status",
    "athlete",
    "/integrations",
    ["configured, connected, disconnected, and failed provider fixtures", "local provider adapter"],
    [
      testId("integration-status-matrix", "provider states have a stable matrix"),
      testIdPrefix("integration-provider-", "provider cards expose identity"),
    ],
    [
      "Configured, connected, disconnected, stale, and failed providers render truthful status and actions.",
      "History, planned sync, setup, loading, error, and retry states are independently observable.",
    ],
  ),
  journey(
    "integrations.oauth",
    "athlete",
    "/integrations",
    ["WAHOO_OAUTH_TEST_ADAPTER=1", "disconnected Wahoo", "OAuth state cleanup"],
    [
      testId("integration-connect", "OAuth starts from a stable action"),
      testId("integration-oauth-result", "sanitized success/replay outcomes are explicit"),
    ],
    [
      "Local PKCE OAuth succeeds once, returns only a code, and creates one connection.",
      "State mismatch/replay fails safely without exposing tokens or duplicating credentials.",
    ],
  ),
  journey(
    "integrations.reconnect",
    "athlete",
    "/integrations",
    ["stale/failed connected provider", "local OAuth adapter", "retained history"],
    [
      testId("integration-reconnect", "reconnect is distinct from first connect"),
      testId("integration-stale-error", "stale failure is explicit until recovery"),
    ],
    [
      "Reconnect replaces stale authorization while retaining imported history.",
      "Failure, replay, retry, and recovered health/action state are asserted.",
    ],
  ),
  journey(
    "integrations.disconnect",
    "athlete",
    "/integrations",
    [
      "connected provider with imported history",
      "disconnect job completion",
      "integration cleanup",
    ],
    [
      testId("integration-disconnect", "disconnect is a stable destructive action"),
      testId("integration-retained-history", "retention after disconnect is observable"),
    ],
    [
      "Confirmed disconnect removes credentials/sync controls and eventually renders disconnected state.",
      "Imported history remains, pending/failure/retry are explicit, and no secret is exposed.",
    ],
  ),
  journey(
    "integrations.polling",
    "athlete",
    "/integrations",
    ["connected provider", "queued/running/success sync fixtures", "network failure injection"],
    [
      testId("integration-sync-now", "manual sync is stable"),
      testId("integration-polling-state", "queued/running/success and cached failure are explicit"),
    ],
    [
      "Sync now transitions queued to running to success with deterministic timestamps.",
      "Network failure preserves cached provider state and retry recovers polling.",
    ],
  ),
  journey(
    "integrations.capability-truth",
    "athlete",
    "/integrations",
    ["scope and health capability matrix", "local provider adapter"],
    [
      testId("integration-capabilities", "scope/health capabilities are explicit"),
      testId("integration-capability-explanation", "unavailable actions explain why"),
    ],
    [
      "Connect, reconnect, sync, refresh, and disconnect appear only when scopes/health allow them.",
      "Unavailable actions never overclaim provider capability and expose a safe explanation.",
    ],
  ),

  journey(
    "messaging.inbox",
    "messaging",
    "/messages",
    multiActor,
    [
      testId("messages-inbox", "inbox has a stable root"),
      testIdPrefix(
        "messages-conversation-",
        "seeded conversations expose identity and unread state",
      ),
    ],
    [
      "Seeded DM/group previews and unread counts render, clear independently on read, and persist after reload.",
      "Empty, loading, failure, retry, pagination, and authorization states are asserted.",
    ],
  ),
  journey(
    "messaging.dm",
    "messaging",
    "/messages?compose=true",
    multiActor,
    [
      testId("messages-compose", "DM composition has a stable root"),
      testId("messages-send", "sending targets the selected conversation"),
    ],
    [
      "Search/select recipient, create/reuse DM, send unique text, and observe recipient unread/read state.",
      "Validation, duplicate send, network failure, retry, and unauthorized conversation access are asserted.",
    ],
  ),
  journey(
    "messaging.group",
    "messaging",
    "/messages?compose=true",
    multiActor,
    [
      testId("messages-group-compose", "group composition is stable"),
      testId("messages-group-read-state", "per-participant unread state is explicit"),
    ],
    [
      "Create a three-actor group, send, and preserve independent unread/read state for each participant.",
      "Participant validation, duplicate submit, failure, retry, and non-participant denial are asserted.",
    ],
  ),
  journey(
    "messaging.mobile-viewport",
    "messaging",
    "/messages",
    multiActor,
    [
      testId("messages-mobile-header", "narrow viewport keeps a stable header"),
      testId("messages-new", "new-message access remains visible"),
    ],
    [
      "At a 390px viewport the inbox exposes New message without clipped/desktop-only controls.",
      "Compose/search/back navigation and keyboard-safe layout remain usable.",
    ],
    { viewport: { height: 844, width: 390 } },
  ),
  journey(
    "notifications.inbox",
    "messaging",
    "/notifications",
    multiActor,
    [
      testId("notifications-inbox", "notification inbox has a stable root"),
      testIdPrefix("notification-row-", "mixed read/unread notifications expose identity"),
    ],
    [
      "All/unread filters, open, mark one, and mark all transition persisted unread state.",
      "Empty, loading, failure, retry, target navigation, and authorization are asserted.",
    ],
  ),
  journey(
    "notifications.follow-actions",
    "messaging",
    "/notifications",
    multiActor,
    [
      testIdPrefix("follow-notification-", "follow notifications identify the requesting actor"),
      testId("follow-notification-action", "accept/reject targets one request"),
    ],
    [
      "Actor-specific accept/reject removes the correct notification and persists relationship state.",
      "Concurrent request, failure, retry, duplicate action, and unauthorized outcomes are asserted.",
    ],
  ),

  journey(
    "recording.quick-timer",
    "athlete",
    "/record",
    recording,
    [
      testId("recording-category", "timer category selection is stable"),
      testId("recording-lifecycle", "start/pause/resume state is explicit"),
    ],
    [
      "Choose category, configure timer, start, pause, resume, and finish with monotonic elapsed time.",
      "Invalid transition and double action cannot corrupt the session.",
    ],
  ),
  journey(
    "recording.plan-route",
    "athlete",
    "/record",
    ["today's scheduled activity plan", "saved route with geometry", ...recording],
    [
      testId("recording-plan-attachment", "plan/event identity is attached"),
      testId("recording-route-attachment", "route identity/preview is attached"),
    ],
    [
      "Select plan/event and route, preview, attach/detach, reload, and preserve launcher state.",
      "Starting locks identity; missing/inaccessible resources fail without corrupting the draft.",
    ],
  ),
  journey(
    "recording.refresh",
    "athlete",
    "/record",
    recording,
    [
      testId("recording-checkpoint-state", "IndexedDB checkpoint state is observable"),
      testId("recording-recovery", "refresh recovery is explicit"),
    ],
    [
      "Active/paused checkpoints survive reload with exact identity and elapsed state.",
      "Resume/finalize removes the draft; corrupt/expired checkpoints fail safely.",
    ],
  ),
  journey(
    "recording.cross-tab",
    "athlete",
    "/record",
    recording,
    [
      testId("recording-lease-state", "tab ownership/lease is explicit"),
      testId("recording-takeover", "takeover is a stable fenced action"),
    ],
    [
      "A second tab takes over one session and the old tab cannot mutate or finalize it.",
      "Lease expiry, denial, recovery, cleanup, and one-owner finalization are asserted.",
    ],
  ),
  journey(
    "recording.finish",
    "athlete",
    "/record",
    recording,
    [
      testId("recording-review", "finalized artifact review has a stable root"),
      testId("recording-metadata", "name/notes/RPE/distance/calories persist"),
    ],
    [
      "Finish, edit metadata, reload review, save, open saved activity, and discard a fresh artifact.",
      "Validation, ambiguous save, retry, duplicate action, and cleanup are asserted.",
    ],
  ),
  journey(
    "recording.submission",
    "athlete",
    "/record",
    ["local authenticated submission API", "storage service", ...recording],
    [
      testId("recording-submission-state", "durable job state is explicit"),
      testId("recording-submission-retry", "offline/ambiguous retry is stable"),
    ],
    [
      "Offline saves one durable job; online retry creates one server activity and returns its identity.",
      "Repeated/ambiguous retries remain idempotent locally and server-side, then clean artifacts.",
    ],
  ),
  journey(
    "recording.sensors",
    "athlete",
    "/record",
    [
      "normal browser without supported BLE/FTMS hardware bridge",
      "optional controlled capability stubs",
    ],
    [
      testId("recording-capabilities", "sensor capability truth has a stable section"),
      text(
        "Desktop runtime adapter required",
        "FTMS unavailability is explicit without overclaiming parity",
      ),
    ],
    [
      "Normal Playwright asserts BLE/FTMS/GPS unavailable or setup-required states and no unsupported controls.",
      "Controlled browser capability stubs may expose optional transport but never claim real hardware parity.",
    ],
  ),
] satisfies FutureJourneyBlueprint[];

export const futureJourneyBlueprintById = new Map(
  futureJourneyBlueprints.map((blueprint) => [blueprint.id, blueprint] as const),
);

// Keep helpers referenced so static analysis catches accidental removal while registry entries evolve.
void label;
void role;
