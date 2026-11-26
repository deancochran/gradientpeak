import type { ActivityPlanMetric, ActivityPlanSummary } from "@repo/core";
import React from "react";
import { createActivityPlanSummary } from "../../../../test/activity-plan-projection-fixture";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";
import { BuilderActivityAssignmentSheetContent } from "../BuilderActivityAssignmentSheetContent";

jest.mock("@/components/shared/SearchableBottomSheetList", () => ({
  SearchableList: ({
    data,
    renderItem,
  }: {
    data: ActivityPlanSummary[];
    renderItem: (item: ActivityPlanSummary) => React.ReactNode;
  }) => React.createElement(React.Fragment, null, ...data.map(renderItem)),
}));
jest.mock("@/components/shared/ActivityPlanCard", () => ({
  ActivityPlanCard: (props: object) => React.createElement("Pressable", props),
}));

it("passes viewer-only metrics to canonical picker cards and selects the unchanged summary", async () => {
  const plan = createActivityPlanSummary();
  const metrics: ActivityPlanMetric[] = [
    {
      key: "common_load",
      label: "Common Load",
      status: "available",
      value: 64,
      unit: "score",
      reason: null,
      provenance: "estimated",
    },
  ];
  const select = jest.fn();
  await renderNative(
    <BuilderActivityAssignmentSheetContent
      activityPlanEstimateById={new Map()}
      activityPlanItems={[plan]}
      metricsById={new Map([[plan.id, metrics]])}
      activityPlanSort="newest"
      categoryFilter={null}
      searchQuery=""
      onClearSearch={jest.fn()}
      onFetchNextPage={jest.fn()}
      onOpenFilters={jest.fn()}
      onSearchChange={jest.fn()}
      onSelectActivityPlan={select}
    />,
  );
  const card = screen.getByTestId(`training-plan-builder-activity-row-${plan.id}`);
  expect(card.props.projectionMetrics).toBe(metrics);
  expect(card.props.plan).toBe(plan);
  await fireEvent.press(card);
  expect(select).toHaveBeenCalledWith(plan);
});
