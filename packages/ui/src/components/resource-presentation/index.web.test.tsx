import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWeb, screen } from "../../test/render-web";
import { ResourceCardShell, ResourceMetricsRow } from "./index.web";

describe("Resource presentation web", () => {
  it("keeps secondary actions outside the optional primary resource action", () => {
    const onOpen = vi.fn();
    const onShare = vi.fn();

    renderWeb(
      <ResourceCardShell
        accessibilityLabel="Open route Ridge loop"
        actionRegion={
          <button onClick={onShare} type="button">
            Share route
          </button>
        }
        onPress={onOpen}
        testID="route-card"
      >
        <span>Ridge loop</span>
      </ResourceCardShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Share route" }));
    expect(onShare).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Open route Ridge loop" }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("renders unavailable values supplied by the app presentation model", () => {
    renderWeb(<ResourceMetricsRow metrics={[{ label: "Distance", value: "—" }]} />);

    expect(screen.getByText("Distance")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
