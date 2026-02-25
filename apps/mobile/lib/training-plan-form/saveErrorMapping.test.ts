import { describe, expect, it } from "vitest";
import {
  mapTrainingPlanSaveError,
  mapTrainingPlanSaveErrorMessage,
} from "./saveErrorMapping";

describe("mapTrainingPlanSaveErrorMessage", () => {
  it("maps typed stale commit error causes", () => {
    const mapped = mapTrainingPlanSaveErrorMessage({
      data: { cause: { code: "TRAINING_PLAN_COMMIT_STALE_PREVIEW" } },
    });

    expect(mapped).toContain("Preview is out of date");
  });

  it("returns refresh action for typed stale commit errors", () => {
    const mapped = mapTrainingPlanSaveError({
      data: { cause: { code: "TRAINING_PLAN_COMMIT_STALE_PREVIEW" } },
    });

    expect(mapped.action).toBe("refresh_preview");
  });

  it("maps typed conflict commit error causes", () => {
    const mapped = mapTrainingPlanSaveErrorMessage({
      data: { cause: { code: "TRAINING_PLAN_COMMIT_CONFLICT" } },
    });

    expect(mapped).toContain("blocking conflicts");
  });

  it("maps stale preview commit errors to refresh guidance", () => {
    const mapped = mapTrainingPlanSaveErrorMessage(
      "Creation preview is stale or invalid. Refresh previewCreationConfig and retry createFromCreationConfig.",
    );

    expect(mapped).toContain("Preview is out of date");
  });

  it("maps unresolved blocking conflict errors to review guidance", () => {
    const mapped = mapTrainingPlanSaveErrorMessage(
      "Creation blocked by unresolved conflicts. Resolve blocking conflicts or submit an explicit override_policy for objective/risk-budget conflicts.",
    );

    expect(mapped).toContain("blocking conflicts");
  });

  it("keeps unknown errors unchanged", () => {
    const raw = "Unexpected server error";
    expect(mapTrainingPlanSaveErrorMessage(raw)).toBe(raw);
  });

  it("uses fallback message for non-error inputs", () => {
    expect(mapTrainingPlanSaveErrorMessage(null)).toContain(
      "Failed to save training plan",
    );
  });
});
