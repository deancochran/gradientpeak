import { describe, expect, it, vi } from "vitest";

vi.mock("expo-file-system", () => {
  return {
    Directory: class {},
    File: class {},
    Paths: { cache: "file:///cache", document: "file:///document" },
  };
});

import type {
  RecordingStreamEnvelope,
  RecordingStreamJournalAdapter,
} from "./recordingEvidenceJournal";
import { StreamBuffer } from "./StreamBuffer";

function journal(): RecordingStreamJournalAdapter & {
  rows: RecordingStreamEnvelope[];
  fenced: boolean;
} {
  const result = {
    rows: [] as RecordingStreamEnvelope[],
    fenced: false,
    async append(input: readonly Omit<RecordingStreamEnvelope, "sequence" | "order">[]) {
      if (result.fenced) throw new Error("Recording evidence session is not writable");
      for (const row of input) {
        const sequence = result.rows.filter((item) => item.streamKind === row.streamKind).length;
        result.rows.push({ ...row, sequence, order: result.rows.length });
      }
    },
    async recover() {
      return result.rows.map((row) => ({ ...row }));
    },
  };
  return result;
}

describe("StreamBuffer SQLite recovery", () => {
  it("rebuilds the complete replay from committed rows after document/cache loss", async () => {
    const evidence = journal();
    const buffer = new StreamBuffer("file:///lost-document-stream", evidence);
    buffer.add({ metric: "heart_rate", dataType: "float", value: 140, timestamp: 1000 });
    await buffer.flushToFiles();

    const { replay, streamBuffer } = await StreamBuffer.reopenForRecovery(
      "file:///lost-document-stream",
      evidence,
    );
    expect(replay.sensorReadings).toEqual([
      expect.objectContaining({ metric: "heart_rate", value: 140 }),
    ]);
    expect(streamBuffer.getBufferStatus().chunkIndex).toBe(1);
    expect(await streamBuffer.aggregateAllChunks()).toEqual(expect.any(Map));
  });

  it("does not publish an interrupted flush and permits retry", async () => {
    const evidence = journal();
    const buffer = new StreamBuffer("file:///derived-only", {
      ...evidence,
      append: async () => {
        throw new Error("interrupted sqlite transaction");
      },
    });
    buffer.add({ metric: "power", dataType: "float", value: 220, timestamp: 1000 });
    await expect(buffer.flushToFiles()).rejects.toThrow("interrupted");
    expect(evidence.rows).toEqual([]);
  });

  it("fails foreground append after the shared SQLite fence", async () => {
    const evidence = journal();
    const buffer = new StreamBuffer("file:///derived-only", evidence);
    evidence.fenced = true;
    buffer.add({ metric: "cadence", dataType: "float", value: 90, timestamp: 1000 });
    await expect(buffer.flushToFiles()).rejects.toThrow("not writable");
  });
});
