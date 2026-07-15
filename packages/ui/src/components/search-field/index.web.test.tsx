import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { FormEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchField } from "./index.web";

afterEach(cleanup);

describe("SearchField web", () => {
  it("prevents native form submission and invokes onSubmit once when handling Enter", () => {
    const onSubmit = vi.fn();
    const onValueChange = vi.fn();
    const onNativeSubmit = vi.fn((event: FormEvent) => event.preventDefault());
    render(
      <form data-testid="search-form" onSubmit={onNativeSubmit}>
        <SearchField
          accessibilityLabel="Search plans"
          maxLength={80}
          name="planSearch"
          onSubmit={onSubmit}
          onValueChange={onValueChange}
          placeholder="Search today's plans"
          testId="plan-search"
          value="tempo"
        />
      </form>,
    );

    const input = screen.getByRole("searchbox", { name: "Search plans" });
    expect(input).toHaveAttribute("type", "search");
    expect(input).toHaveAttribute("name", "planSearch");
    expect(input).toHaveAttribute("maxlength", "80");
    expect(input).toHaveAttribute("data-testid", "plan-search");

    fireEvent.change(input, { target: { value: "recovery" } });
    const shouldPerformDefault = fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(screen.getByTestId("plan-search-clear"));

    expect(onValueChange).toHaveBeenNthCalledWith(1, "recovery");
    expect(onValueChange).toHaveBeenNthCalledWith(2, "");
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(shouldPerformDefault).toBe(false);
    expect(onNativeSubmit).not.toHaveBeenCalled();
  });

  it("allows its enclosing form to submit when no onSubmit callback is supplied", () => {
    const onNativeSubmit = vi.fn((event: FormEvent) => event.preventDefault());
    render(
      <form data-testid="search-form" onSubmit={onNativeSubmit}>
        <SearchField
          accessibilityLabel="Search plans"
          onValueChange={vi.fn()}
          placeholder="Search plans"
          value="tempo"
        />
        <button type="submit">Submit search</button>
      </form>,
    );

    expect(fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Enter" })).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Submit search" }));
    expect(onNativeSubmit).toHaveBeenCalledOnce();
  });

  it("supports an explicit clear selector while retaining the testId-derived default", () => {
    const { rerender } = render(
      <SearchField
        accessibilityLabel="Search plans"
        clearTestId="legacy-search-clear"
        onValueChange={vi.fn()}
        placeholder="Search plans"
        testId="plan-search"
        value="tempo"
      />,
    );

    expect(screen.getByTestId("legacy-search-clear")).toBeInTheDocument();
    rerender(
      <SearchField
        accessibilityLabel="Search plans"
        onValueChange={vi.fn()}
        placeholder="Search plans"
        testId="plan-search"
        value="tempo"
      />,
    );
    expect(screen.getByTestId("plan-search-clear")).toBeInTheDocument();
  });

  it("announces loading and disables editing and clearing", () => {
    const onValueChange = vi.fn();
    render(
      <SearchField
        accessibilityLabel="Search routes"
        disabled
        loading
        loadingLabel="Updating routes"
        onValueChange={onValueChange}
        placeholder="Search routes"
        testId="route-search"
        value="hill"
      />,
    );

    expect(screen.getByRole("status", { name: "Updating routes" })).toBeTruthy();
    expect(screen.getByRole("searchbox", { name: "Search routes" })).toBeDisabled();
    expect(screen.getByTestId("route-search-clear")).toBeDisabled();
    fireEvent.click(screen.getByTestId("route-search-clear"));
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
