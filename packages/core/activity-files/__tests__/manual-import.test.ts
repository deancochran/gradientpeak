import { describe, expect, it } from "vitest";
import {
  buildManualActivityImportProvenance,
  deriveActivityNameFromFileName,
  getSupportedActivityFileExtension,
  MAX_ACTIVITY_FILE_SIZE_BYTES,
  manualActivityImportFormSchema,
  portableActivityFileMetadataSchema,
  SUPPORTED_ACTIVITY_FILE_EXTENSIONS,
} from "../manual-import";

const validFile = {
  name: "morning-ride.fit",
  size: 1_024,
  type: "application/octet-stream",
};

const validForm = {
  files: [validFile],
  sport: "bike",
  name: "Morning ride",
  notes: null,
};

describe("manual activity import file contract", () => {
  it("publishes the supported extensions and 50 MiB limit", () => {
    expect(SUPPORTED_ACTIVITY_FILE_EXTENSIONS).toEqual(["fit", "gpx", "tcx"]);
    expect(MAX_ACTIVITY_FILE_SIZE_BYTES).toBe(52_428_800);
  });

  it("recognizes uppercase terminal extensions without accepting earlier or unsupported suffixes", () => {
    expect(getSupportedActivityFileExtension("activity.FIT")).toBe("fit");
    expect(getSupportedActivityFileExtension("activity.gpx.zip")).toBeNull();
    expect(getSupportedActivityFileExtension("activity.csv")).toBeNull();
  });

  it("derives names by removing exactly one supported terminal extension", () => {
    expect(deriveActivityNameFromFileName("race.final.GPX")).toBe("race.final");
    expect(deriveActivityNameFromFileName(".tcx")).toBe("");
    expect(deriveActivityNameFromFileName("race.fit.zip")).toBe("race.fit.zip");
  });

  it("validates and trims portable metadata while preserving platform handles", () => {
    const webFile = { platform: "web" };
    const nativeAsset = { uri: "file:///activity.fit" };
    const parsed = portableActivityFileMetadataSchema.parse({
      ...validFile,
      name: "  morning-ride.fit  ",
      webFile,
      nativeAsset,
    });

    expect(parsed).toMatchObject({ name: "morning-ride.fit", webFile, nativeAsset });
    expect(parsed.webFile).toBe(webFile);
    expect(parsed.nativeAsset).toBe(nativeAsset);
  });

  it.each([
    ["path separator", { ...validFile, name: "folder/activity.fit" }],
    ["backslash", { ...validFile, name: "folder\\activity.fit" }],
    ["null byte", { ...validFile, name: "activity\0.fit" }],
    ["overlong name", { ...validFile, name: `${"a".repeat(252)}.fit` }],
    ["zero size", { ...validFile, size: 0 }],
    ["oversize", { ...validFile, size: MAX_ACTIVITY_FILE_SIZE_BYTES + 1 }],
  ])("rejects unsafe metadata: %s", (_case, input) => {
    expect(portableActivityFileMetadataSchema.safeParse(input).success).toBe(false);
  });
});

describe("manual activity import form contract", () => {
  it("requires exactly one file", () => {
    expect(manualActivityImportFormSchema.safeParse({ ...validForm, files: [] }).success).toBe(
      false,
    );
    expect(
      manualActivityImportFormSchema.safeParse({ ...validForm, files: [validFile, validFile] })
        .success,
    ).toBe(false);
  });

  it("requires a canonical sport", () => {
    expect(
      manualActivityImportFormSchema.safeParse({ ...validForm, sport: "pickleball" }).success,
    ).toBe(false);
  });

  it("trims activity names and enforces their bounds", () => {
    expect(
      manualActivityImportFormSchema.parse({ ...validForm, name: "  Morning ride  " }).name,
    ).toBe("Morning ride");
    expect(manualActivityImportFormSchema.safeParse({ ...validForm, name: "   " }).success).toBe(
      false,
    );
    expect(
      manualActivityImportFormSchema.safeParse({ ...validForm, name: "a".repeat(101) }).success,
    ).toBe(false);
  });

  it("normalizes notes and enforces their maximum length", () => {
    expect(
      manualActivityImportFormSchema.parse({ ...validForm, notes: "  Felt good  " }).notes,
    ).toBe("Felt good");
    expect(manualActivityImportFormSchema.parse({ ...validForm, notes: "   " }).notes).toBeNull();
    expect(
      manualActivityImportFormSchema.safeParse({ ...validForm, notes: "a".repeat(5_001) }).success,
    ).toBe(false);
  });
});

describe("manual activity import provenance", () => {
  it("builds canonical provenance from a safe supported filename", () => {
    expect(buildManualActivityImportProvenance("  Race.Final.TCX  ")).toEqual({
      import_source: "manual_historical",
      import_file_type: "tcx",
      import_original_file_name: "Race.Final.TCX",
    });
  });

  it("refuses unsupported and unsafe filenames", () => {
    expect(() => buildManualActivityImportProvenance("activity.csv")).toThrow(
      "Unsupported activity file extension",
    );
    expect(() => buildManualActivityImportProvenance("folder/activity.fit")).toThrow();
  });
});
