import { type BrowserContext, test as base, type Page } from "@playwright/test";

import { getWebParityReport } from "../src/lib/parity-report";
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
  parityReview: undefined;
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
  parityReview: [
    async ({ browser: _browser }, use, testInfo) => {
      await use(undefined);
      const report = getWebParityReport();
      testInfo.annotations.push({
        type: "declared-web-parity",
        description: `${report.percentage}% (${report.implemented}/${report.denominator} implemented; ${report.partial.length} partial)`,
      });
      await testInfo.attach("declared-web-parity.json", {
        body: Buffer.from(JSON.stringify(report, null, 2)),
        contentType: "application/json",
      });
    },
    { auto: true },
  ],
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
