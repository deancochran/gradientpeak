// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RecordLayout } from "./record";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
  }),
  Outlet: () => <div>Recorder route content</div>,
}));

afterEach(cleanup);

describe("RecordLayout", () => {
  it("leaves recording recovery and navigation enforcement to the protected shell", () => {
    render(<RecordLayout />);

    expect(screen.getByText("Recorder route content")).toBeTruthy();
  });
});
