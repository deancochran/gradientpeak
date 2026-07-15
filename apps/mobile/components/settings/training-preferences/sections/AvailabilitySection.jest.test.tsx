import type { AthleteTrainingSettingsFormInput } from "@repo/core/schemas/settings/profile_settings";
import { act } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { type Control, type FieldValues, useForm, useWatch } from "react-hook-form";
import { createHost } from "../../../../test/mock-components";
import { renderNative, screen } from "../../../../test/render-native";
import {
  AvailabilitySection,
  getAvailabilityWindowValidation,
  type WeekdayKey,
} from "./AvailabilitySection";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  View: createHost("View"),
}));

jest.mock("@repo/ui/components/button", () => ({ Button: createHost("Button") }));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("@repo/ui/components/time-input", () => ({
  TimeInput: ({ testId, ...props }: { testId?: string; [key: string]: unknown }) => {
    const React = require("react");
    return React.createElement("TimeInput", { ...props, testID: testId });
  },
}));
jest.mock("@repo/ui/components/form", () => {
  const React = require("react");
  const { Controller, useController } = require("react-hook-form");
  return {
    FormField: (props: Record<string, unknown>) => React.createElement(Controller, props),
    FormIntegerStepperField: ({
      control,
      name,
      testId,
      ...props
    }: {
      control: unknown;
      name: string;
      testId?: string;
      [key: string]: unknown;
    }) => {
      const { field } = useController({ control: control as Control<FieldValues>, name });
      return React.createElement("FormIntegerStepperField", {
        ...props,
        onChange: field.onChange,
        testID: testId,
        value: field.value,
      });
    },
  };
});

const fourWindows = [
  { start_minute_of_day: 360, end_minute_of_day: 480 },
  { start_minute_of_day: 480, end_minute_of_day: 600 },
  { start_minute_of_day: 720, end_minute_of_day: 840 },
  { start_minute_of_day: 1260, end_minute_of_day: 1440 },
];

function Harness({
  children,
  initialWindows = fourWindows,
}: {
  children?: (value: AthleteTrainingSettingsFormInput["availability"]) => ReactNode;
  initialWindows?: typeof fourWindows;
}) {
  const form = useForm<AthleteTrainingSettingsFormInput>({
    defaultValues: {
      availability: {
        hard_rest_days: [],
        weekly_windows: [{ day: "monday", max_sessions: 1, windows: initialWindows }],
      },
    } as unknown as AthleteTrainingSettingsFormInput,
  });
  const availability = useWatch({ control: form.control, name: "availability" });
  const updateWindows = (updater: (windows: typeof fourWindows) => typeof fourWindows) => {
    const current = form.getValues("availability.weekly_windows.0.windows") ?? [];
    form.setValue("availability.weekly_windows.0.windows", updater(current as typeof fourWindows));
  };
  const addWindow = (_day: WeekdayKey) => {
    const current = form.getValues("availability.weekly_windows.0.windows") ?? [];
    const previousEnd = current.at(-1)?.end_minute_of_day ?? 360;
    if (previousEnd >= 1440) return "No room remains after the last window.";
    updateWindows(
      (windows) =>
        [
          ...windows,
          {
            start_minute_of_day: previousEnd,
            end_minute_of_day: Math.min(previousEnd + 180, 1440),
          },
        ] as typeof fourWindows,
    );
    return null;
  };

  return (
    <>
      <AvailabilitySection
        availability={availability}
        control={form.control}
        mode="global-edit"
        onAddAvailabilityWindow={addWindow}
        onRemoveAvailabilityWindow={(_day, index) =>
          updateWindows(
            (windows) =>
              windows.filter((_, itemIndex) => itemIndex !== index) as typeof fourWindows,
          )
        }
        onToggleAvailabilityDay={jest.fn()}
        onToggleHardRestDay={jest.fn()}
      />
      {children?.(availability)}
    </>
  );
}

