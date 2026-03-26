import { describe, expect, it, vi } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import { Tooltip, TooltipContent, TooltipTrigger } from "./index.web";

describe("Tooltip web", () => {
  it("renders trigger text and open tooltip content", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserver {
        disconnect() {}
        observe() {}
        unobserve() {}
      },
    );

    renderWeb(
      <Tooltip open>
        <TooltipTrigger>Why this matters</TooltipTrigger>
        <TooltipContent>Workout stress updates after sync.</TooltipContent>
      </Tooltip>,
    );

    expect(await screen.findByRole("button", { name: "Why this matters" })).toBeInTheDocument();
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Workout stress updates after sync.",
    );
  });
});
