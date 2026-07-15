import { fromStepEditorTargets, toStepEditorTargets } from "./StepEditorDialog";

describe("StepEditorDialog speed units", () => {
  it("preserves the persisted V2 km/h contract while editing", () => {
    expect(toStepEditorTargets([{ type: "speed", intensity: 18 }])).toEqual([
      { type: "speed", intensity: 18 },
    ]);
    expect(fromStepEditorTargets([{ type: "speed", intensity: 18 }])).toEqual([
      { type: "speed", intensity: 18 },
    ]);
  });

  it("does not convert non-speed targets", () => {
    expect(fromStepEditorTargets([{ type: "cadence", intensity: 90 }])).toEqual([
      { type: "cadence", intensity: 90 },
    ]);
  });
});
