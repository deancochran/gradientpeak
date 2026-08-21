import { DOMParser } from "@xmldom/xmldom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ActivityFileParseError,
  DEFAULT_ACTIVITY_FILE_PARSE_MAX_MESSAGES,
  DEFAULT_ACTIVITY_FILE_PARSE_MAX_RECORDS,
  inferActivityFileType,
  parseActivityFile,
} from "./activity-file-parser";

afterEach(() => vi.restoreAllMocks());

describe("activity-file-parser", () => {
  it("normalizes GPX activity records", () => {
    const activity = parseActivityFile({
      data: `<gpx xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"><trk><name>Morning Run</name><type>running</type><trkseg>
        <trkpt lat="40.1" lon="-74.1"><ele>10</ele><time>2026-01-01T10:00:00Z</time><extensions><gpxtpx:hr>150</gpxtpx:hr><power>220</power></extensions></trkpt>
        <trkpt lat="40.2" lon="-74.2"><ele>20</ele><time>2026-01-01T10:10:00Z</time><extensions><gpxtpx:hr>160</gpxtpx:hr><power>240</power></extensions></trkpt>
      </trkseg></trk></gpx>`,
      fileName: "morning.gpx",
    });

    expect(activity.metadata.name).toBe("Morning Run");
    expect(activity.summary.totalTime).toBe(600);
    expect(activity.summary.avgHeartRate).toBe(155);
    expect(activity.summary.avgPower).toBe(230);
    expect(activity.records).toHaveLength(2);
    expect(activity.records.map((record) => record.sessionMessageIndex)).toEqual([0, 0]);
    expect(activity.segments).toEqual([
      {
        sessionMessageIndex: 0,
        role: "activity",
        rawSport: "running",
        startTime: new Date("2026-01-01T10:00:00.000Z"),
        endTime: new Date("2026-01-01T10:10:00.000Z"),
      },
    ]);
  });

  it("normalizes TCX activity records", () => {
    const activity = parseActivityFile({
      data: `<TrainingCenterDatabase><Activities><Activity Sport="Biking"><Id>Ride</Id><Lap><Calories>500</Calories><Track>
        <Trackpoint><Time>2026-01-01T10:00:00Z</Time><Position><LatitudeDegrees>40.1</LatitudeDegrees><LongitudeDegrees>-74.1</LongitudeDegrees></Position><DistanceMeters>0</DistanceMeters><HeartRateBpm><Value>140</Value></HeartRateBpm><Cadence>80</Cadence><Extensions><TPX><Watts>210</Watts></TPX></Extensions></Trackpoint>
        <Trackpoint><Time>2026-01-01T10:30:00Z</Time><Position><LatitudeDegrees>40.2</LatitudeDegrees><LongitudeDegrees>-74.2</LongitudeDegrees></Position><DistanceMeters>12000</DistanceMeters><HeartRateBpm><Value>160</Value></HeartRateBpm><Cadence>90</Cadence><Extensions><TPX><Watts>250</Watts></TPX></Extensions></Trackpoint>
      </Track></Lap></Activity></Activities></TrainingCenterDatabase>`,
      fileName: "ride.tcx",
    });

    expect(activity.metadata.type).toBe("biking");
    expect(activity.summary.totalTime).toBe(1800);
    expect(activity.summary.totalDistance).toBe(12000);
    expect(activity.summary.calories).toBe(500);
    expect(activity.summary.avgCadence).toBe(85);
    expect(activity.segments?.[0]).toMatchObject({
      sessionMessageIndex: 0,
      role: "activity",
      rawSport: "cycling",
    });
  });

  it("sniffs XML activity files by content", () => {
    expect(
      inferActivityFileType(
        "activity.xml",
        `<?xml version="1.0"?><TrainingCenterDatabase></TrainingCenterDatabase>`,
      ),
    ).toBe("tcx");
  });

  it("classifies unsupported formats with a closed parser code", () => {
    expect(() => inferActivityFileType("activity.bin")).toThrow(
      expect.objectContaining({ code: "unsupported_format", name: "ActivityFileParseError" }),
    );
  });

  it("classifies corrupt XML with a closed parser code", () => {
    expect(() => parseActivityFile({ data: "<gpx>", fileName: "activity.gpx" })).toThrow(
      expect.objectContaining({ code: "corrupt_artifact", name: "ActivityFileParseError" }),
    );
    expect(ActivityFileParseError).toBeTypeOf("function");
  });

  it("rejects multiple GPX tracks instead of collapsing distinct activities", () => {
    expect(() =>
      parseActivityFile({
        data: `<gpx><trk><trkseg><trkpt lat="40.1" lon="-74.1"><time>2026-01-01T10:00:00Z</time></trkpt></trkseg></trk><trk><trkseg><trkpt lat="41.1" lon="-75.1"><time>2026-01-02T10:00:00Z</time></trkpt></trkseg></trk></gpx>`,
        fileName: "multiple.gpx",
      }),
    ).toThrow(expect.objectContaining({ code: "corrupt_artifact" }));
  });

  it("rejects multiple TCX activities instead of assigning every record to one session", () => {
    expect(() =>
      parseActivityFile({
        data: `<TrainingCenterDatabase><Activities><Activity Sport="Running"><Id>Run</Id></Activity><Activity Sport="Biking"><Id>Ride</Id></Activity></Activities></TrainingCenterDatabase>`,
        fileName: "multiple.tcx",
      }),
    ).toThrow(expect.objectContaining({ code: "corrupt_artifact" }));
  });

  it("enforces a caller record limit before allocating XML records", () => {
    const parseFromString = vi.spyOn(DOMParser.prototype, "parseFromString");
    let thrown: unknown;
    try {
      parseActivityFile({
        data: `<gpx><trk><trkseg>
          <trkpt lat="40.1" lon="-74.1" />
          <trkpt lat="40.2" lon="-74.2" />
          <trkpt lat="40.3" lon="-74.3" />`,
        fileType: "gpx",
        limits: { maxRecords: 2 },
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      code: "corrupt_artifact",
      cause: expect.objectContaining({ message: "record_limit_exceeded" }),
    });
    expect(parseFromString).not.toHaveBeenCalled();
    parseFromString.mockRestore();
  });

  it.each([
    {
      fileType: "gpx" as const,
      data: `<g:GPX xmlns:g="http://www.topografix.com/GPX/1/1"><g:TRK><g:NAME>Namespaced run</g:NAME><g:TRKSEG>
        <g:TrKpT lat="40.1" lon="-74.1"><g:TIME>2026-01-01T10:00:00Z</g:TIME></g:TrKpT>
      </g:TRKSEG></g:TRK></g:GPX>`,
      name: "GPX",
    },
    {
      fileType: "tcx" as const,
      data: `<t:TrainingCenterDatabase xmlns:t="urn:garmin:tcx"><t:Activities><t:Activity Sport="Running"><t:ID>Namespaced run</t:ID><t:Lap><t:Track>
        <t:tRaCkPoInT><t:TIME>2026-01-01T10:00:00Z</t:TIME></t:tRaCkPoInT>
      </t:Track></t:Lap></t:Activity></t:Activities></t:TrainingCenterDatabase>`,
      name: "TCX",
    },
  ])("normalizes namespace-prefixed mixed-case $name element names", ({ data, fileType }) => {
    const activity = parseActivityFile({ data, fileType, limits: { maxRecords: 1 } });

    expect(activity.records).toHaveLength(1);
    expect(activity.records[0]?.timestamp).toEqual(new Date("2026-01-01T10:00:00.000Z"));
  });

  it.each([
    {
      fileType: "gpx" as const,
      data: `<g:gpx xmlns:g="urn:gpx"><g:trk><g:trkseg>
        <g:TrKpT lat="1" lon="1"/><G:TRKPT lat="2" lon="2"/><other:trkpt xmlns:other="urn:other" lat="3" lon="3"/>
      </g:trkseg></g:trk></g:gpx>`,
      name: "GPX",
    },
    {
      fileType: "tcx" as const,
      data: `<t:TrainingCenterDatabase xmlns:t="urn:tcx"><t:Activities><t:Activity><t:Track>
        <t:TrackPoint/><T:TRACKPOINT/><other:tRaCkPoInT xmlns:other="urn:other"/>
      </t:Track></t:Activity></t:Activities></t:TrainingCenterDatabase>`,
      name: "TCX",
    },
  ])("rejects namespace-prefixed mixed-case $name record overflow before DOM allocation", ({
    data,
    fileType,
  }) => {
    const parseFromString = vi.spyOn(DOMParser.prototype, "parseFromString");
    let thrown: unknown;
    try {
      parseActivityFile({ data, fileType, limits: { maxRecords: 2 } });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      code: "corrupt_artifact",
      cause: expect.objectContaining({ message: "record_limit_exceeded" }),
    });
    expect(parseFromString).not.toHaveBeenCalled();
    parseFromString.mockRestore();
  });

  it("does not count trackpoint-looking text, comments, or CDATA as records", () => {
    const activity = parseActivityFile({
      data: `<gpx><trk>
        <name><![CDATA[<ns:trkpt lat="0" lon="0"/>]]></name>
        <!-- <Trackpoint><trkpt lat="0" lon="0"/></Trackpoint> -->
        <trkseg><trkpt lat="40.1" lon="-74.1"><time>2026-01-01T10:00:00Z</time><extensions>&lt;trkpt /&gt;</extensions></trkpt></trkseg>
      </trk></gpx>`,
      fileType: "gpx",
      limits: { maxRecords: 1 },
    });

    expect(activity.records).toHaveLength(1);
  });

  it("rejects excessive non-record XML nodes and attributes before DOM allocation", () => {
    const parseFromString = vi.spyOn(DOMParser.prototype, "parseFromString");
    let thrown: unknown;
    try {
      parseActivityFile({
        data: `<gpx first="1" second="2"><metadata/><extensions/><trk><trkseg><trkpt lat="1" lon="1"/></trkseg></trk></gpx>`,
        fileType: "gpx",
        limits: { maxMessages: 3, maxRecords: 10 },
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      code: "corrupt_artifact",
      cause: expect.objectContaining({ message: "xml_node_limit_exceeded" }),
    });
    expect(parseFromString).not.toHaveBeenCalled();
    parseFromString.mockRestore();
  });

  it("rejects an oversized single-text-node XML source before DOM allocation", () => {
    const parseFromString = vi.spyOn(DOMParser.prototype, "parseFromString");
    let thrown: unknown;
    try {
      parseActivityFile({
        data: `<gpx>${"x".repeat(20 * 1024)}</gpx>`,
        fileType: "gpx",
        limits: { maxMessages: 1, maxRecords: 1 },
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      code: "corrupt_artifact",
      cause: expect.objectContaining({ message: "xml_size_limit_exceeded" }),
    });
    expect(parseFromString).not.toHaveBeenCalled();
    parseFromString.mockRestore();
  });

  it("rejects DTD entity declarations before they can expand during DOM parsing", () => {
    const parseFromString = vi.spyOn(DOMParser.prototype, "parseFromString");
    let thrown: unknown;
    try {
      parseActivityFile({
        data: `<!DOCTYPE gpx [<!ENTITY point "<trkpt lat='1' lon='1'/>">]><gpx><trk><trkseg>&point;</trkseg></trk></gpx>`,
        fileType: "gpx",
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      code: "corrupt_artifact",
      cause: expect.objectContaining({ message: "xml_declaration_not_supported" }),
    });
    expect(parseFromString).not.toHaveBeenCalled();
    parseFromString.mockRestore();
  });

  it("does not let callers raise the parser hard ceilings", () => {
    expect(() =>
      parseActivityFile({
        data: "<gpx />",
        fileType: "gpx",
        limits: { maxRecords: DEFAULT_ACTIVITY_FILE_PARSE_MAX_RECORDS + 1 },
      }),
    ).toThrow(RangeError);
    expect(() =>
      parseActivityFile({
        data: "<gpx />",
        fileType: "gpx",
        limits: { maxMessages: DEFAULT_ACTIVITY_FILE_PARSE_MAX_MESSAGES + 1 },
      }),
    ).toThrow(RangeError);
  });
});
