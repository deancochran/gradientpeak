import { shouldUseAccessibleBuilderLayout } from "../responsiveLayout";

describe("training plan builder responsive layout", () => {
  it("keeps the compact cockpit at a representative default viewport", () => {
    expect(shouldUseAccessibleBuilderLayout({ fontScale: 1, width: 390 })).toBe(false);
  });

  it("uses the vertical fallback at a 320 point viewport", () => {
    expect(shouldUseAccessibleBuilderLayout({ fontScale: 1, width: 320 })).toBe(true);
  });

  it("uses the vertical fallback when system text is enlarged", () => {
    expect(shouldUseAccessibleBuilderLayout({ fontScale: 1.2, width: 390 })).toBe(true);
  });
});
