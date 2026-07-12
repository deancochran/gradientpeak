import { readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "../..");

describe("UI ownership guardrails", () => {
  it("keeps mobile shared components limited to approved app-shell files", () => {
    const sharedDir = path.join(repoRoot, "apps/mobile/components/shared");
    const actualFiles = readdirSync(sharedDir)
      .filter((entry) => entry.endsWith(".ts") || entry.endsWith(".tsx"))
      .sort();

    expect(actualFiles).toEqual([
      "ActivityPlanCard.tsx",
      "AppHeader.tsx",
      "DetailChartModal.tsx",
      "HeaderButtons.tsx",
      "index.ts",
    ]);
  });

  it("keeps top-level web components limited to app-specific surfaces", () => {
    const webComponentsDir = path.join(repoRoot, "apps/web/src/components");
    const actualFiles = readdirSync(webComponentsDir)
      .filter((entry) => entry.endsWith(".ts") || entry.endsWith(".tsx"))
      .sort();

    expect(actualFiles).toEqual([
      "auth-guard.tsx",
      "current-user-avatar.tsx",
      "dashboard-header.tsx",
      "forgot-password-form.tsx",
      "like-button.tsx",
      "login-form.tsx",
      "messages-button.tsx",
      "nav-bar.tsx",
      "notifications-button.tsx",
      "sign-up-form.tsx",
      "update-password-form.tsx",
      "user-nav.tsx",
    ]);
  });

  it("keeps nested mobile activity shared components limited to feature-owned files", () => {
    const activitySharedDir = path.join(repoRoot, "apps/mobile/components/activity/shared");
    const actualFiles = readdirSync(activitySharedDir)
      .filter((entry) => entry.endsWith(".ts") || entry.endsWith(".tsx"))
      .sort();

    expect(actualFiles).toEqual(["ActivityHeader.tsx", "ZoneDistributionCard.tsx"]);
  });
});
