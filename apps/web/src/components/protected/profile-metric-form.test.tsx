// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileMetricForm } from "./profile-metric-form";

afterEach(cleanup);

describe("ProfileMetricForm", () => {
  it("enters and submits swim CSS as pace per 100 metres", async () => {
    const onSubmit = vi.fn();
    render(
      <ProfileMetricForm
        metricType="css_seconds_per_100m"
        onCancel={() => undefined}
        onSubmit={onSubmit}
        values={{ notes: "", recorded_at: "2026-07-14T12:00", value: 100 }}
      />,
    );

    expect(screen.getByLabelText("Swim CSS").getAttribute("value")).toBe("1:40");
    expect(screen.getByText("/100m")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Swim CSS"), { target: { value: "1:35" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          recorded_at: "2026-07-14T12:00",
          value: 95,
        }),
      );
    });
  });

  it("round trips an imperial weight input through canonical kilograms", async () => {
    const onSubmit = vi.fn();
    render(
      <ProfileMetricForm
        metricType="weight_kg"
        onCancel={() => undefined}
        onSubmit={onSubmit}
        unitSystem="imperial"
        values={{ notes: "", recorded_at: "2026-07-14T12:00", value: 70 }}
      />,
    );

    expect(screen.getByLabelText("Value (lb)").getAttribute("value")).toBe("154.3");
    fireEvent.change(screen.getByLabelText("Value (lb)"), { target: { value: "165.3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledOnce();
      expect(onSubmit.mock.calls[0]?.[0].value).toBeCloseTo(74.98, 2);
    });
  });

  it("round trips imperial swim pace through canonical seconds per 100 metres", async () => {
    const onSubmit = vi.fn();
    render(
      <ProfileMetricForm
        metricType="css_seconds_per_100m"
        onCancel={() => undefined}
        onSubmit={onSubmit}
        unitSystem="imperial"
        values={{ notes: "", recorded_at: "2026-07-14T12:00", value: 100 }}
      />,
    );

    expect(screen.getByLabelText("Swim CSS").getAttribute("value")).toBe("1:31");
    expect(screen.getByText("/100yd")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Swim CSS"), { target: { value: "1:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledOnce();
      expect(onSubmit.mock.calls[0]?.[0].value).toBeCloseTo(98.43, 2);
    });
  });

  it("preserves a precision-sensitive canonical swim pace when imperial display is unchanged", async () => {
    const onSubmit = vi.fn();
    render(
      <ProfileMetricForm
        metricType="css_seconds_per_100m"
        onCancel={() => undefined}
        onSubmit={onSubmit}
        unitSystem="imperial"
        values={{ notes: "", recorded_at: "2026-07-14T12:00", value: 53 }}
      />,
    );

    expect(screen.getByLabelText("Swim CSS").getAttribute("value")).toBe("0:48");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ value: 53 }));
    });
  });

  it.each([
    { canonical: 30, display: "66.1", bound: "min" },
    { canonical: 300, display: "661.4", bound: "max" },
  ])("keeps the imperial weight $bound bound canonical", async ({ canonical, display }) => {
    const onSubmit = vi.fn();
    render(
      <ProfileMetricForm
        metricType="weight_kg"
        onCancel={() => undefined}
        onSubmit={onSubmit}
        unitSystem="imperial"
        values={{ notes: "", recorded_at: "2026-07-14T12:00", value: 70 }}
      />,
    );

    const input = screen.getByLabelText("Value (lb)");
    fireEvent.change(input, { target: { value: display } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ value: canonical }));
    });
  });
});
