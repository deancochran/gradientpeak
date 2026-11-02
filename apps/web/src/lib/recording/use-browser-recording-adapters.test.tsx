// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useBrowserRecordingAdapters } from "./use-browser-recording-adapters";

function CapabilityProbe() {
  return <span>{useBrowserRecordingAdapters()[0]?.label}</span>;
}

describe("useBrowserRecordingAdapters", () => {
  it("always exposes the indoor timer without browser hardware detection", () => {
    render(<CapabilityProbe />);
    expect(screen.getByText("Indoor timer")).toBeTruthy();
  });
});
