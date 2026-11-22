import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Disclosure } from "./index.web";

afterEach(cleanup);

function Example() {
  const [open, setOpen] = useState(false);
  return (
    <Disclosure label="Optional details" open={open} onOpenChange={setOpen}>
      <span>Coaching cue</span>
    </Disclosure>
  );
}

describe("Disclosure web", () => {
  it("announces expanded state and links the revealed content", () => {
    render(<Example />);
    const trigger = screen.getByRole("button", { name: "Optional details" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Coaching cue")).toBeNull();
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(trigger.getAttribute("aria-controls") ?? "")?.textContent).toBe(
      "Coaching cue",
    );
    fireEvent.click(trigger);
    expect(screen.queryByText("Coaching cue")).toBeNull();
  });

  it("does not change disabled controlled state or submit its parent form", () => {
    const change = vi.fn();
    render(
      <Disclosure label="Details" disabled open={false} onOpenChange={change}>
        Hidden
      </Disclosure>,
    );
    const trigger = screen.getByRole("button", { name: "Details" });
    expect(trigger.getAttribute("type")).toBe("button");
    fireEvent.click(trigger);
    expect(change).not.toHaveBeenCalled();
  });
});
