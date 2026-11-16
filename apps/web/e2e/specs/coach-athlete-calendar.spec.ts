import { createHash } from "node:crypto";
import { activityPlanSemanticHash, activityPlanStructureSchema } from "@repo/core/activity-plan";
import { stringifyCanonicalJson } from "@repo/core/athlete-intelligence";
import {
  activityPlans,
  athleteConsentPolicyVersions,
  athleteDataSharingConsents,
  coachingAssignments,
  coachingEngagements,
  organizationMembershipRoleGrants,
  organizationMemberships,
  plannedSessions,
} from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { expect, test } from "../fixtures";
import { expectNoHorizontalOverflow } from "../pages";
import { withLocalE2EDatabase } from "../support/database";
import { waitForAppHydration } from "../support/hydration";

test.beforeEach(() => expect(process.env.E2E_DISPOSABLE_DATABASE).toBe("1"));

function addUtcDays(dateOnly: string, days: number) {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function structureHash(structure: unknown) {
  return `v1:sha256:${createHash("sha256").update(stringifyCanonicalJson(structure)).digest("hex")}`;
}

async function expectCalendarControlContrast(page: import("@playwright/test").Page, name: string) {
  const style = await page.getByRole("button", { name }).evaluate((element) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D color conversion is unavailable.");
    const toSrgb = (color: string) => {
      context.fillStyle = "rgb(1, 2, 3)";
      const sentinel = context.fillStyle;
      context.fillStyle = color;
      if (context.fillStyle === sentinel && color !== sentinel)
        throw new Error(`Unsupported CSS color: ${color}`);
      context.clearRect(0, 0, 1, 1);
      context.fillRect(0, 0, 1, 1);
      const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
      if (red === undefined || green === undefined || blue === undefined || alpha !== 255)
        throw new Error(`Transparent or unreadable CSS color: ${color}`);
      return [red, green, blue] as const;
    };
    const color = getComputedStyle(element).color;
    const background = getComputedStyle(element).backgroundColor;
    const luminance = (rgb: readonly number[]) =>
      rgb
        .map((channel) => channel / 255)
        .map((channel) =>
          channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
        )
        .reduce((sum, channel, index) => sum + channel * ([0.2126, 0.7152, 0.0722][index] ?? 0), 0);
    const [light = 0, dark = 0] = [luminance(toSrgb(color)), luminance(toSrgb(background))].sort(
      (left, right) => right - left,
    );
    return {
      background,
      color,
      contrast: (light + 0.05) / (dark + 0.05),
    };
  });
  expect(
    style.contrast,
    `${name}: color=${style.color}, background=${style.background}`,
  ).toBeGreaterThanOrEqual(4.5);
}

async function expectBrowserColorConversion(page: import("@playwright/test").Page) {
  const contrasts = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D color conversion is unavailable.");
    const ratio = (foregroundCss: string, backgroundCss: string) => {
      const toSrgb = (color: string) => {
        context.fillStyle = "rgb(1, 2, 3)";
        const sentinel = context.fillStyle;
        context.fillStyle = color;
        if (context.fillStyle === sentinel && color !== sentinel)
          throw new Error(`Unsupported CSS color: ${color}`);
        context.clearRect(0, 0, 1, 1);
        context.fillRect(0, 0, 1, 1);
        const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
        if (red === undefined || green === undefined || blue === undefined || alpha !== 255)
          throw new Error(`Transparent or unreadable CSS color: ${color}`);
        return [red, green, blue] as const;
      };
      const luminance = (rgb: readonly number[]) =>
        rgb
          .map((channel) => channel / 255)
          .map((channel) =>
            channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
          )
          .reduce(
            (sum, channel, index) => sum + channel * ([0.2126, 0.7152, 0.0722][index] ?? 0),
            0,
          );
      const [light = 0, dark = 0] = [
        luminance(toSrgb(foregroundCss)),
        luminance(toSrgb(backgroundCss)),
      ].sort((left, right) => right - left);
      return (light + 0.05) / (dark + 0.05);
    };
    const dark = "oklch(0.208 0.042 265.755)";
    return {
      blackWhite: ratio("black", "white"),
      same: ratio(dark, dark),
      slateContrast: ratio("oklch(0.968 0.007 247.896)", dark),
    };
  });
  expect(contrasts.blackWhite).toBeCloseTo(21, 4);
  expect(contrasts.same).toBeCloseTo(1, 4);
  expect(contrasts.slateContrast).toBeGreaterThan(4.5);
}

