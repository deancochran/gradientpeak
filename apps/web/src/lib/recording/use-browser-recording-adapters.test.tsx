// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { useBrowserRecordingAdapters } from "./use-browser-recording-adapters";

const secureContextDescriptor = Object.getOwnPropertyDescriptor(window, "isSecureContext");
const bluetoothDescriptor = Object.getOwnPropertyDescriptor(navigator, "bluetooth");

afterEach(() => {
  if (secureContextDescriptor) {
    Object.defineProperty(window, "isSecureContext", secureContextDescriptor);
  } else {
    Reflect.deleteProperty(window, "isSecureContext");
  }
  if (bluetoothDescriptor) {
    Object.defineProperty(navigator, "bluetooth", bluetoothDescriptor);
  } else {
    Reflect.deleteProperty(navigator, "bluetooth");
  }
});

function CapabilityProbe() {
  const browserBle = useBrowserRecordingAdapters().find((adapter) => adapter.id === "browser-ble");
  return <span>{browserBle?.status ?? "missing"}</span>;
}

describe("useBrowserRecordingAdapters", () => {
  it("keeps server and initial client capability output deterministic before browser detection", async () => {
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    Object.defineProperty(navigator, "bluetooth", { configurable: true, value: {} });

    expect(renderToString(<CapabilityProbe />)).toContain("unavailable");
    render(<CapabilityProbe />);
    await waitFor(() => expect(screen.getByText("experimental")).toBeTruthy());
  });
});
