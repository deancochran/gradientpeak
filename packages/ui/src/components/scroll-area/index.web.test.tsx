import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import { ScrollArea } from "./index.web";

describe("ScrollArea web", () => {
  it("renders its scrollable content", () => {
    renderWeb(
      <ScrollArea className="h-20 w-20">
        <div>Weekly metrics</div>
      </ScrollArea>,
    );

    expect(screen.getByText("Weekly metrics")).toBeInTheDocument();
  });
});