test("assigned non-admin coach sees only consented date-only planned sessions", async ({
  athleteActor,
  athletePage,
  actorFactory,
  coachActor,
  e2eIdentity,
}, testInfo) => {
  test.setTimeout(120000);
  await athletePage.goto("/organizations/new");
  await athletePage.getByLabel("Organization name", { exact: true }).fill("Calendar acceptance");
  await athletePage
    .getByLabel("Organization URL name", { exact: true })
    .fill(`calendar-${e2eIdentity.uuid("organization")}`);
  await athletePage.getByRole("button", { name: "Create organization", exact: true }).click();
  // `/organizations/new` itself matches a broad organization path. Wait for the
  // post-create UUID dashboard route before using it in the disposable graph.
  await expect(athletePage).toHaveURL(
    /\/organizations\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/dashboard$/i,
  );
  const organizationId = new URL(athletePage.url()).pathname.match(
    /\/organizations\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/dashboard$/i,
  )?.[1];
  if (!organizationId)
    throw new Error("Organization creation did not navigate to a UUID dashboard.");

  const noCalendarAthlete = await actorFactory.create("athlete", { label: "metrics only athlete" });
  const coachMembershipId = e2eIdentity.uuid("calendar-coach-membership");
  const calendarEngagementId = e2eIdentity.uuid("calendar-engagement");
  const metricsOnlyEngagementId = e2eIdentity.uuid("metrics-only-engagement");
  const calendarConsentId = e2eIdentity.uuid("calendar-consent");
  const weekStart = new Date().toISOString().slice(0, 10);
  const weekEnd = addUtcDays(weekStart, 7);
  const nextWeekDate = addUtcDays(weekStart, 7);
  const privatePlanName = `Private calendar plan ${e2eIdentity.uuid("plan-name")}`;
  const planId = e2eIdentity.uuid("calendar-plan");
  const structure = activityPlanStructureSchema.parse({
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: e2eIdentity.uuid("rpe-step"),
        name: "Disposable RPE step",
        duration: { type: "time", seconds: 600 },
        targets: [{ type: "RPE", intensity: 5 }],
      },
    ],
  });

  await withLocalE2EDatabase(async (database) => {
    await database.typedTransaction(async (transaction) => {
      await transaction.insert(organizationMemberships).values({
        id: coachMembershipId,
        organization_id: organizationId,
        profile_id: coachActor.profileId,
      });
      await transaction.insert(organizationMembershipRoleGrants).values({
        organization_id: organizationId,
        membership_id: coachMembershipId,
        role_key: "coach",
      });
      await transaction.insert(coachingEngagements).values([
        {
          id: calendarEngagementId,
          organization_id: organizationId,
          athlete_profile_id: athleteActor.profileId,
        },
        {
          id: metricsOnlyEngagementId,
          organization_id: organizationId,
          athlete_profile_id: noCalendarAthlete.profileId,
        },
      ]);
      await transaction.insert(coachingAssignments).values([
        {
          organization_id: organizationId,
          engagement_id: calendarEngagementId,
          coach_membership_id: coachMembershipId,
          assignment_kind: "primary",
        },
        {
          organization_id: organizationId,
          engagement_id: metricsOnlyEngagementId,
          coach_membership_id: coachMembershipId,
          assignment_kind: "primary",
        },
      ]);
      const calendarPolicyId = e2eIdentity.uuid("calendar-policy");
      const metricsPolicyId = e2eIdentity.uuid("metrics-policy");
      await transaction.insert(athleteConsentPolicyVersions).values([
        {
          id: calendarPolicyId,
          scope_key: "calendar",
          effective_from: new Date(Date.now() - 1000),
          jurisdiction: "e2e",
          terms_text: "Disposable calendar consent",
          content_digest: `sha256:${calendarPolicyId}`,
        },
        {
          id: metricsPolicyId,
          scope_key: "metrics",
          effective_from: new Date(Date.now() - 1000),
          jurisdiction: "e2e",
          terms_text: "Disposable metrics consent",
          content_digest: `sha256:${metricsPolicyId}`,
        },
      ]);
      await transaction.insert(athleteDataSharingConsents).values([
        {
          id: calendarConsentId,
          organization_id: organizationId,
          engagement_id: calendarEngagementId,
          athlete_profile_id: athleteActor.profileId,
          scope_key: "calendar",
          policy_version_id: calendarPolicyId,
          granted_by_profile_id: athleteActor.profileId,
        },
        {
          organization_id: organizationId,
          engagement_id: calendarEngagementId,
          athlete_profile_id: athleteActor.profileId,
          scope_key: "metrics",
          policy_version_id: metricsPolicyId,
          granted_by_profile_id: athleteActor.profileId,
        },
        {
          organization_id: organizationId,
          engagement_id: metricsOnlyEngagementId,
          athlete_profile_id: noCalendarAthlete.profileId,
          scope_key: "metrics",
          policy_version_id: metricsPolicyId,
          granted_by_profile_id: noCalendarAthlete.profileId,
        },
      ]);
      await transaction.insert(activityPlans).values({
        id: planId,
        name: privatePlanName,
        profile_id: athleteActor.profileId,
        semantic_hash: activityPlanSemanticHash({
          structure,
          trainingIntent: "general_maintenance",
        }),
        structure,
        structure_hash: structureHash(structure),
      });
      await transaction.insert(plannedSessions).values(
        Array.from({ length: 30 }, (_, index) => {
          const operationId = e2eIdentity.uuid(`calendar-session-${index}`).replaceAll("-", "");
          return {
            id: e2eIdentity.uuid(`calendar-event-${index}`),
            profile_id: athleteActor.profileId,
            activity_plan_id: planId,
            contract_version: "planned-session-v1",
            session_revision: 1,
            planning_date: addUtcDays(weekStart, index % 7),
            original_target_date: addUtcDays(weekStart, index % 7),
            source_kind: "direct" as const,
            direct_operation_id: operationId,
            idempotency_key: `direct:${operationId}`,
            status: "scheduled" as const,
          };
        }).concat({
          id: e2eIdentity.uuid("next-week-event"),
          profile_id: athleteActor.profileId,
          activity_plan_id: planId,
          contract_version: "planned-session-v1",
          session_revision: 1,
          planning_date: nextWeekDate,
          original_target_date: nextWeekDate,
          source_kind: "direct" as const,
          direct_operation_id: e2eIdentity.uuid("next-week-operation").replaceAll("-", ""),
          idempotency_key: `direct:${e2eIdentity.uuid("next-week-operation").replaceAll("-", "")}`,
          status: "scheduled" as const,
        }),
      );
    });
  });

  const page = await coachActor.createPage(
    `/organizations/${organizationId}/athletes/${athleteActor.profileId}`,
  );
  await waitForAppHydration(page);
  await expectBrowserColorConversion(page);
  await expect(page.getByRole("heading", { name: "Current training state" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Planned sessions" })).toBeVisible();
  await expect(page.getByText(weekStart, { exact: true }).first()).toBeVisible();
  await expect(page.getByText("run", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("scheduled", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(privatePlanName, { exact: true })).toHaveCount(0);
  await expect(page.getByText(new RegExp(`${weekStart} to ${weekEnd}`))).toBeVisible();
  await expect(page.getByRole("button", { name: "Load more planned sessions" })).toBeVisible();
  await expectCalendarControlContrast(page, "Previous week");
  await expectCalendarControlContrast(page, "Next week");
  await expectCalendarControlContrast(page, "Load more planned sessions");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("coach-calendar-loaded-desktop.png"),
    fullPage: true,
    scale: "css",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("coach-calendar-loaded-mobile.png"),
    fullPage: true,
    scale: "css",
  });
  await page.getByRole("button", { name: "Load more planned sessions" }).click();
  await expect(page.getByRole("button", { name: "Load more planned sessions" })).toHaveCount(0);
  await page.getByRole("button", { name: "Next week" }).click();
  await expect(page.getByText(nextWeekDate, { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Previous week" }).click();
  await expect(page.getByText(weekStart, { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Switch athlete" }).click();
  await page
    .getByRole("list", { name: "Switch athlete" })
    .locator(`a[href="/organizations/${organizationId}/athletes/${noCalendarAthlete.profileId}"]`)
    .click();
  await expect(page.getByRole("heading", { name: "Current training state" })).toBeVisible();
  await expect(page.getByText("Planned sessions unavailable")).toBeVisible();
  await expect(page.getByText(weekStart, { exact: true })).toHaveCount(0);

  await withLocalE2EDatabase(async (database) =>
    database.db
      .update(athleteDataSharingConsents)
      .set({ ended_at: new Date() })
      .where(eq(athleteDataSharingConsents.id, calendarConsentId)),
  );
  await page.goto(`/organizations/${organizationId}/athletes/${athleteActor.profileId}`);
  await waitForAppHydration(page);
  await expect(page.getByRole("heading", { name: "Current training state" })).toBeVisible();
  await expect(page.getByText("Planned sessions unavailable")).toBeVisible();
  await expect(page.getByText(weekStart, { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("coach-calendar-denied-desktop.png"),
    fullPage: true,
    scale: "css",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("coach-calendar-denied-mobile.png"),
    fullPage: true,
    scale: "css",
  });
  await page.close();
});
