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
});
