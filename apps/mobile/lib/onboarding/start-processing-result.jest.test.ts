import { getStartProcessingStatusMessage } from "./start-processing-result";

describe("getStartProcessingStatusMessage", () => {
  it("distinguishes ongoing processing from immediate review", () => {
    expect(getStartProcessingStatusMessage("processing").title).toBe("Processing started");
    expect(getStartProcessingStatusMessage("review").title).toBe("Ready to review");
  });
});
