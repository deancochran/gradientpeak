import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderWeb, screen } from "../../test/render-web";
import { ProgressBar } from "./index.web";

describe("ProgressBar web", () => {
  afterEach(cleanup);
  it("exposes a labeled semantic value", () => {
    renderWeb(<ProgressBar accessibilityLabel="Preparation progress" value={50} />);
    const progress = screen.getByRole("progressbar", { name: "Preparation progress" });
    expect(progress).toHaveAttribute("aria-valuemin", "0");
    expect(progress).toHaveAttribute("aria-valuemax", "100");
    expect(progress).toHaveAttribute("aria-valuenow", "50");
  });

  it("clamps values to the supported bounds", () => {
    renderWeb(<ProgressBar accessibilityLabel="Preparation progress" value={-10} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });
});
