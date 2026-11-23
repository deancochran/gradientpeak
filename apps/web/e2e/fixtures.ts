import { test as base, type Page } from "@playwright/test";
import {
  clearMessagingNotifications,
  type MessagingNotificationSeedIds,
  seedMessagingNotifications,
} from "./seeds/messaging-notifications";
import {
  type AuthenticatedE2EActor,
  actorPoolBaseURL,
  createActorFactory,
  type E2EActor,
  type E2EActorFactory,
  E2EActorPool,
} from "./support/actors";
import { E2ECleanupRegistry, runCleanupFixture } from "./support/cleanup";
import { LocalE2EDatabase } from "./support/database";
import { createDomainFixtureBuilders, type DomainFixtureBuilders } from "./support/domain";
import { installHydrationAwareNavigation } from "./support/hydration";
import { createE2EExecutionIdentity, type E2EExecutionIdentity } from "./support/identity";

export type MultiActorFixture = {
  athlete: AuthenticatedE2EActor;
  coach: AuthenticatedE2EActor;
};

type WebStartFixtures = {
  actorFactory: E2EActorFactory;
  anonymousActor: E2EActor;
  anonymousPage: Page;
  athleteActor: AuthenticatedE2EActor;
  athletePage: Page;
  coachActor: AuthenticatedE2EActor;
  coachPage: Page;
  e2eCleanup: E2ECleanupRegistry;
  e2eData: DomainFixtureBuilders;
  e2eIdentity: E2EExecutionIdentity;
  messagingNotificationsPage: Page;
  multiActor: MultiActorFixture;
  onboardingActor: AuthenticatedE2EActor;
  onboardingPage: Page;
  profileActor: AuthenticatedE2EActor;
  profilePage: Page;
  unverifiedActor: AuthenticatedE2EActor;
  unverifiedPage: Page;
};

type WebStartWorkerFixtures = {
  actorPool: E2EActorPool;
  e2eDatabase: LocalE2EDatabase;
};

export const test = base.extend<WebStartFixtures, WebStartWorkerFixtures>({
  actorFactory: async ({ actorPool, contextOptions, e2eCleanup, e2eIdentity }, use, testInfo) => {
    const factory = createActorFactory(actorPool, {
      contextOptions,
      identity: e2eIdentity,
      registry: e2eCleanup,
      testInfo,
    });
    try {
      await use(factory);
    } finally {
      await actorPool.dispose();
    }
  },
  actorPool: [
    async ({ browser, e2eDatabase, playwright }, use, workerInfo) => {
      await use(
        new E2EActorPool(browser, playwright.request, e2eDatabase, actorPoolBaseURL(workerInfo)),
      );
    },
    { scope: "worker" },
  ],
  anonymousActor: async ({ actorFactory }, use) => {
    await use(await actorFactory.createAnonymous());
  },
  anonymousPage: async ({ anonymousActor }, use) => {
    await use(await anonymousActor.createPage("/"));
  },
  athleteActor: async ({ actorFactory }, use) => {
    await use(await actorFactory.create("athlete"));
  },
  athletePage: async ({ athleteActor }, use) => {
    await use(await athleteActor.createPage("/"));
  },
  coachActor: async ({ actorFactory }, use) => {
    await use(await actorFactory.create("coach"));
  },
  coachPage: async ({ coachActor }, use) => {
    await use(await coachActor.createPage("/"));
  },
  e2eCleanup: [
    async ({ e2eDatabase }, use, testInfo) => {
      const registry = new E2ECleanupRegistry();
      await runCleanupFixture(registry, e2eDatabase, testInfo, () => use(registry));
    },
    { auto: true },
  ],
  e2eData: async ({ e2eCleanup, e2eDatabase, e2eIdentity }, use) => {
    await use(createDomainFixtureBuilders(e2eDatabase, e2eCleanup, e2eIdentity));
  },
  e2eDatabase: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture callbacks require object destructuring.
    async ({}, use) => {
      const database = new LocalE2EDatabase();
      try {
        await use(database);
      } finally {
        await database.close();
      }
    },
    { scope: "worker" },
  ],
  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture callbacks require object destructuring.
  e2eIdentity: async ({}, use, testInfo) => {
    await use(createE2EExecutionIdentity(testInfo));
  },
  messagingNotificationsPage: async (
    { actorFactory, e2eCleanup, e2eDatabase, e2eIdentity },
    use,
  ) => {
    const athlete = await actorFactory.create("athlete", { label: "notifications-athlete" });
    const coach = await actorFactory.create("coach", {
      label: "notifications-coach",
      primary: false,
    });
    const ids: MessagingNotificationSeedIds = {
      conversationId: e2eIdentity.uuid("notifications-conversation"),
      historyMessageId: e2eIdentity.uuid("notifications-history-message"),
      incomingMessageId: e2eIdentity.uuid("notifications-incoming-message"),
      notificationIds: {
        follower: e2eIdentity.uuid("notifications-follower"),
        invitation: e2eIdentity.uuid("notifications-invitation"),
        message: e2eIdentity.uuid("notifications-message"),
      },
    };
    await seedMessagingNotifications(
      e2eDatabase,
      { athleteEmail: athlete.email, coachEmail: coach.email },
      ids,
    );
    e2eCleanup.registerExactId({
      kind: "messaging-notifications",
      id: ids.conversationId,
      cleanup: (database) => clearMessagingNotifications(database, ids),
    });
    await use(await athlete.createPage("/"));
  },
  multiActor: async ({ actorFactory }, use) => {
    const [athlete, coach] = await Promise.all([
      actorFactory.create("athlete", { label: "multi-athlete" }),
      actorFactory.create("coach", { label: "multi-coach", primary: false }),
    ]);
    await use({ athlete, coach });
  },
  onboardingActor: async ({ actorFactory, e2eIdentity }, use) => {
    await actorFactory.create("athlete", {
      fullName: "Onboarding Trail Guide",
      label: "onboarding-discovery-owner",
      username: `onboarding_trail_guide_${e2eIdentity.suffix("onboarding-discovery-owner")}`,
    });
    await use(await actorFactory.create("onboarding"));
  },
  onboardingPage: async ({ onboardingActor }, use) => {
    await use(await onboardingActor.createPage("/"));
  },
  page: async ({ page }, use) => {
    await use(installHydrationAwareNavigation(page));
  },
  profileActor: async ({ actorFactory }, use) => {
    await use(await actorFactory.create("profile"));
  },
  profilePage: async ({ profileActor }, use) => {
    await use(await profileActor.createPage("/"));
  },
  unverifiedActor: async ({ actorFactory }, use) => {
    await use(await actorFactory.create("unverified"));
  },
  unverifiedPage: async ({ unverifiedActor }, use) => {
    await use(await unverifiedActor.createPage("/"));
  },
});

export { expect } from "@playwright/test";
