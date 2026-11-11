// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SettingsSectionNavigation } from "./settings-section-navigation";

describe("SettingsSectionNavigation", () => {
  it("links to in-page settings sections without changing the route URL", () => {
    render(<SettingsSectionNavigation />);

    expect(screen.getByRole("navigation", { name: "Settings sections" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Profile" }).getAttribute("href")).toBe("#profile");
    expect(screen.getByRole("link", { name: "Coaching" }).getAttribute("href")).toBe("#coaching");
    expect(screen.getByRole("link", { name: "Preferences" }).getAttribute("href")).toBe(
      "#preferences",
    );
    expect(screen.getByRole("link", { name: "Account" }).getAttribute("href")).toBe("#account");
    expect(screen.getByRole("link", { name: "Security" }).getAttribute("href")).toBe("#security");
  });
});
