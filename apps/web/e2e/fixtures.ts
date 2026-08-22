import { type BrowserContext, test as base, type Page } from "@playwright/test";

import { openAppPage } from "./utils/navigation";
import {
  acquireTestActorLock,
  authenticateTestActor,
  clearMessagingNotificationsState,
  resetLocalAuthRateLimits,
  resetMessagingNotificationsState,
  type TestUserRole,
} from "./utils/testData";

type WebStartFixtures = {
  athletePage: Page;
  coachPage: Page;
  messagingNotificationsPage: Page;
  onboardingPage: Page;
  profilePage: Page;
  unverifiedPage: Page;
};

export const test = base.extend<WebStartFixtures>({
  athletePage: async ({ context }, use) => {
    await useActorPage(context, "athlete", use);
  },
  coachPage: async ({ context }, use) => {
    await useActorPage(context, "coach", use);
  },
  messagingNotificationsPage: async ({ context }, use) => {
    const page = await context.newPage();
    let releaseSharedLock: (() => Promise<void>) | undefined;
    let hasMessagingLocks = false;

    try {
      releaseSharedLock = await acquireTestActorLock("athlete");
      hasMessagingLocks = true;

      await resetLocalAuthRateLimits();
      await authenticateTestActor(context.request, "coach", { persistStorageState: false });
      await context.clearCookies();
      await authenticateTestActor(context.request, "athlete", { persistStorageState: false });
      await resetMessagingNotificationsState();
      await openAppPage(page, "/");
      await use(page);
    } finally {
      try {
        if (hasMessagingLocks) {
          await clearMessagingNotificationsState();
        }
      } finally {
        try {
          await releaseSharedLock?.();
        } finally {
          await page.close();
        }
      }
    }
  },
  onboardingPage: async ({ context }, use) => {
    await useActorPage(context, "onboarding", use);
  },
  profilePage: async ({ context }, use) => {
    await useActorPage(context, "profile", use);
  },
  unverifiedPage: async ({ context }, use) => {
    await useActorPage(context, "unverified", use);
  },
});

async function useActorPage(
  context: BrowserContext,
  role: TestUserRole,
  use: (page: Page) => Promise<void>,
) {
  const page = await context.newPage();
  let releaseActorLock: (() => Promise<void>) | undefined;
  try {
    releaseActorLock = await acquireTestActorLock(role);
    await resetLocalAuthRateLimits();
    await authenticateTestActor(context.request, role, { persistStorageState: false });
    await openAppPage(page, "/");
    await use(page);
  } finally {
    try {
      await releaseActorLock?.();
    } finally {
      await page.close();
    }
  }
}

export { expect } from "@playwright/test";
