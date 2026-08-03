import React from "react";
import { createHost, type HostProps } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Modal: ({ visible, children, ...props }: HostProps & { visible?: boolean }) =>
    visible ? React.createElement("Modal", props, children) : null,
}));

jest.mock("@repo/tailwindcss/native", () => ({
  __esModule: true,
  THEME: {
    light: { primaryForeground: "#fff" },
    dark: { primaryForeground: "#fff" },
  },
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: createHost("Button"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("lucide-react-native", () => ({ __esModule: true, X: createHost("X") }));
jest.mock("@/lib/stores/theme-store", () => ({
  __esModule: true,
  useTheme: () => ({ resolvedTheme: "light" }),
}));
jest.mock("@/lib/hooks/useReliableMutation", () => ({
  __esModule: true,
  useReliableMutation: () => ({ isPending: false, mutateAsync: jest.fn() }),
}));
jest.mock("./components/ConstraintValidator", () => ({
  __esModule: true,
  ConstraintValidator: createHost("ConstraintValidator"),
}));
jest.mock("./components/ActivitySelector", () => ({
  __esModule: true,
  ActivitySelector: ({
    activities,
    onSelect,
  }: {
    activities: unknown[];
    onSelect: (item: unknown) => void;
  }) =>
    React.createElement("Pressable", {
      testID: "select-activity",
      onPress: () => onSelect(activities[0]),
    }),
}));
jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    activityPlans: {
      list: {
        useQuery: () => ({
          data: {
            items: [{ id: "plan-1", name: "Tempo", activity_category: "run" }],
          },
          isLoading: false,
          error: null,
        }),
      },
    },
    events: {
      validateConstraints: {
        useQuery: () => ({
          data: {
            canSchedule: false,
            hasWarnings: false,
            constraints: {
              weeklyLoad: { status: "violated", current: null, withNew: null, limit: 280 },
              activitiesPerWeek: { status: "satisfied", current: 2, withNew: 3, limit: 5 },
              consecutiveDays: { status: "satisfied", current: 1, withNew: 2, limit: 3 },
              restDays: { status: "satisfied", current: 5, withNew: 4, minimum: 2 },
            },
          },
          isLoading: false,
          error: null,
        }),
      },
      create: {},
    },
  },
}));

const { AddActivityModal } = require("./AddActivityModal") as typeof import("./AddActivityModal");

describe("AddActivityModal", () => {
  it("does not describe unavailable weekly Load as a constraint violation", () => {
    renderNative(
      <AddActivityModal
        visible
        onClose={jest.fn()}
        selectedDate="2026-06-01"
        trainingPlanId="training-plan-1"
      />,
    );

    fireEvent.press(screen.getByTestId("select-activity"));

    expect(screen.getByText("⚠️ Weekly Load could not be evaluated")).toBeTruthy();
    expect(screen.queryByText("⚠️ This will override constraint violations")).toBeNull();
  });
});
