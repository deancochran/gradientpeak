// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GeographicRouteMap,
  normalizeDisplayedPosition,
  normalizeGeographicCoordinates,
} from "./geographic-route-map";

const mocks = vi.hoisted(() => ({
  fitBounds: vi.fn(),
  map: vi.fn(() => ({
    fitBounds: mocks.fitBounds,
    remove: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
  })),
  tileLayer: vi.fn(() => ({ addTo: vi.fn(), on: vi.fn() })),
  polyline: vi.fn(() => ({ addTo: vi.fn() })),
  circleMarker: vi.fn(() => ({ addTo: vi.fn(), remove: vi.fn(), setLatLng: vi.fn() })),
  latLngBounds: vi.fn((points) => points),
}));

vi.mock("leaflet", () => mocks);
vi.mock("leaflet/dist/leaflet.css", () => ({}));

beforeEach(() => {
  mocks.fitBounds.mockReset();
  mocks.map.mockReset();
  mocks.map.mockImplementation(() => ({
    fitBounds: mocks.fitBounds,
    remove: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
  }));
  mocks.tileLayer.mockReset();
  mocks.tileLayer.mockImplementation(() => {
    const layer = { addTo: vi.fn(), on: vi.fn() };
    layer.addTo.mockReturnValue(layer);
    return layer;
  });
  mocks.polyline.mockReset();
  mocks.polyline.mockImplementation(() => ({ addTo: vi.fn() }));
  mocks.circleMarker.mockReset();
  mocks.circleMarker.mockImplementation(() => ({
    addTo: vi.fn(),
    remove: vi.fn(),
    setLatLng: vi.fn(),
  }));
  mocks.latLngBounds.mockReset();
  mocks.latLngBounds.mockImplementation((coordinates) => coordinates);
});

afterEach(() => {
  cleanup();
});

const points = [
  { latitude: 40, longitude: -74 },
  { latitude: 40.001, longitude: -74.001 },
];

describe("GeographicRouteMap", () => {
  it("does not import or request street tiles until the user opts in, and can revoke that choice", async () => {
    render(
      <GeographicRouteMap
        coordinates={points}
        currentPosition={{ latitude: 40.0005, longitude: -74.0005 }}
        currentPositionLabel="Measured playback position."
        fallback={<div>Route schematic</div>}
      />,
    );
    expect(screen.getByText("Route schematic")).toBeTruthy();
    expect(screen.getByText(/viewed area and IP address/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "OpenStreetMap contributors" })).toBeTruthy();
    expect(mocks.tileLayer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Load street map" }));
    await waitFor(() => expect(mocks.tileLayer).toHaveBeenCalledOnce());
    expect(mocks.tileLayer).toHaveBeenCalledWith(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      expect.objectContaining({ referrerPolicy: "origin" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Hide street map" }));
    expect(screen.getByText("Route schematic")).toBeTruthy();
  });

  it("is SSR-safe and keeps invalid geometry from creating a map", () => {
    expect(() =>
      renderToString(
        <GeographicRouteMap coordinates={points} fallback={<div>Route schematic</div>} />,
      ),
    ).not.toThrow();
    render(
      <GeographicRouteMap
        coordinates={[{ latitude: Number.NaN, longitude: 0 }]}
        fallback={<div>Route schematic</div>}
      />,
    );
    expect(screen.queryByRole("button", { name: "Load street map" })).toBeNull();
    expect(mocks.tileLayer).not.toHaveBeenCalled();
  });

  it("returns to the schematic with a visible error when map creation fails", async () => {
    mocks.map.mockImplementationOnce(() => {
      throw new Error("map unavailable");
    });
    render(<GeographicRouteMap coordinates={points} fallback={<div>Route schematic</div>} />);
    fireEvent.click(screen.getByRole("button", { name: "Load street map" }));
    expect(await screen.findByText(/Street map could not load/)).toBeTruthy();
    expect(screen.getByText("Route schematic")).toBeTruthy();
  });

  it("falls back on tile errors and retries with a fresh map", async () => {
    render(<GeographicRouteMap coordinates={points} fallback={<div>Route schematic</div>} />);
    fireEvent.click(screen.getByRole("button", { name: "Load street map" }));
    await waitFor(() => expect(mocks.tileLayer).toHaveBeenCalledOnce());
    const tileLayer = mocks.tileLayer.mock.results[0]?.value;
    const tileError = tileLayer.on.mock.calls.find(
      ([event]: [string]) => event === "tileerror",
    )?.[1];
    tileError();
    expect(await screen.findByText(/Street imagery could not load/)).toBeTruthy();
    expect(screen.getByText("Route schematic")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry street map" }));
    await waitFor(() => expect(mocks.map).toHaveBeenCalledTimes(2));
  });

  it("does not recreate or refit on equivalent route rerenders, but resets on route content changes", async () => {
    const view = render(
      <GeographicRouteMap
        coordinates={points}
        currentPosition={{ latitude: 40, longitude: -74 }}
        fallback={<div>Route schematic</div>}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Load street map" }));
    await waitFor(() => expect(mocks.map).toHaveBeenCalledOnce());
    view.rerender(
      <GeographicRouteMap
        coordinates={points.map((point) => ({ ...point }))}
        currentPosition={{ latitude: 40.0005, longitude: -74.0005 }}
        fallback={<div>Route schematic</div>}
      />,
    );
    expect(mocks.map).toHaveBeenCalledOnce();
    expect(mocks.fitBounds).toHaveBeenCalledOnce();
    view.rerender(
      <GeographicRouteMap
        coordinates={[...points, { latitude: 40.002, longitude: -74.002 }]}
        fallback={<div>Route schematic</div>}
      />,
    );
    await waitFor(() => expect(mocks.map).toHaveBeenCalledTimes(2));
  });

  it("unwraps an antimeridian route and clamps poles instead of dropping valid points", () => {
    const normalized = normalizeGeographicCoordinates([
      { latitude: 90, longitude: 179.9 },
      { latitude: 89, longitude: -179.9 },
    ]);
    expect(normalized.coordinates).toHaveLength(2);
    expect(normalized.clampedPole).toBe(true);
    expect(normalized.coordinates[1]?.longitude).toBeGreaterThan(180);
    expect(
      normalizeDisplayedPosition({ latitude: 89, longitude: -179.95 }, normalized.coordinates),
    ).toMatchObject({ longitude: expect.any(Number) });
    expect(
      normalizeDisplayedPosition({ latitude: 89, longitude: -179.95 }, normalized.coordinates)
        ?.longitude,
    ).toBeGreaterThan(180);
  });
});
