import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import { Command, CommandInput } from "./index.web";

describe("Command web", () => {
  it("renders the web-only command input with accessible queries", () => {
    renderWeb(
      <Command>
        <CommandInput aria-label="Search commands" />
      </Command>,
    );

    expect(screen.getByRole("combobox")).toHaveAttribute(
      "aria-label",
      "Search commands",
    );
  });
});
