// @vitest-environment jsdom
import { buildActivityPlanPrintModel } from "@repo/core/activity-plan";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createActivityPlanStructure } from "../../lib/activity-plan-authoring";
import { ActivityPlanPdfActions } from "./activity-plan-pdf-actions";

const mocks = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock("../../lib/activity-plan-export/activity-plan-pdf", () => ({
  downloadActivityPlanPdf: mocks.download,
  openActivityPlanPdfForPrint: vi.fn(),
  shareActivityPlanPdf: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn() } }));
afterEach(cleanup);
it("retains the selected export format after failure and single-flights export preparation", async () => {
  const model = buildActivityPlanPrintModel({
    title: "Pool plan",
    format: "full-page",
    personalizeTargets: false,
    structure: createActivityPlanStructure("swim"),
  });
  if (!model) throw new Error("Missing print-model fixture");
  let reject!: (error: Error) => void;
  mocks.download
    .mockReturnValueOnce(
      new Promise((_done, fail) => {
        reject = fail;
      }),
    )
    .mockResolvedValueOnce(undefined);
  render(<ActivityPlanPdfActions model={model} />);
  const select = screen.getByLabelText("PDF format") as HTMLSelectElement;
  const selected = select.options[1]?.value ?? select.value;
  fireEvent.change(select, { target: { value: selected } });
  const button = screen.getByRole("button", { name: "Download PDF" });
  act(() => {
    fireEvent.click(button);
    fireEvent.click(button);
  });
  expect(mocks.download).toHaveBeenCalledTimes(1);
  expect(select.disabled).toBe(true);
  await act(async () => reject(new Error("Export unavailable")));
  expect(screen.getByRole("alert").textContent).toContain("format is kept");
  expect(select.value).toBe(selected);
  await act(async () => fireEvent.click(button));
  expect(mocks.download.mock.calls[1]?.[0].format).toBe(selected);
});
