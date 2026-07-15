import { MAX_ROUTE_FILE_SIZE_BYTES } from "@repo/core/route-files";

import {
  getRouteFileReadErrorMessage,
  nativeRouteFileMetadataSchema,
  RouteFileReadError,
  readRouteFileText,
} from "./native-route-file";

function responseWith(text: string, ok = true): Response {
  return { ok, text: jest.fn().mockResolvedValue(text) } as unknown as Response;
}

describe("native route file metadata", () => {
  const metadata = {
    name: "ridge-loop.gpx",
    type: "application/gpx+xml",
    uri: "file:///ridge-loop.gpx",
  };

  it.each([undefined, null])("accepts an unknown size represented by %s", (size) => {
    expect(nativeRouteFileMetadataSchema.safeParse({ ...metadata, size }).success).toBe(true);
  });

  it("validates present sizes and the remaining Core metadata contract", () => {
    expect(nativeRouteFileMetadataSchema.safeParse({ ...metadata, size: 1 }).success).toBe(true);
    expect(nativeRouteFileMetadataSchema.safeParse({ ...metadata, size: 0 }).success).toBe(false);
    expect(
      nativeRouteFileMetadataSchema.safeParse({
        ...metadata,
        size: MAX_ROUTE_FILE_SIZE_BYTES + 1,
      }).success,
    ).toBe(false);
    expect(
      nativeRouteFileMetadataSchema.safeParse({ ...metadata, name: "../unsafe.gpx" }).success,
    ).toBe(false);
  });
});

describe("readRouteFileText", () => {
  it("accepts nonempty content at the exact UTF-8 byte limit", async () => {
    const text = "a".repeat(MAX_ROUTE_FILE_SIZE_BYTES);
    const fetchFile = jest.fn().mockResolvedValue(responseWith(text));

    await expect(readRouteFileText("file:///route.gpx", fetchFile)).resolves.toBe(text);
  });

  it("counts multibyte UTF-8 content rather than JavaScript characters", async () => {
    const text = "é".repeat(MAX_ROUTE_FILE_SIZE_BYTES / 2 + 1);
    const fetchFile = jest.fn().mockResolvedValue(responseWith(text));

    await expect(readRouteFileText("file:///route.gpx", fetchFile)).rejects.toMatchObject({
      code: "oversized",
      message: "The selected route file is larger than 10 MB. Choose a smaller file.",
    });
  });

  it("uses safe unreadable errors for rejected and non-OK reads", async () => {
    const providerFailure = new Error("file:///private/provider/path: permission denied");
    await expect(
      readRouteFileText(
        "file:///private/provider/path",
        jest.fn().mockRejectedValue(providerFailure),
      ),
    ).rejects.toEqual(new RouteFileReadError("unreadable"));
    await expect(
      readRouteFileText(
        "file:///private/provider/path",
        jest.fn().mockResolvedValue(responseWith("provider details", false)),
      ),
    ).rejects.toEqual(new RouteFileReadError("unreadable"));
  });

  it("rejects empty content distinctly", async () => {
    await expect(
      readRouteFileText("file:///empty.gpx", jest.fn().mockResolvedValue(responseWith(""))),
    ).rejects.toMatchObject({
      code: "empty",
      message: "The selected route file is empty. Choose another file.",
    });
  });

  it("never exposes unknown provider errors through its message adapter", () => {
    expect(getRouteFileReadErrorMessage(new Error("private provider detail"))).toBe(
      "The selected route file could not be read. Choose it again and retry.",
    );
  });
});
