import { describe, expect, it } from "vitest";
import { Route } from "./$routeId";

describe("legacy recording route preview", () => {
  it("redirects to the indoor recorder", () => {
    expect(() =>
      (Route as unknown as { options: { beforeLoad: () => void } }).options.beforeLoad(),
    ).toThrow();
  });
});
