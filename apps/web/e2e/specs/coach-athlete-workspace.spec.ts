import type { Page, Route } from "@playwright/test";
import {
  athleteConsentPolicyVersions,
  athleteDataSharingConsents,
  coachingAssignments,
  coachingEngagements,
  organizationMembershipRoleGrants,
  organizationMemberships,
  profileAthleteState,
  profilePerformanceEstimates,
} from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import type { AuthenticatedE2EActor, E2EActorFactory } from "../support/actors";
import { withLocalE2EDatabase } from "../support/database";
import { waitForAppHydration } from "../support/hydration";
import type { E2EExecutionIdentity } from "../support/identity";

test.beforeEach(() => expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1"));

type Workspace = {
  athlete: AuthenticatedE2EActor;
  athleteUsername: string;
  coach: AuthenticatedE2EActor;
  firstConsentId: string;
  firstEngagementId: string;
  organizationId: string;
  otherAthlete: AuthenticatedE2EActor;
  otherEngagementId: string;
  otherOrganizationId: string;
  page: Page;
  secondAthlete: AuthenticatedE2EActor;
  secondEngagementId: string;
};

async function setupWorkspace(input: {
  actorFactory: E2EActorFactory;
  athlete: AuthenticatedE2EActor;
  athletePage: Page;
  coach: AuthenticatedE2EActor;
  identity: E2EExecutionIdentity;
}): Promise<Workspace> {
  const { actorFactory, athlete, athletePage, coach, identity } = input;
  const athleteUsername = athlete.username;
  if (!athleteUsername) throw new Error("Missing athlete username");
  const createOrganization = async (name: string, label: string) => {
    await athletePage.goto("/organizations/new");
    await athletePage.getByLabel("Organization name", { exact: true }).fill(name);
    await athletePage.getByLabel("Organization URL name", { exact: true }).fill(label);
    await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
    await expect(athletePage).toHaveURL(/\/organizations\/[^/]+\/dashboard$/);
    const id = new URL(athletePage.url()).pathname.split("/")[2];
    if (!id) throw new Error("Missing organization identity");
    return id;
  };
  const organizationId = await createOrganization(
    "Workspace acceptance",
    `workspace-${identity.uuid("org")}`,
  );
  const otherOrganizationId = await createOrganization(
    "Other workspace",
    `other-workspace-${identity.uuid("other-org")}`,
  );
  const [secondAthlete, otherAthlete] = await Promise.all([
    actorFactory.create("athlete", { label: "second athlete" }),
    actorFactory.create("athlete", { label: "other organization athlete" }),
  ]);
  const firstEngagementId = identity.uuid("first-engagement");
  const secondEngagementId = identity.uuid("second-engagement");
  const otherEngagementId = identity.uuid("other-engagement");
  const firstConsentId = identity.uuid("first-metrics-consent");
  const coachMembershipId = identity.uuid("coach-membership");
  const otherCoachMembershipId = identity.uuid("other-coach-membership");
  await withLocalE2EDatabase(async (database) =>
    database.typedTransaction(async (tx) => {
      await tx.insert(organizationMemberships).values([
        { id: coachMembershipId, organization_id: organizationId, profile_id: coach.profileId },
        {
          id: otherCoachMembershipId,
          organization_id: otherOrganizationId,
          profile_id: coach.profileId,
        },
      ]);
      await tx.insert(organizationMembershipRoleGrants).values([
        { organization_id: organizationId, membership_id: coachMembershipId, role_key: "coach" },
        {
          organization_id: otherOrganizationId,
          membership_id: otherCoachMembershipId,
          role_key: "coach",
        },
      ]);
      await tx.insert(coachingEngagements).values([
        {
          id: firstEngagementId,
          organization_id: organizationId,
          athlete_profile_id: athlete.profileId,
        },
        {
          id: secondEngagementId,
          organization_id: organizationId,
          athlete_profile_id: secondAthlete.profileId,
        },
        {
          id: otherEngagementId,
          organization_id: otherOrganizationId,
          athlete_profile_id: otherAthlete.profileId,
        },
      ]);
      await tx.insert(coachingAssignments).values([
        {
          organization_id: organizationId,
          engagement_id: firstEngagementId,
          coach_membership_id: coachMembershipId,
          assignment_kind: "primary",
        },
        {
          organization_id: organizationId,
          engagement_id: secondEngagementId,
          coach_membership_id: coachMembershipId,
          assignment_kind: "primary",
        },
        {
          organization_id: otherOrganizationId,
          engagement_id: otherEngagementId,
          coach_membership_id: otherCoachMembershipId,
          assignment_kind: "primary",
        },
      ]);
    }),
  );
  await athletePage.goto(`/organizations/${organizationId}/athletes`);
  await expect(athletePage.getByRole("button", { name: "Manage coaches" }).first()).toBeVisible();
  const page = await coach.createPage(`/organizations/${organizationId}/athletes`);
  await expect(page.getByRole("heading", { name: "Assigned athletes" })).toBeVisible();
  return {
    athlete,
    athleteUsername,
    coach,
    firstConsentId,
    firstEngagementId,
    organizationId,
    otherAthlete,
    otherEngagementId,
    otherOrganizationId,
    page,
    secondAthlete,
    secondEngagementId,
  };
}

async function grantMetrics(workspace: Workspace, identity: E2EExecutionIdentity) {
  const policy = identity.uuid("metrics-policy");
  const now = new Date();
  const fixtures = [
    {
      athlete: workspace.athlete,
      organizationId: workspace.organizationId,
      engagementId: workspace.firstEngagementId,
      consentId: workspace.firstConsentId,
      fitness: 41,
      fatigue: 35,
      watts: 211,
    },
    {
      athlete: workspace.secondAthlete,
      organizationId: workspace.organizationId,
      engagementId: workspace.secondEngagementId,
      consentId: identity.uuid("second-consent"),
      fitness: 72,
      fatigue: 80,
      watts: 322,
    },
    {
      athlete: workspace.otherAthlete,
      organizationId: workspace.otherOrganizationId,
      engagementId: workspace.otherEngagementId,
      consentId: identity.uuid("other-consent"),
      fitness: 63,
      fatigue: 50,
      watts: 433,
    },
  ];
  await withLocalE2EDatabase(async (database) =>
    database.typedTransaction(async (tx) => {
      await tx.insert(athleteConsentPolicyVersions).values({
        id: policy,
        scope_key: "metrics",
        effective_from: new Date(now.getTime() - 1000),
        jurisdiction: "e2e",
        terms_text: "Disposable workspace metrics consent",
        content_digest: identity.uuid("digest"),
      });
      for (const fixture of fixtures) {
        await tx.insert(athleteDataSharingConsents).values({
          id: fixture.consentId,
          organization_id: fixture.organizationId,
          engagement_id: fixture.engagementId,
          athlete_profile_id: fixture.athlete.profileId,
          scope_key: "metrics",
          policy_version_id: policy,
          granted_by_profile_id: fixture.athlete.profileId,
        });
        const state = {
          source_revision: 1,
          published_revision: 1,
          fitness: fixture.fitness,
          fatigue: fixture.fatigue,
          computed_at: now,
          coverage_end_at: now,
          evidence_confidence: 0.8,
        };
        await tx
          .insert(profileAthleteState)
          .values({ profile_id: fixture.athlete.profileId, ...state })
          .onConflictDoUpdate({ target: profileAthleteState.profile_id, set: state });
        await tx.insert(profilePerformanceEstimates).values({
          profile_id: fixture.athlete.profileId,
          capability_kind: "bike_ftp",
          activity_category: "bike",
          value: fixture.watts,
          unit: "watts",
          confidence: 0.8,
          effective_at: now,
          computed_at: now,
          algorithm_version: "workspace-fixture-v1",
          source_revision: 1,
        });
      }
    }),
  );
}

async function select(workspace: Workspace, athleteId: string) {
  const { page, organizationId } = workspace;
  await page.getByRole("button", { name: "Switch athlete" }).click();
  await page
    .getByRole("list", { name: "Switch athlete" })
    .locator(`a[href="/organizations/${organizationId}/athletes/${athleteId}"]`)
    .click();
}

async function clickCoachNavigationLink(page: Page, name: "Athletes" | "Organizations") {
  const desktopLink = page
    .getByRole("navigation", { name: "Coaching navigation" })
    .getByRole("link", { name, exact: true });
  if (await desktopLink.isVisible()) {
    await desktopLink.click();
    return;
  }
  await page.getByRole("button", { name: "Open coaching navigation" }).click();
  await page.getByRole("link", { name, exact: true }).click();
}

test("withholds then shows only the selected athlete's real published metrics", async ({
  athletePage,
  athleteActor,
  actorFactory,
  coachActor,
  e2eIdentity,
}) => {
  const workspace = await setupWorkspace({
    athletePage,
    athlete: athleteActor,
    actorFactory,
    coach: coachActor,
    identity: e2eIdentity,
  });
  const { page, athlete, secondAthlete } = workspace;
  await page.getByRole("link", { name: athlete.username ?? "Assigned athlete" }).click();
  await expect(page.getByText("Athlete workspace unavailable")).toBeVisible();
  await select(workspace, secondAthlete.profileId);
  await expect(page.getByText("Athlete workspace unavailable")).toBeVisible();
  await grantMetrics(workspace, e2eIdentity);
  await page.reload();
  await waitForAppHydration(page);
  await expect(page.getByText("322 watts", { exact: true })).toBeVisible();
  await expect(page.getByText("211 watts", { exact: true })).toHaveCount(0);
  await select(workspace, athlete.profileId);
  await expect(page.getByText("211 watts", { exact: true })).toBeVisible();
  await expect(page.getByText("322 watts", { exact: true })).toHaveCount(0);
  await page.reload();
  await waitForAppHydration(page);
  await expect(page.getByText("211 watts", { exact: true })).toBeVisible();
});

test("deferred selected-athlete response cannot reveal or overwrite another athlete", async ({
  athletePage,
  athleteActor,
  actorFactory,
  coachActor,
  e2eIdentity,
}) => {
  const workspace = await setupWorkspace({
    athletePage,
    athlete: athleteActor,
    actorFactory,
    coach: coachActor,
    identity: e2eIdentity,
  });
  await grantMetrics(workspace, e2eIdentity);
  const { page, athlete, secondAthlete, organizationId } = workspace;
  await page.goto(`/organizations/${organizationId}/athletes/${athlete.profileId}`);
  await expect(page.getByText("211 watts", { exact: true })).toBeVisible();
  await expect(page.getByText(`@${athlete.username}`, { exact: true })).toBeVisible();
  let resolve!: () => void;
  let arrive!: () => void;
  const release = new Promise<void>((done) => {
    resolve = done;
  });
  const arrived = new Promise<void>((done) => {
    arrive = done;
  });
  const hold = async (route: Route) => {
    if (
      route.request().method() !== "POST" ||
      !(route.request().postData() ?? "").includes(secondAthlete.profileId)
    )
      return route.continue();
    arrive();
    await release;
    return route.continue();
  };
  await page.route("**/*", hold);
  await page.getByRole("button", { name: "Switch athlete" }).click();
  const navigation = page
    .getByRole("list", { name: "Switch athlete" })
    .locator(`a[href="/organizations/${organizationId}/athletes/${secondAthlete.profileId}"]`)
    .click();
  await arrived;
  await expect(page).toHaveURL(
    `/organizations/${organizationId}/athletes/${secondAthlete.profileId}`,
  );
  await expect(page.getByRole("status")).toHaveText("Loading athlete workspace…");
  await expect(page.getByText(`@${athlete.username}`, { exact: true })).toHaveCount(0);
  await expect(page.getByText("211 watts", { exact: true })).toHaveCount(0);
  await expect(page.getByText("322 watts", { exact: true })).toHaveCount(0);
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(`/organizations/${organizationId}/athletes/${athlete.profileId}`);
  resolve();
  await navigation;
  await page.unroute("**/*", hold);
  await expect(page.getByText(`@${athlete.username}`, { exact: true })).toBeVisible();
  await expect(page.getByText("211 watts", { exact: true })).toBeVisible();
  await expect(page.getByText("322 watts", { exact: true })).toHaveCount(0);
});

test("deferred directory search response does not retain a prior search during history navigation", async ({
  athletePage,
  athleteActor,
  actorFactory,
  coachActor,
  e2eIdentity,
}) => {
  const workspace = await setupWorkspace({
    athletePage,
    athlete: athleteActor,
    actorFactory,
    coach: coachActor,
    identity: e2eIdentity,
  });
  await grantMetrics(workspace, e2eIdentity);
  const { page, athleteUsername, organizationId } = workspace;
  await expect(page.getByText(`@${athleteUsername}`, { exact: true })).toBeVisible();

  let resolveSearch!: () => void;
  let arriveSearch!: () => void;
  const searchRelease = new Promise<void>((done) => {
    resolveSearch = done;
  });
  const searchArrived = new Promise<void>((done) => {
    arriveSearch = done;
  });
  const delayedSearch = "delayed directory";
  const holdSearch = async (route: Route) => {
    if (
      route.request().method() !== "POST" ||
      !(route.request().postData() ?? "").includes(delayedSearch)
    )
      return route.continue();
    arriveSearch();
    await searchRelease;
    return route.continue();
  };
  await page.route("**/*", holdSearch);
  await page.getByLabel("Search assigned athletes").fill(delayedSearch);
  const searchNavigation = page.getByRole("button", { name: "Search", exact: true }).click();
  await searchArrived;
  await expect(page).toHaveURL(
    `/organizations/${organizationId}/athletes?${new URLSearchParams({ q: delayedSearch })}`,
  );
  await expect(page.getByRole("status")).toHaveText("Loading assigned athletes…");
  await expect(page.getByText(`@${athleteUsername}`, { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Search assigned athletes")).toHaveCount(0);
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(`/organizations/${organizationId}/athletes`);
  resolveSearch();
  await searchNavigation;
  await page.unroute("**/*", holdSearch);
  await expect(page.getByText(`@${athleteUsername}`, { exact: true })).toBeVisible();
  await expect(page.getByLabel("Search assigned athletes")).toHaveValue("");
});

test("deferred directory response does not retain a prior organization during client navigation", async ({
  athletePage,
  athleteActor,
  actorFactory,
  coachActor,
  e2eIdentity,
}) => {
  const workspace = await setupWorkspace({
    athletePage,
    athlete: athleteActor,
    actorFactory,
    coach: coachActor,
    identity: e2eIdentity,
  });
  const { page, athleteUsername, otherAthlete, otherOrganizationId } = workspace;
  await expect(page.getByText(`@${athleteUsername}`, { exact: true })).toBeVisible();

  await clickCoachNavigationLink(page, "Organizations");
  await expect(page).toHaveURL("/organizations");
  await page
    .getByRole("link", { name: "Open Other workspace coaching dashboard", exact: true })
    .click();
  await expect(page).toHaveURL(`/organizations/${otherOrganizationId}/dashboard`);
  await expect(page.getByText("Coaching workspace", { exact: true })).toBeVisible();

  let resolveOrganization!: () => void;
  let arriveOrganization!: () => void;
  const organizationRelease = new Promise<void>((done) => {
    resolveOrganization = done;
  });
  const organizationArrived = new Promise<void>((done) => {
    arriveOrganization = done;
  });
  const holdOrganization = async (route: Route) => {
    const body = route.request().postData() ?? "";
    if (route.request().method() !== "POST" || !body.includes(otherOrganizationId))
      return route.continue();
    arriveOrganization();
    await organizationRelease;
    return route.continue();
  };
  await page.route("**/*", holdOrganization);
  const organizationNavigation = clickCoachNavigationLink(page, "Athletes");
  await organizationArrived;
  await expect(page).toHaveURL(`/organizations/${otherOrganizationId}/athletes`);
  await expect(page.getByRole("status")).toHaveText("Loading assigned athletes…");
  await expect(page.getByText(`@${athleteUsername}`, { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Search assigned athletes")).toHaveCount(0);
  resolveOrganization();
  await organizationNavigation;
  await page.unroute("**/*", holdOrganization);
  await expect(page.getByText(`@${otherAthlete.username}`, { exact: true })).toBeVisible();
  await expect(page.getByLabel("Search assigned athletes")).toHaveValue("");
});

test("revoked consent denies metrics but preserves assignment identity", async ({
  athletePage,
  athleteActor,
  actorFactory,
  coachActor,
  e2eIdentity,
}) => {
  const workspace = await setupWorkspace({
    athletePage,
    athlete: athleteActor,
    actorFactory,
    coach: coachActor,
    identity: e2eIdentity,
  });
  await grantMetrics(workspace, e2eIdentity);
  const { page, athlete, firstConsentId, organizationId } = workspace;
  await page.goto(`/organizations/${organizationId}/athletes/${athlete.profileId}`);
  await withLocalE2EDatabase(async (database) =>
    database.db
      .update(athleteDataSharingConsents)
      .set({ ended_at: new Date() })
      .where(eq(athleteDataSharingConsents.id, firstConsentId)),
  );
  await page.reload();
  await waitForAppHydration(page);
  await expect(page.getByText("Athlete workspace unavailable")).toBeVisible();
  await expect(page.getByText(`@${workspace.athleteUsername}`, { exact: true })).toBeVisible();
  await expect(page.getByText("211 watts", { exact: true })).toHaveCount(0);
});

test("directory history and direct URL identity fences honor parsed search and organization", async ({
  athletePage,
  athleteActor,
  actorFactory,
  coachActor,
  e2eIdentity,
}) => {
  const workspace = await setupWorkspace({
    athletePage,
    athlete: athleteActor,
    actorFactory,
    coach: coachActor,
    identity: e2eIdentity,
  });
  await grantMetrics(workspace, e2eIdentity);
  const { page, organizationId, athleteUsername, otherAthlete } = workspace;
  await page.getByLabel("Search assigned athletes").fill(athleteUsername);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/organizations/${organizationId}/athletes\\?q=`));
  await page.goBack();
  await expect(page).toHaveURL(`/organizations/${organizationId}/athletes`);
  await expect(page.getByLabel("Search assigned athletes")).toHaveValue("");
  await page.goForward();
  await expect(page.getByText(`@${athleteUsername}`, { exact: true })).toBeVisible();
  await page.goto(
    `/organizations/${organizationId}/athletes?view=administration&cursor=${e2eIdentity.uuid("cursor")}&q=${encodeURIComponent("athlete search")}#directory`,
  );
  await expect(page.getByRole("heading", { name: "Coaching access required" })).toBeVisible();
  await page.goto(`/organizations/${organizationId}/athletes/${otherAthlete.profileId}#identity`);
  await expect(page.getByText("Athlete workspace unavailable")).toBeVisible();
  await expect(page.getByText(`@${otherAthlete.username}`, { exact: true })).toHaveCount(0);
  await expect(page.getByText("433 watts", { exact: true })).toHaveCount(0);
});
