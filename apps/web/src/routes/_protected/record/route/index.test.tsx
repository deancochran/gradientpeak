import { describe, expect, it } from "vitest";
import { Route } from "./index";

describe("legacy recording route picker", () => {
  it("redirects to the indoor recorder", () => {
    expect(() =>
      (Route as unknown as { options: { beforeLoad: () => void } }).options.beforeLoad(),
    ).toThrow();
  });
});
