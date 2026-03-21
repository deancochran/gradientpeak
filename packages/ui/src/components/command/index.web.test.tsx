import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import { commandFixtures } from "./fixtures";
import { Command, CommandInput } from "./index.web";

describe("Command web", () => {
  it("renders the web-only command input with accessible queries", () => {
    renderWeb(
      <Command>
        <CommandInput aria-label={commandFixtures.search.accessibilityLabel} />
      </Command>,
    );

    expect(screen.getByRole("combobox")).toHaveAttribute(
      "aria-label",
      commandFixtures.search.accessibilityLabel,
    );
  });
});
