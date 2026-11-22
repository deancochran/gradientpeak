// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RoutePreviewMap } from "./route-preview-map";

afterEach(cleanup);

describe("RoutePreviewMap", () => {
  it("keeps the default preview and unavailable fallback behavior for existing consumers", () => {
    const { rerender } = render(
      <RoutePreviewMap
        coordinates={[
          { latitude: 40, longitude: -74 },
          { latitude: 40.01, longitude: -74.01 },
        ]}
      />,
    );

    expect(screen.getByRole("img", { name: "Route preview" }).getAttribute("class")).toContain(
      "h-60",
    );

    rerender(<RoutePreviewMap coordinates={[]} />);

    expect(screen.getByTestId("route-preview-unavailable").textContent).toBe(
      "No route geometry available for preview.",
    );
  });

  it("uses the compact unavailable fallback only when requested", () => {
    render(<RoutePreviewMap compact coordinates={[]} />);

    const fallback = screen.getByTestId("route-preview-unavailable");
    expect(fallback.textContent).toBe("Route preview unavailable.");
    expect(fallback.className).toContain("h-36");
  });

  const invalidGeometries = [
    [
      { latitude: Number.NaN, longitude: 0 },
      { latitude: 40, longitude: -74 },
    ],
    [
      { latitude: 91, longitude: 0 },
      { latitude: 40, longitude: -74 },
    ],
    [
      { latitude: 40, longitude: Number.POSITIVE_INFINITY },
      { latitude: 40.01, longitude: -74 },
    ],
  ];

  it.each(
    invalidGeometries.map((coordinates) => [coordinates]),
  )("rejects invalid geometry %#", (coordinates) => {
    render(<RoutePreviewMap compact coordinates={coordinates} />);

    expect(screen.getByTestId("route-preview-unavailable")).toBeTruthy();
    expect(screen.queryByRole("img", { name: "Route preview" })).toBeNull();
  });
});
