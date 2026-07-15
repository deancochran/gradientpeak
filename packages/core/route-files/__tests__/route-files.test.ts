import { describe, expect, it } from "vitest";
import {
  deriveRouteNameFromFileName,
  getRouteFileExtension,
  MAX_ROUTE_FILE_SIZE_BYTES,
  MAX_ROUTE_POINT_COUNT,
  portableRouteFileMetadataSchema,
  ROUTE_FILE_EXTENSIONS,
  ROUTE_FILE_MIME_TYPES,
  ROUTE_FILE_NATIVE_MIME_TYPES,
  ROUTE_FILE_WEB_ACCEPT,
  routeUploadFormSchema,
} from "..";

const validFile = { name: "ridge-loop.gpx", size: 1_024, type: "application/gpx+xml" };

describe("route file contract", () => {
  it("publishes canonical formats, MIME types, and limits", () => {
    expect(ROUTE_FILE_EXTENSIONS).toEqual(["gpx", "tcx", "xml"]);
    expect(ROUTE_FILE_MIME_TYPES).toEqual({
      gpx: "application/gpx+xml",
      tcx: "application/vnd.garmin.tcx+xml",
      xml: "application/xml",
    });
    expect(MAX_ROUTE_FILE_SIZE_BYTES).toBe(10_485_760);
    expect(MAX_ROUTE_POINT_COUNT).toBe(100_000);
    expect(ROUTE_FILE_WEB_ACCEPT).toContain(".xml");
    expect(ROUTE_FILE_NATIVE_MIME_TYPES).toContain("application/vnd.garmin.tcx+xml");
  });

  it("recognizes only supported terminal extensions and derives an automatic name", () => {
    expect(getRouteFileExtension("Race.Final.TCX")).toBe("tcx");
    expect(getRouteFileExtension("route.gpx.zip")).toBeNull();
    expect(deriveRouteNameFromFileName(" Race.Final.XML ")).toBe("Race.Final");
  });

  it("preserves portable handles while rejecting unsafe metadata", () => {
    const webFile = { kind: "web-file" };
    const nativeAsset = { uri: "file:///ridge-loop.gpx" };
    const parsed = portableRouteFileMetadataSchema.parse({
      ...validFile,
      name: "  ridge-loop.gpx  ",
      webFile,
      nativeAsset,
    });

    expect(parsed).toMatchObject({ name: "ridge-loop.gpx", webFile, nativeAsset });
    expect(parsed.webFile).toBe(webFile);
    expect(parsed.nativeAsset).toBe(nativeAsset);
  });

  it.each([
    { ...validFile, name: "folder/route.gpx" },
    { ...validFile, name: "folder\\route.gpx" },
    { ...validFile, name: "route\0.gpx" },
    { ...validFile, name: "route.fit" },
    { ...validFile, size: 0 },
    { ...validFile, size: MAX_ROUTE_FILE_SIZE_BYTES + 1 },
  ])("rejects unsafe route file metadata", (file) => {
    expect(portableRouteFileMetadataSchema.safeParse(file).success).toBe(false);
  });

  it("requires exactly one file and normalizes form text", () => {
    expect(
      routeUploadFormSchema.parse({
        files: [validFile],
        name: "  Ridge loop  ",
        description: "   ",
      }),
    ).toMatchObject({ name: "Ridge loop", description: null });
    expect(
      routeUploadFormSchema.safeParse({ files: [], name: "Ridge loop", description: null }).success,
    ).toBe(false);
    expect(
      routeUploadFormSchema.safeParse({
        files: [validFile, validFile],
        name: "Ridge loop",
        description: null,
      }).success,
    ).toBe(false);
  });

  it("enforces route name and description limits", () => {
    expect(
      routeUploadFormSchema.safeParse({ files: [validFile], name: "a".repeat(101) }).success,
    ).toBe(false);
    expect(
      routeUploadFormSchema.safeParse({
        files: [validFile],
        name: "Route",
        description: "a".repeat(1_001),
      }).success,
    ).toBe(false);
  });
});
