import { trainingPlanPreferencesSchema } from "@repo/core";
import { useState } from "react";
import { Text } from "react-native";
import { fireEvent, renderNative, screen } from "../../../test/render-native";
import {
  BuilderActivityEffortsForm,
  BuilderAthleteContextForm,
  BuilderPlanPreferencesContextForm,
  BuilderPlanPreferencesForm,
  BuilderProfileAssumptionsForm,
  type BuilderProfileAssumptionsValues,
  BuilderProfileMetricsForm,
} from "./BuilderAssumptionsPreferencesForms";

// These reusable inline forms intentionally have no sheet provider dependency.
function InlineForms({
  disabled = false,
  weeklyMinutes = null,
}: {
  disabled?: boolean;
  weeklyMinutes?: number | null;
}) {
  const [assumptions, setAssumptions] = useState<BuilderProfileAssumptionsValues>({});
  const [preferences, setPreferences] = useState(() =>
    trainingPlanPreferencesSchema.parse({
      weekly_session_count: null,
      target_weekly_duration_minutes: weeklyMinutes,
      maximum_session_duration_minutes: null,
      preferred_weekdays: [],
      rest_days: [],
      progression_style: null,
      recovery_priority: null,
    }),
  );
  const [numericDrafts, setNumericDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  return (
    <>
      <BuilderProfileAssumptionsForm
        values={assumptions}
        onChange={setAssumptions}
        onClose={() => undefined}
        showDone={false}
      />
      <BuilderAthleteContextForm
        fields={[]}
        onAddField={() => undefined}
        onChangeField={() => undefined}
        onRemoveField={() => undefined}
      />
      <BuilderPlanPreferencesContextForm
        disabled={disabled}
        preferences={preferences}
        numericDrafts={numericDrafts}
        onNumericDraftChange={(key, value) =>
          setNumericDrafts((current) => ({ ...current, [key]: value }))
        }
        onNumericDraftError={(key, message) =>
          setErrors((current) =>
            current[key] === message ? current : { ...current, [key]: message },
          )
        }
        onChange={setPreferences}
      />
      <Text testID="preferences-values">{JSON.stringify(preferences)}</Text>
      <Text testID="preferences-errors">{JSON.stringify(errors)}</Text>
    </>
  );
}

describe("builder inline form ownership", () => {
  it("edits a 150-minute budget as 2h30, rejects zero without clearing, and clears only explicitly", async () => {
    await renderNative(<InlineForms weeklyMinutes={150} />);
    expect(screen.queryByLabelText("Weekly duration hours")).toBeNull();
    await fireEvent.press(screen.getByLabelText("Weekly duration"));
    expect(screen.getByLabelText("Weekly duration hours").props.selectedValue).toBe(2);
    expect(screen.getByLabelText("Weekly duration minutes").props.selectedValue).toBe(30);
    expect(screen.queryByLabelText("Weekly duration seconds")).toBeNull();
    await fireEvent(screen.getByLabelText("Weekly duration hours"), "valueChange", 0);
    await fireEvent(screen.getByLabelText("Weekly duration minutes"), "valueChange", 0);
    expect(screen.getByTestId("preferences-errors").props.children).toContain(
      "Enter whole hours and minutes",
    );
    expect(screen.getByTestId("preferences-values").props.children).toContain(
      '"target_weekly_duration_minutes":30',
    );
    await fireEvent(screen.getByLabelText("Weekly duration hours"), "valueChange", 2);
    await fireEvent(screen.getByLabelText("Weekly duration minutes"), "valueChange", 45);
    expect(screen.getByTestId("preferences-values").props.children).toContain(
      '"target_weekly_duration_minutes":165',
    );
    await fireEvent.press(screen.getByLabelText("Clear Weekly duration"));
    expect(screen.getByTestId("preferences-values").props.children).toContain(
      '"target_weekly_duration_minutes":null',
    );
    // Optional duration wheels rest at zero without publishing a value until
    // the author changes a segment or explicitly clears the field.
    expect(screen.getByLabelText("Weekly duration hours").props.selectedValue).toBe(0);
  });
  it("disables direct preference controls during submission and rejects their queued events", async () => {
    const view = await renderNative(<InlineForms />);
    await fireEvent.press(screen.getByText("Add advanced preferences"));
    const queued = screen.getByTestId("Progression style-picker").props.onValueChange;
    await view.rerender(<InlineForms disabled />);
    expect(screen.getByTestId("Progression style-picker").props.enabled).toBe(false);
    queued("ambitious");
    await view.rerender(<InlineForms />);
    expect(screen.getByLabelText("Progression style: Choose progression")).toBeTruthy();
  });
  it("keeps preference enums unset until selected and supports explicit clearing", async () => {
    await renderNative(<InlineForms />);
    await fireEvent.press(screen.getByText("Add advanced preferences"));
    expect(screen.queryByLabelText("Clear Progression style")).toBeNull();
    await fireEvent(screen.getByTestId("Progression style-picker"), "valueChange", "ambitious");
    expect(screen.queryByLabelText("Close Progression style")).toBeNull();
    expect(screen.getByLabelText("Progression style: Ambitious")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Clear Progression style"));
    expect(screen.getByLabelText("Progression style: Choose progression")).toBeTruthy();
  });
  it("renders assumptions and preferences without a sheet and retains dial selections on rerender", async () => {
    const rendered = await renderNative(<InlineForms />);
    await fireEvent.press(screen.getByLabelText("Sessions per week"));
    await fireEvent(screen.getByLabelText("Sessions per week Value"), "valueChange", 4);
    await rendered.rerender(<InlineForms />);
    expect(screen.getByLabelText("Sessions per week").props.accessibilityValue).toEqual({
      text: "4",
    });
  });

  it("keeps the remaining standalone local forms independent of sheet context", async () => {
    await renderNative(
      <>
        <BuilderProfileMetricsForm values={{}} onChange={jest.fn()} onClose={jest.fn()} />
        <BuilderActivityEffortsForm values={{}} onChange={jest.fn()} onClose={jest.fn()} />
        <BuilderPlanPreferencesForm values={{}} onChange={jest.fn()} onClose={jest.fn()} />
      </>,
    );
    expect(screen.getAllByText("Done")).toHaveLength(3);
  });
});
