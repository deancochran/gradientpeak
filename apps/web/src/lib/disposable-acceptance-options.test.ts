import { expect, it } from "vitest";
import { acceptanceOptions, acceptanceOrigin } from "../../scripts/disposable-acceptance-options";

it("keeps explicit browser runs isolated and supports native path or explicit native grep mode", () => {
  expect(acceptanceOptions(["e2e/specs/smoke.spec.ts", "--grep", "recovery"]).native).toBe(false);
  expect(acceptanceOptions(["e2e/native/current-candidate.spec.ts"]).native).toBe(true);
  expect(acceptanceOptions(["--native", "--grep", "current Android candidate"])).toEqual({
    native: true,
    args: ["--grep", "current Android candidate"],
  });
  expect(acceptanceOptions(["--grep", "current Android candidate"]).native).toBe(false);
});

it("accepts only explicit loopback origins with valid ports and never supplies a fallback", () => {
  expect(acceptanceOrigin("http://127.0.0.1:49152")).toBe("http://127.0.0.1:49152");
  for (const value of [
    undefined,
    "",
    "https://example.com",
    "http://localhost:3100",
    "http://127.0.0.1:0",
    "http://127.0.0.1:99999",
    "http://127.0.0.1:3100/path",
  ]) {
    expect(() => acceptanceOrigin(value)).toThrow();
  }
});
