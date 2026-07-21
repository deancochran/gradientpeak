// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
});
