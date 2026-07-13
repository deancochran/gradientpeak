import { parseHmsToSeconds as parseCoreHms } from "@repo/core/utils/fitness-inputs";
import { parseHmsToSeconds as parseUiHms } from "@repo/ui/lib/fitness-inputs";

describe("fitness input native exports", () => {
  it("imports the framework-free core implementation through the UI compatibility subpath", () => {
    expect(parseUiHms).toBe(parseCoreHms);
    expect(parseUiHms("1:02:03")).toBe(3723);
  });
});
