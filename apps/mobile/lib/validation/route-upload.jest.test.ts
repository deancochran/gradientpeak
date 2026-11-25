import { MAX_ROUTE_FILE_SIZE_BYTES } from "@repo/core/route-files";

import { routeUploadFormSchema } from "./route-upload";

const validValues = {
  files: [
    {
      name: "ridge-loop.gpx",
      size: 2048,
      type: "application/gpx+xml",
      uri: "file:///ridge-loop.gpx",
    },
  ],
  name: "Ridge loop",
  description: "",
};

describe("mobile route upload validation", () => {
  it("accepts portable native metadata without route XML", () => {
    const result = routeUploadFormSchema.parse(validValues);

    expect(result.files[0]).toMatchObject({
      name: "ridge-loop.gpx",
      uri: "file:///ridge-loop.gpx",
    });
    expect(result).not.toHaveProperty("fileContent");
  });

  it.each([undefined, null])("accepts native metadata when size is %s", (size) => {
    expect(
      routeUploadFormSchema.safeParse({
        ...validValues,
        files: [{ ...validValues.files[0], size }],
      }).success,
    ).toBe(true);
  });

  it("rejects unsupported extensions and oversized files", () => {
    expect(
      routeUploadFormSchema.safeParse({
        ...validValues,
        files: [{ ...validValues.files[0], name: "ridge-loop.fit" }],
      }).success,
    ).toBe(false);
    expect(
      routeUploadFormSchema.safeParse({
        ...validValues,
        files: [{ ...validValues.files[0], size: MAX_ROUTE_FILE_SIZE_BYTES + 1 }],
      }).success,
    ).toBe(false);
  });
});
