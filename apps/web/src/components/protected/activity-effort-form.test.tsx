// @vitest-environment jsdom

import { activityEffortDefinitions } from "@repo/core/athlete-inputs";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ActivityEffortForm,
  getActivityEffortDefaultValues,
  SWIM_THRESHOLD_DURATION_SECONDS,
} from "./activity-effort-form";

afterEach(cleanup);

function renderForm(props: Partial<React.ComponentProps<typeof ActivityEffortForm>> = {}) {
  return render(
    <ActivityEffortForm
      onCancel={() => undefined}
      onSubmit={() => undefined}
      submitLabel="Save effort"
      {...props}
    />,
  );
}

describe("ActivityEffortForm", () => {
  it("uses the canonical default effort definition", () => {
    const definition = activityEffortDefinitions[0];

    expect(getActivityEffortDefaultValues()).toMatchObject({
      activity_category: definition.activityCategory,
      duration_seconds: definition.defaultDurationSeconds,
      effort_type: definition.effortType,
      unit: definition.unit,
      value: definition.defaultValue,
    });
  });

  it("preserves valid non-default run values from incoming values", async () => {
    renderForm({
      values: {
        activity_category: "run",
        duration_seconds: 600,
        effort_type: "speed",
        recorded_at: "2026-07-13T12:00",
        unit: "m/s",
        value: 5.25,
      },
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Duration (seconds)").getAttribute("value")).toBe("600");
      expect(screen.getByLabelText("Speed").getAttribute("value")).toBe("5.25");
    });
  });

  it("preserves valid non-default swim values when incoming values reset", async () => {
    const onSubmit = vi.fn();
    const { rerender } = render(
      <ActivityEffortForm
        onCancel={() => undefined}
        onSubmit={onSubmit}
        submitLabel="Save effort"
        values={{
          activity_category: "run",
          duration_seconds: 600,
          effort_type: "speed",
          recorded_at: "2026-07-13T12:00",
          unit: "m/s",
          value: 5.25,
        }}
      />,
    );

    rerender(
      <ActivityEffortForm
        onCancel={() => undefined}
        onSubmit={onSubmit}
        submitLabel="Save effort"
        values={{
          activity_category: "swim",
          duration_seconds: 180,
          effort_type: "speed",
          recorded_at: "2026-07-14T12:00",
          unit: "m/s",
          value: 1.75,
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Swim" }).getAttribute("aria-pressed")).toBe(
        "true",
      );
      expect(screen.getByLabelText("Duration (seconds)").getAttribute("value")).toBe("180");
      expect(screen.getByLabelText("Swim pace").getAttribute("value")).toBe("0:57");
    });
  });

  it("applies canonical defaults when the user changes semantic definition", async () => {
    renderForm();

    expect(screen.getByRole("button", { name: "Power" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("W")).toBeTruthy();
    expect(screen.queryByLabelText("Unit")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Power" })).toBeNull();
      expect(screen.getByRole("button", { name: "Speed" }).getAttribute("aria-pressed")).toBe(
        "true",
      );
      expect(screen.getByLabelText("Duration (seconds)").getAttribute("value")).toBe("1200");
      expect(screen.getByLabelText("Speed").getAttribute("value")).toBe("4");
      expect(screen.getByText("m/s")).toBeTruthy();
    });
  });

  it("applies swim defaults when the user changes category but keeps the same effort type", async () => {
    renderForm({
      values: {
        activity_category: "run",
        duration_seconds: 600,
        effort_type: "speed",
        recorded_at: "2026-07-13T12:00",
        unit: "m/s",
        value: 5.25,
      },
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Speed").getAttribute("value")).toBe("5.25");
    });
    fireEvent.click(screen.getByRole("button", { name: "Swim" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Duration (seconds)").getAttribute("value")).toBe("300");
      expect(screen.getByLabelText("Swim pace").getAttribute("value")).toBe("1:23");
    });
  });

  it("offers a threshold-relevant 20-minute swim option and submits /100m pace as speed", async () => {
    const onSubmit = vi.fn();
    renderForm({
      onSubmit,
      values: {
        activity_category: "swim",
        duration_seconds: 300,
        effort_type: "speed",
        recorded_at: "2026-07-14T12:00",
        unit: "m/s",
        value: 1.2,
      },
    });

    expect(screen.getByText(/20 minutes is threshold-relevant/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "20 min" }));
    fireEvent.change(screen.getByLabelText("Swim pace"), { target: { value: "1:40" } });
    fireEvent.click(screen.getByRole("button", { name: "Save effort" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          activity_category: "swim",
          duration_seconds: SWIM_THRESHOLD_DURATION_SECONDS,
          effort_type: "speed",
          unit: "m/s",
          value: 1,
        }),
      );
    });
  });

  it("does not reapply defaults when the user reselects the current effort type", async () => {
    renderForm({
      values: {
        activity_category: "run",
        duration_seconds: 600,
        effort_type: "speed",
        recorded_at: "2026-07-13T12:00",
        unit: "m/s",
        value: 5.25,
      },
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Speed").getAttribute("value")).toBe("5.25");
    });
    fireEvent.click(screen.getByRole("button", { name: "Speed" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Duration (seconds)").getAttribute("value")).toBe("600");
      expect(screen.getByLabelText("Speed").getAttribute("value")).toBe("5.25");
    });
  });

  it("normalizes an unsupported category/type pair before submission", async () => {
    const onSubmit = vi.fn();
    renderForm({
      onSubmit,
      values: {
        activity_category: "run",
        duration_seconds: 60,
        effort_type: "power",
        recorded_at: "2026-07-13T12:00",
        unit: "ignored",
        value: 300,
      },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Speed" }).getAttribute("aria-pressed")).toBe(
        "true",
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Save effort" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          activity_category: "run",
          duration_seconds: 1200,
          effort_type: "speed",
          unit: "m/s",
          value: 4,
        }),
      );
    });
  });
});
