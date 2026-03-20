import { describe, expect, it, vi } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "./index.web";

describe("Resizable web", () => {
  it("renders panels and a resize handle", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserver {
        disconnect() {}
        observe() {}
        unobserve() {}
      },
    );

    renderWeb(
      <div className="h-40 w-40">
        <ResizablePanelGroup>
          <ResizablePanel defaultSize={50}>Summary</ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={50}>Details</ResizablePanel>
        </ResizablePanelGroup>
      </div>,
    );

    expect(screen.getByText("Summary")).toBeInTheDocument();
    expect(screen.getByText("Details")).toBeInTheDocument();
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });
});
