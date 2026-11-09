import type { ReactNode } from "react";
import React from "react";
import { createHost, type HostProps } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Pressable: createHost("Pressable"),
  View: createHost("View"),
}));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("@/lib/stores/theme-store", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));
jest.mock("victory-native", () => {
  const BarGroup = ({ children, ...props }: HostProps) =>
    React.createElement("BarGroup", props, children);
  BarGroup.Bar = (props: HostProps) => React.createElement("BarGroupBar", props);
  return {
    BarGroup,
    CartesianChart: ({
      children,
      data,
      ...props
    }: HostProps & { children: (context: HostProps) => ReactNode; data: unknown[] }) =>
      React.createElement(
        "CartesianChart",
        { ...props, data },
        children({
          chartBounds: { bottom: 100, left: 0, right: 100, top: 0 },
          points: { completed: data, planned: data },
        }),
      ),
  };
});

const { WeeklyLoadChart } = require("./WeeklyLoadChart");
const days = Array.from({ length: 7 }, (_, index) => ({
  accessibilityLabel: `Apr ${13 + index}, 2026. Training recorded. Completed ${index * 5}. Planned ${20 + index * 5}.`,
  completed: index * 5,
  completedLabel: `${index * 5}`,
  consistencyLabel: "Training recorded",
  date: `2026-04-${13 + index}`,
  dateLabel: `Apr ${13 + index}, 2026`,
  durationLabel: "30 min",
  intensityLabel: "0.70",
  planned: 20 + index * 5,
  plannedLabel: `${20 + index * 5}`,
  shortDateLabel: `${13 + index}`,
  shortDayLabel: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index],
}));

it("renders Victory grouped bars and maps a chart tap to the nearest day", async () => {
  const onSelectDate = jest.fn();
  await renderNative(
    <WeeklyLoadChart days={days} onSelectDate={onSelectDate} selectedDate="2026-04-13" />,
  );

  const chart = screen.container.queryAll((node) => node.type === "CartesianChart")[0];
  expect(chart?.props.data).toEqual(
    expect.arrayContaining([expect.objectContaining({ completed: 0, planned: 20 })]),
  );
  expect(screen.container.queryAll((node) => node.type === "BarGroupBar")).toHaveLength(2);
  await fireEvent.press(screen.getByTestId("planning-ledger-weekly-chart-interaction"), {
    nativeEvent: { locationX: 308 },
  });
  expect(onSelectDate).toHaveBeenCalledWith("2026-04-19");
});

it("supports direct and adjustable day selection without capturing a vertical pan", async () => {
  const onSelectDate = jest.fn();
  await renderNative(
    <WeeklyLoadChart days={days} onSelectDate={onSelectDate} selectedDate="2026-04-15" />,
  );

  await fireEvent.press(screen.getByTestId("planning-ledger-day-2026-04-16"));
  expect(onSelectDate).toHaveBeenCalledWith("2026-04-16");
  await fireEvent(
    screen.getByTestId("planning-ledger-weekly-chart-interaction"),
    "accessibilityAction",
    { nativeEvent: { actionName: "increment" } },
  );
  expect(onSelectDate).toHaveBeenCalledWith("2026-04-16");
  expect(screen.getByTestId("planning-ledger-selected-day-values")).toBeTruthy();
});