describe("AvailabilitySection", () => {
  it("renders the first and every persisted window without hiding later windows", () => {
    renderNative(<Harness />);

    expect(screen.getByTestId("preferences-availability-window-monday-0")).toBeTruthy();
    expect(screen.getByTestId("preferences-availability-window-monday-1")).toBeTruthy();
    expect(screen.getByTestId("preferences-availability-window-monday-2")).toBeTruthy();
    expect(screen.getByTestId("preferences-availability-window-monday-3")).toBeTruthy();
    expect(screen.getByTestId("preferences-availability-window-monday-3-end").props.value).toBe(
      "00:00",
    );
    expect(screen.getByText(/24:00 \(end of day\)/)).toBeTruthy();
    expect(screen.getByTestId("preferences-availability-window-monday-add").props.disabled).toBe(
      true,
    );
  });

  it("adds an adjacent window and removes an extra window", () => {
    renderNative(<Harness initialWindows={[fourWindows[0]]} />);

    act(() => screen.getByTestId("preferences-availability-window-monday-add").props.onPress());
    expect(screen.getByTestId("preferences-availability-window-monday-1-start").props.value).toBe(
      "08:00",
    );

    act(() =>
      screen.getByTestId("preferences-availability-window-monday-1-remove").props.onPress(),
    );
    expect(screen.queryByTestId("preferences-availability-window-monday-1")).toBeNull();
  });

  it.each([
    ["first", 0],
    ["middle", 1],
    ["last", 2],
  ])("allows removing the %s window", (_position, index) => {
    let observed: AthleteTrainingSettingsFormInput["availability"] | undefined;
    renderNative(
      <Harness initialWindows={fourWindows.slice(0, 3)}>
        {(value) => {
          observed = value;
          return null;
        }}
      </Harness>,
    );

    act(() =>
      screen.getByTestId(`preferences-availability-window-monday-${index}-remove`).props.onPress(),
    );

    expect(observed?.weekly_windows?.[0]?.windows).toHaveLength(2);
  });

  it("explains when no room remains for another window", () => {
    renderNative(
      <Harness initialWindows={[{ start_minute_of_day: 1260, end_minute_of_day: 1440 }]} />,
    );

    act(() => screen.getByTestId("preferences-availability-window-monday-add").props.onPress());

    expect(screen.getByText("No room remains after the last window.")).toBeTruthy();
  });

  it("clears no-room feedback when a window changes", () => {
    renderNative(
      <Harness initialWindows={[{ start_minute_of_day: 1260, end_minute_of_day: 1440 }]} />,
    );

    act(() => screen.getByTestId("preferences-availability-window-monday-add").props.onPress());
    expect(screen.getByText("No room remains after the last window.")).toBeTruthy();

    act(() =>
      screen.getByTestId("preferences-availability-window-monday-0-end").props.onChange("23:00"),
    );
    expect(screen.queryByText("No room remains after the last window.")).toBeNull();
  });

  it("keeps picker values numeric in React Hook Form and maps end midnight to 1440", () => {
    let observed: AthleteTrainingSettingsFormInput["availability"] | undefined;
    renderNative(
      <Harness initialWindows={[fourWindows[0]]}>
        {(value) => {
          observed = value;
          return null;
        }}
      </Harness>,
    );

    act(() => {
      screen.getByTestId("preferences-availability-window-monday-0-end").props.onChange("00:00");
    });

    expect(observed?.weekly_windows?.[0]?.windows?.[0]?.end_minute_of_day).toBe(1440);
  });
});

describe("availability window validation", () => {
  it("allows adjacent windows", () => {
    expect(
      getAvailabilityWindowValidation({
        hard_rest_days: [],
        weekly_windows: [{ day: "monday", windows: fourWindows.slice(0, 2) }],
      }),
    ).toHaveProperty("size", 0);
  });

  it("allows unsorted nonoverlapping windows", () => {
    expect(
      getAvailabilityWindowValidation({
        hard_rest_days: [],
        weekly_windows: [
          {
            day: "monday",
            windows: [
              { start_minute_of_day: 720, end_minute_of_day: 840 },
              { start_minute_of_day: 360, end_minute_of_day: 480 },
              { start_minute_of_day: 480, end_minute_of_day: 600 },
            ],
          },
        ],
      }),
    ).toHaveProperty("size", 0);
  });

  it("rejects unsorted overlapping windows at the original field index", () => {
    expect(
      getAvailabilityWindowValidation({
        hard_rest_days: [],
        weekly_windows: [
          {
            day: "monday",
            windows: [
              { start_minute_of_day: 540, end_minute_of_day: 720 },
              { start_minute_of_day: 360, end_minute_of_day: 600 },
            ],
          },
        ],
      }).has("monday:0"),
    ).toBe(true);
  });

  it.each([
    ["equal start and end", [{ start_minute_of_day: 480, end_minute_of_day: 480 }]],
    [
      "overlapping windows",
      [
        { start_minute_of_day: 360, end_minute_of_day: 600 },
        { start_minute_of_day: 540, end_minute_of_day: 720 },
      ],
    ],
  ])("rejects %s", (_label, windows) => {
    expect(
      getAvailabilityWindowValidation({
        hard_rest_days: [],
        weekly_windows: [{ day: "monday", windows }],
      }).size,
    ).toBeGreaterThan(0);
  });
});
