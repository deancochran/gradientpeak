// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseOptionalNonnegativeNumber,
  RouteLibraryControls,
  type RouteLibraryFilters,
} from "./route-library-controls";

const filters: RouteLibraryFilters = {
  search: "",
  ownerScope: "own",
  sort: "newest",
  minDistanceKm: "",
  maxDistanceKm: "",
  minAscentM: "",
  maxAscentM: "",
};

afterEach(cleanup);

describe("RouteLibraryControls", () => {
  it("emits accessible search, scope, sort, and distance changes", () => {
    const onChange = vi.fn();
    render(<RouteLibraryControls filters={filters} onChange={onChange} onClear={vi.fn()} />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search routes" }), {
      target: { value: "ridge" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Sort routes" }), {
      target: { value: "distance_desc" },
    });

    expect(onChange).toHaveBeenNthCalledWith(1, { ...filters, search: "ridge" });
    expect(onChange).toHaveBeenNthCalledWith(2, { ...filters, sort: "distance_desc" });
  });

  it("normalizes invalid numeric URL filters to an empty value", () => {
    expect(parseOptionalNonnegativeNumber(-1)).toBe("");
    expect(parseOptionalNonnegativeNumber("nope")).toBe("");
    expect(parseOptionalNonnegativeNumber("12.5")).toBe("12.5");
  });

  it("keeps malformed drafts visible and blocks applying them", () => {
    const onChange = vi.fn();
    render(<RouteLibraryControls filters={filters} onChange={onChange} onClear={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Minimum distance (km)"), {
      target: { value: "not-a-number" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));

    expect((screen.getByLabelText("Minimum distance (km)") as HTMLInputElement).value).toBe(
      "not-a-number",
    );
    expect(screen.getByRole("alert").textContent).toContain("Minimum distance");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("applies a corrected range once and clears optional numeric drafts", () => {
    const onChange = vi.fn();
    const onClear = vi.fn();
    render(<RouteLibraryControls filters={filters} onChange={onChange} onClear={onClear} />);

    fireEvent.change(screen.getByLabelText("Minimum distance (km)"), {
      target: { value: "20" },
    });
    fireEvent.change(screen.getByLabelText("Maximum distance (km)"), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("cannot exceed");

    fireEvent.change(screen.getByLabelText("Maximum distance (km)"), {
      target: { value: "30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ ...filters, minDistanceKm: "20", maxDistanceKm: "30" });

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClear).toHaveBeenCalledOnce();
    expect((screen.getByLabelText("Minimum distance (km)") as HTMLInputElement).value).toBe("");
  });

  it("retains exact kilometer draft precision when applying filters", () => {
    const onChange = vi.fn();
    render(<RouteLibraryControls filters={filters} onChange={onChange} onClear={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Minimum distance (km)"), {
      target: { value: "21.15" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));

    expect(onChange).toHaveBeenCalledWith({ ...filters, minDistanceKm: "21.15" });
  });

  it("uses practical distance and ascent adjustment controls", () => {
    const onChange = vi.fn();
    render(
      <RouteLibraryControls
        filters={{ ...filters, minAscentM: "100", minDistanceKm: "21.15" }}
        onChange={onChange}
        onClear={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Increase Minimum distance (km)" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase Minimum ascent (m)" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));

    expect(onChange).toHaveBeenCalledWith({
      ...filters,
      minAscentM: "110",
      minDistanceKm: "21.2",
    });
  });
});
