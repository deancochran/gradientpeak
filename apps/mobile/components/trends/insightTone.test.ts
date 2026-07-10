import { describe, expect, it } from "vitest";
import { insightTone } from "./insightTone";

describe("insightTone", () => {
  it("uses semantic tokens for neutral insight surfaces", () => {
    expect(insightTone).toEqual({
      body: "text-muted-foreground",
      container: "border border-border bg-muted",
      title: "text-foreground",
    });
  });
});
