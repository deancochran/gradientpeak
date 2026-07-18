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
      "ActivityCard.tsx",
      "ActivityPlanAttributionRow.tsx",
      "ActivityPlanCard.tsx",
      "ActivityPlanSummary.tsx",
      "AppBottomSheet.tsx",
      "AppFormModal.tsx",
      "AppHeader.tsx",
      "AppSelectionModal.tsx",
      "ClearFieldAction.tsx",
      "CompactInsightCard.tsx",
      "DetailChartModal.tsx",
      "EntityOwnerRow.tsx",
      "HeaderAction.tsx",
      "HeaderButtons.tsx",
      "IndexFilterSheet.tsx",
      "IndexSearchBar.tsx",
      "LayoutPrimitives.tsx",
      "ResourceCardPrimitives.tsx",
      "ResourceList.tsx",
      "RouteCard.tsx",
      "ScreenState.tsx",
      "SearchField.tsx",
      "SearchableBottomSheetList.tsx",
      "StaticRouteMapPreview.tsx",
      "TrainingPlanCard.tsx",
      "TrainingPlanPeriodizationPreview.tsx",
      "index.ts",
    ]);
  });

  it("keeps top-level web components limited to app-specific surfaces", () => {
    const webComponentsDir = path.join(repoRoot, "apps/web/src/components");
    const actualFiles = readdirSync(webComponentsDir)
      .filter((entry) => entry.endsWith(".ts") || entry.endsWith(".tsx"))
      .sort();

    expect(actualFiles).toEqual([
      "auth-card-shell.tsx",
      "forgot-password-form.tsx",
      "login-form.tsx",
      "route-flash-toast.tsx",
      "sign-up-form.tsx",
      "update-password-form.tsx",
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
