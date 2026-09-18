import { trainingPlanPreferencesSchema } from "@repo/core";
import { useState } from "react";
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
function InlineForms() {
  const [assumptions, setAssumptions] = useState<BuilderProfileAssumptionsValues>({});
  const [preferences, setPreferences] = useState(() =>
    trainingPlanPreferencesSchema.parse({
      weekly_session_count: null,
      target_weekly_duration_minutes: null,
      maximum_session_duration_minutes: null,
      preferred_weekdays: [],
      rest_days: [],
      progression_style: null,
      recovery_priority: null,
    }),
  );
  const [numericDrafts, setNumericDrafts] = useState<Record<string, string>>({});
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
        preferences={preferences}
        numericDrafts={numericDrafts}
        onNumericDraftChange={(key, value) =>
          setNumericDrafts((current) => ({ ...current, [key]: value }))
        }
        onNumericDraftError={() => undefined}
        onChange={setPreferences}
      />
    </>
  );
}

describe("builder inline form ownership", () => {
  it("renders assumptions and preferences without a sheet and retains raw input on rerender", async () => {
    const rendered = await renderNative(<InlineForms />);
    await fireEvent.changeText(screen.getByLabelText("Birth year"), "19x");
    await fireEvent.changeText(screen.getByLabelText("Sessions per week"), "1e");
    await rendered.rerender(<InlineForms />);
    expect(screen.getByLabelText("Birth year").props.value).toBe("19x");
    expect(screen.getByLabelText("Sessions per week").props.value).toBe("1e");
    await fireEvent.changeText(screen.getByLabelText("Sessions per week"), "");
    expect(screen.getByLabelText("Sessions per week").props.value).toBe("");
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
