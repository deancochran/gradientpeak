import { fireEvent } from "@testing-library/react";
import { MapPin } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { renderWeb, screen } from "../../test/render-web";
import { ResourceCardHeader, ResourceCardShell, ResourceMetricsRow } from "./index.web";

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

    const open = screen.getByRole("button", { name: "Open route Ridge loop" });
    expect(open).toHaveClass("focus-visible:ring-2");
    fireEvent.click(open);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("renders unavailable values supplied by the app presentation model", () => {
    renderWeb(<ResourceMetricsRow metrics={[{ label: "Distance", value: "—" }]} />);

    expect(screen.getByText("Distance")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("keeps all metrics in compact density unless the app asks for a limit", () => {
    renderWeb(
      <ResourceMetricsRow
        compact
        metrics={[
          { label: "Distance", value: "10 km" },
          { label: "Duration", value: "30m" },
          { label: "Load", value: "72" },
          { label: "Intensity", value: "0.80" },
        ]}
      />,
    );

    expect(screen.getByText("Intensity")).toBeInTheDocument();
    expect(screen.getByText("0.80")).toBeInTheDocument();
  });

  it("honors web header icon and line-limit values", () => {
    renderWeb(
      <ResourceCardHeader
        description="A description"
        descriptionNumberOfLines={1}
        icon={MapPin}
        title="Ridge loop"
        titleNumberOfLines={3}
      />,
    );

    expect(screen.getAllByText("Ridge loop").at(-1)).toHaveStyle({ WebkitLineClamp: "3" });
    expect(screen.getByText("A description")).toHaveStyle({ WebkitLineClamp: "1" });
    expect(document.querySelector("svg")).toBeInTheDocument();
  });
});
