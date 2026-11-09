import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import {
  after as afterAll,
  afterEach,
  before as beforeAll,
  beforeEach,
  describe,
  it,
} from "node:test";
import { fileURLToPath } from "node:url";
import { type Browser, type BrowserContext, chromium, type Page } from "@playwright/test";
import { build } from "vite";

declare global {
  interface Window {
    RecordingStorageHarness: typeof import("./draft-storage") &
      typeof import("./timer-runtime") &
      typeof import("./finalized-artifact") &
      typeof import("../contract-epoch") &
      typeof import("@repo/core/recording/measured-journal") &
      Pick<typeof import("@repo/core"), "portableTimerRecordingDraftSchema"> &
      Pick<typeof import("./submission-queue"), "createQueuedSubmissionJob"> & {
        z: typeof import("zod")["z"];
      };
  }
}
let browser: Browser;
let context: BrowserContext;
let page: Page;
let server: Server;
let origin: string;

beforeAll(
  async () => {
    const modulePath = (path: string) =>
      JSON.stringify(fileURLToPath(new URL(path, import.meta.url)));
    const bundle = await build({
      configFile: false,
      root: fileURLToPath(new URL(".", import.meta.url)),
      logLevel: "silent",
      define: { "process.env.NODE_ENV": '"test"' },
      plugins: [
        {
          name: "isolated-recording-storage-harness",
          resolveId: (id) =>
            id === "recording-storage-harness" || id.endsWith("/recording-storage-harness")
              ? "\0recording-storage-harness"
              : undefined,
          load: (id) =>
            id === "\0recording-storage-harness"
              ? `export * from ${modulePath("./draft-storage.ts")}; export * from ${modulePath("./timer-runtime.ts")}; export * from ${modulePath("./finalized-artifact.ts")}; export * from ${modulePath("../contract-epoch.ts")}; export * from '@repo/core/recording/measured-journal'; export {portableTimerRecordingDraftSchema} from '@repo/core'; export {createQueuedSubmissionJob} from ${modulePath("./submission-queue.ts")}; export {z} from 'zod';`
              : undefined,
        },
      ],
      build: {
        write: false,
        minify: false,
        lib: {
          entry: "recording-storage-harness",
          name: "RecordingStorageHarness",
          formats: ["iife"],
        },
      },
    });
    const outputs = Array.isArray(bundle)
      ? bundle.flatMap((result) => result.output)
      : "output" in bundle
        ? bundle.output
        : [];
    const code = outputs.find((output) => output.type === "chunk")?.code;
    if (!code) throw new Error("Storage harness bundle was not built");
    server = createServer((request, response) => {
      response.setHeader(
        "content-type",
        request.url === "/bundle.js" ? "text/javascript" : "text/html",
      );
      response.end(
        request.url === "/bundle.js" ? code : '<!doctype html><script src="/bundle.js"></script>',
      );
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Local test origin unavailable");
    origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true });
  },
  { timeout: 60_000 },
);
beforeEach(async () => {
  context = await browser.newContext();
  page = await context.newPage();
  await page.goto(origin);
});
afterEach(async () => {
  await context?.close();
});
afterAll(async () => {
  await browser?.close();
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("real isolated IndexedDB measured journal", () => {
  it("recovers a prior journal-v2 epoch's committed chunks without reactivating its archived submissions or historical drafts", async () => {
    const result = await page.evaluate(async () => {
      const h = window.RecordingStorageHarness;
      const epoch = Date.parse("2026-09-20T10:00:00Z");
      const previousName = `${h.WEB_RECORDING_JOURNAL_DATABASE_PREFIX}${Number(h.CURRENT_CONTRACT_EPOCH_VALUE) - 1}`;
      const start = (id: string) =>
        h.startTimerOnlyRecording(
          h.configureTimerOnlyRecording(h.createInitialTimerOnlyRecordingState(), {
            activity_category: "bike",
          }).state,
          epoch,
          id,
        ).state;
      const storage = new h.IndexedDbTimerDraftStorage("owner", "prior-writer", () => epoch + 2000);
      const draft = h.createTimerOnlyRecordingDraft(
        start("prior-journal-draft"),
        epoch + 2000,
        "owner",
      );
      if (!draft) throw new Error("Expected draft");
      const journal = h.openMeasuredWindow(h.emptyMeasuredJournal(), new Date(epoch).toISOString());
      const collector = new h.MeasuredNotificationAppender();
      for (let sequenceNumber = 1; sequenceNumber <= 2; sequenceNumber++) {
        const recordedAt = new Date(epoch + sequenceNumber * 1000).toISOString();
        collector.append(journal, {
          origin: "bluetooth_notification",
          sourceId: "prior-source",
          sequenceNumber,
          recordedAt,
          samples: [
            {
              metricFamily: "power",
              unit: "watts",
              value: 200 + sequenceNumber,
              sequenceNumber,
              recordedAt,
              source: {
                sourceId: "prior-source",
                sourceType: "trainer_power",
                provenance: "actual",
                adapterId: "web-bluetooth",
              },
            },
          ],
        });
      }
      await storage.appendMeasuredCheckpoint(draft, {
        header: {
          version: journal.version,
          provenance: journal.provenance,
          windows: journal.windows,
        },
        expectedCursor: 0,
        entries: journal.entries,
      });
      const open = (name: string, createStores: string[] = []) =>
        new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(name, 1);
          request.onupgradeneeded = () => {
            for (const store of createStores) request.result.createObjectStore(store);
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      const value = <T>(request: IDBRequest<T>) =>
        new Promise<T>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      const complete = (tx: IDBTransaction) =>
        new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error);
        });
      const current = await open(h.WEB_RECORDING_DATABASE_NAME);
      const stores = Array.from(current.objectStoreNames);
      const prior = await open(previousName, stores);
      for (const name of stores) {
        const read = current.transaction(name, "readonly");
        const [keys, rows] = await Promise.all([
          value(read.objectStore(name).getAllKeys()),
          value(read.objectStore(name).getAll()),
        ]);
        const write = prior.transaction(name, "readwrite");
        rows.forEach((row, index) => {
          write.objectStore(name).put(row, keys[index]);
        });
        await complete(write);
      }
      const artifacts = [];
      const jobs = [];
      for (const status of ["queued", "submitting", "submitted", "review_required"] as const) {
        const artifact = await h.finalizeTimerRecordingArtifact({
          state: h.finishTimerOnlyRecording(start(`prior-${status}`), epoch + 1000).state,
          ownerId: "owner",
          segmentId: "11111111-1111-4111-8111-111111111111",
          review: {
            name: status,
            notes: null,
            perceivedEffort: null,
            distanceMeters: 0,
            calories: null,
          },
        });
        artifacts.push(artifact);
        jobs.push({
          job: {
            ...h.createQueuedSubmissionJob(artifact, new Date(epoch).toISOString()),
            status,
            activityId:
              status === "submitted" || status === "review_required"
                ? "22222222-2222-4222-8222-222222222222"
                : null,
          },
        });
      }
      // Model the already-shipped bug: these artifacts were copied without jobs;
      // their submission history exists only in the protected legacy archive.
      const archive = {
        version: 1,
        ownerId: "owner",
        blockedArtifactIds: artifacts.map((item) => item.recordingSessionId),
        databases: [
          {
            name: h.LEGACY_WEB_RECORDING_DATABASE_NAME,
            draft: h.createTimerOnlyRecordingDraft(
              start("historical-draft"),
              epoch + 1000,
              "owner",
            ),
            leaseExpiresAtMs: 0,
            artifacts,
            jobs,
          },
        ],
      };
      const write = prior.transaction(["legacy-archive", "finalized-artifacts"], "readwrite");
      write.objectStore("legacy-archive").put(archive, "owner");
      for (const artifact of artifacts)
        write.objectStore("finalized-artifacts").put(artifact, artifact.recordingSessionId);
      await complete(write);
      const historical = await open(h.LEGACY_WEB_RECORDING_DATABASE_NAME, ["timer-drafts"]);
      const historicalWrite = historical.transaction("timer-drafts", "readwrite");
      historicalWrite
        .objectStore("timer-drafts")
        .put(
          { ownerId: "owner", draft: archive.databases[0]?.draft, leaseExpiresAtMs: 0 },
          "active-timer-recording:owner",
        );
      await complete(historicalWrite);
      historical.close();
      const future = await open(
        `${h.WEB_RECORDING_JOURNAL_DATABASE_PREFIX}${Number(h.CURRENT_CONTRACT_EPOCH_VALUE) + 1}`,
        ["timer-drafts"],
      );
      const futureWrite = future.transaction("timer-drafts", "readwrite");
      futureWrite.objectStore("timer-drafts").put(
        {
          ownerId: "owner",
          draft: h.createTimerOnlyRecordingDraft(start("future-draft"), epoch + 1000, "owner"),
          leaseExpiresAtMs: 0,
        },
        "active-timer-recording:owner",
      );
      await complete(futureWrite);
      future.close();
      current.close();
      prior.close();
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(h.WEB_RECORDING_DATABASE_NAME);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      const next = new h.IndexedDbTimerDraftStorage("owner", "next-writer", () => epoch + 60_000);
      let offered = false;
      try {
        await next.load();
      } catch (error) {
        offered = error instanceof h.LegacyRecordingRecoveryRequiredError;
      }
      await next.takeOver();
      const recovered = await h.loadTimerDraft(next, "owner");
      const retained = await next.getLegacyArchive();
      const priorStillExists = (await indexedDB.databases()).some(
        (database) => database.name === previousName,
      );
      const unchanged = await open(previousName);
      const previousCheckpoint = await value(
        unchanged
          .transaction("timer-drafts", "readonly")
          .objectStore("timer-drafts")
          .get("active-timer-recording:owner"),
      );
      unchanged.close();
      return {
        offered,
        sessionId: recovered.draft?.sessionSnapshot.identity.sessionId,
        sequences: recovered.draft?.measuredJournal?.entries.map((entry) => entry.sequenceNumber),
        values: recovered.draft?.measuredJournal?.entries.map(
          (entry) => entry.notification.samples[0]?.value,
        ),
        lifecycle: recovered.draft?.lifecycle,
        activeArtifacts: (await next.listArtifacts()).map((item) => item.recordingSessionId),
        queued: (await next.listDueSubmissionJobs(new Date(epoch + 60000).toISOString())).length,
        archivedJobs: retained?.databases.reduce((sum, database) => sum + database.jobs.length, 0),
        priorStillExists,
        previousLifecycle: previousCheckpoint.draft.lifecycle,
        previousCursor: previousCheckpoint.measured.cursor,
        previousWindowEnd: previousCheckpoint.measured.header.windows[0].endedAt,
      };
    });
    assert.deepEqual(result, {
      offered: true,
      sessionId: "prior-journal-draft",
      sequences: [1, 2],
      values: [201, 202],
      lifecycle: "paused",
      activeArtifacts: [],
      queued: 0,
      archivedJobs: 4,
      priorStillExists: true,
      previousLifecycle: "recording",
      previousCursor: 2,
      previousWindowEnd: null,
    });
  });
  it("isolates epoch-3 readers and preserves explicit legacy timer recovery plus read-only submission archives", async () => {
    const result = await page.evaluate(async () => {
      const h = window.RecordingStorageHarness;
      const epoch = Date.parse("2026-09-20T10:00:00Z");
      let now = epoch + 1000;
      const start = (id: string) =>
        h.startTimerOnlyRecording(
          h.configureTimerOnlyRecording(h.createInitialTimerOnlyRecordingState(), {
            activity_category: "bike",
          }).state,
          epoch,
          id,
        ).state;
      const oldDraft = h.createTimerOnlyRecordingDraft(
        start("legacy-timer"),
        epoch + 1000,
        "owner",
      );
      if (!oldDraft) throw new Error("Expected legacy draft");
      const artifact = async (id: string) =>
        h.finalizeTimerRecordingArtifact({
          state: h.finishTimerOnlyRecording(start(id), epoch + 1000).state,
          ownerId: "owner",
          segmentId: "11111111-1111-4111-8111-111111111111",
          review: {
            name: "Legacy",
            notes: null,
            perceivedEffort: null,
            distanceMeters: 0,
            calories: null,
          },
        });
      const finished = await artifact("legacy-finished");
      const queued = await artifact("legacy-queued");
      const job = h.createQueuedSubmissionJob(queued, new Date(epoch).toISOString());
      const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(h.LEGACY_TIMER_RECORDING_DATABASE_NAME, 1);
        request.onupgradeneeded = () => {
          for (const name of ["timer-drafts", "finalized-artifacts", "submission-jobs"])
            request.result.createObjectStore(name);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = legacy.transaction(
        ["timer-drafts", "finalized-artifacts", "submission-jobs"],
        "readwrite",
      );
      tx.objectStore("timer-drafts").put(
        {
          ownerId: "owner",
          draft: oldDraft,
          leaseOwner: "epoch3-tab",
          leaseExpiresAtMs: epoch + 45_000,
        },
        "active-timer-recording:owner",
      );
      tx.objectStore("finalized-artifacts").put(finished, finished.recordingSessionId);
      tx.objectStore("finalized-artifacts").put(queued, queued.recordingSessionId);
      tx.objectStore("submission-jobs").put(
        { job, claimOwner: null, claimExpiresAtMs: 0, revision: 0 },
        job.id,
      );
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      const storage = new h.IndexedDbTimerDraftStorage("owner", "new-tab", () => now);
      let recoveryOffered = false;
      try {
        await storage.load();
      } catch (error) {
        recoveryOffered = error instanceof h.LegacyRecordingRecoveryRequiredError;
      }
      let activeLeaseRefused = false;
      try {
        await storage.takeOver();
      } catch (error) {
        activeLeaseRefused = error instanceof Error && error.message.includes("45-second lease");
      }
      now = epoch + 60_000;
      await storage.takeOver();
      const copied = await h.loadTimerDraft(storage, "owner");
      if (!copied.draft) throw new Error("Legacy recovery was not copied");
      const resumed = h.resumeTimerOnlyRecording(
        h.recoverTimerOnlyRecording(copied.draft).state,
        now,
      ).state;
      const journal = h.openMeasuredWindow(h.emptyMeasuredJournal(), new Date(now).toISOString());
      const recordedAt = new Date(now + 1).toISOString();
      new h.MeasuredNotificationAppender().append(journal, {
        origin: "bluetooth_notification",
        sourceId: "new-source",
        recordedAt,
        sequenceNumber: 1,
        samples: [
          {
            metricFamily: "power",
            value: 200,
            unit: "watts",
            recordedAt,
            sequenceNumber: 1,
            source: {
              sourceId: "new-source",
              sourceType: "trainer_power",
              provenance: "actual",
              adapterId: "web-bluetooth",
            },
          },
        ],
      });
      const draft = h.createTimerOnlyRecordingDraft(resumed, now + 2, "owner");
      if (!draft) throw new Error("Expected resumed draft");
      await storage.appendMeasuredCheckpoint(draft, {
        header: {
          version: journal.version,
          provenance: journal.provenance,
          windows: journal.windows,
        },
        expectedCursor: 0,
        entries: journal.entries,
      });
      const materialized = await storage.load();
      const { measuredJournal: _unsupported, ...oldShape } =
        h.portableTimerRecordingDraftSchema.shape;
      const oldStrictReader = h.z.object(oldShape).strict();
      const rejectedByOldReader = !oldStrictReader.safeParse(materialized).success;
      // The actual old reader addresses only its old exact namespace. Even its
      // take-over/removal cannot acquire or erase the isolated measured draft.
      const removal = legacy.transaction("timer-drafts", "readwrite");
      removal.objectStore("timer-drafts").put(
        {
          ownerId: "owner",
          draft: null,
          leaseOwner: "epoch3-tab",
          leaseExpiresAtMs: now + 45_000,
        },
        "active-timer-recording:owner",
      );
      await new Promise<void>((resolve) => {
        removal.oncomplete = () => resolve();
      });
      const stillPresent = await h.loadTimerDraft(storage, "owner");
      let replayBlocked = false;
      try {
        await storage.enqueueSubmission(queued, new Date(now).toISOString());
      } catch {
        replayBlocked = true;
      }
      const archive = await storage.getLegacyArchive();
      const latest = await storage.loadLatestArtifact();
      legacy.close();
      return {
        recoveryOffered,
        activeLeaseRefused,
        rejectedByOldReader,
        isolatedName: !h.WEB_RECORDING_DATABASE_NAME.startsWith(h.WEB_RECORDING_DATABASE_PREFIX),
        copiedLifecycle: copied.draft.lifecycle,
        copiedSession: copied.draft.sessionSnapshot.identity.sessionId,
        count: stillPresent.draft?.measuredJournal?.entries.length,
        archiveHasOriginalDraft: Boolean(archive?.databases[0]?.draft),
        archivedJobs: archive?.databases[0]?.jobs.length,
        replayBlocked,
        dueJobs: (await storage.listDueSubmissionJobs(new Date(now).toISOString())).length,
        latestReview: latest?.recordingSessionId,
        activeArtifactIds: (await storage.listArtifacts())
          .map((item) => item.recordingSessionId)
          .sort(),
      };
    });
    assert.deepEqual(result, {
      recoveryOffered: true,
      activeLeaseRefused: true,
      rejectedByOldReader: true,
      isolatedName: true,
      copiedLifecycle: "paused",
      copiedSession: "legacy-timer",
      count: 1,
      archiveHasOriginalDraft: true,
      archivedJobs: 1,
      replayBlocked: true,
      dueJobs: 0,
      latestReview: "legacy-finished",
      activeArtifactIds: ["legacy-finished"],
    });
  });
  it("appends 20,000 deterministic notifications with bounded writes, then reloads the exact committed prefix", {
    timeout: 60_000,
  }, async () => {
    const evidence = await page.evaluate(async () => {
      const h = window.RecordingStorageHarness;
      const epoch = Date.parse("2026-09-20T10:00:00Z");
      const initial = h.startTimerOnlyRecording(
        h.configureTimerOnlyRecording(h.createInitialTimerOnlyRecordingState(), {
          activity_category: "bike",
        }).state,
        epoch,
        "volume-session",
      ).state;
      let receiptTime = epoch;
      const storage = new h.IndexedDbTimerDraftStorage("owner", "writer", () => receiptTime);
      const journal = h.openMeasuredWindow(h.emptyMeasuredJournal(), new Date(epoch).toISOString());
      const entriesIdentity = journal.entries;
      const collector = new h.MeasuredNotificationAppender();
      let cursor = 0;
      let writes = 0;
      let totalEntriesWritten = 0;
      let maximumBatch = 0;
      let maximumWriteBytes = 0;
      const started = performance.now();
      for (let index = 1; index <= 20_000; index++) {
        receiptTime = epoch + index * 20;
        const recordedAt = new Date(receiptTime).toISOString();
        const source = { sourceId: "trainer", provenance: "actual", adapterId: "web-bluetooth" };
        collector.append(journal, {
          origin: "bluetooth_notification",
          sourceId: "trainer",
          recordedAt,
          sequenceNumber: index,
          caloriesCounterKcal: Math.floor(index / 100),
          samples: [
            {
              recordedAt,
              sequenceNumber: index,
              metricFamily: "power",
              unit: "watts",
              value: 200 + (index % 20),
              source: {
                sourceId: "trainer",
                sourceType: "trainer_power",
                provenance: "actual",
                adapterId: "web-bluetooth",
              },
            },
            {
              recordedAt,
              sequenceNumber: index,
              metricFamily: "heart_rate",
              unit: "bpm",
              value: 140 + (index % 10),
              source: { ...source, sourceType: "trainer_passthrough" },
            },
            {
              recordedAt,
              sequenceNumber: index,
              metricFamily: "cadence",
              unit: "rpm",
              value: 90,
              source: { ...source, sourceType: "trainer_cadence" },
            },
            {
              recordedAt,
              sequenceNumber: index,
              metricFamily: "speed",
              unit: "meters_per_second",
              value: 8,
              source: { ...source, sourceType: "trainer_speed" },
            },
            {
              recordedAt,
              sequenceNumber: index,
              metricFamily: "distance",
              unit: "meters",
              value: Math.floor(index * 0.16),
              source: { ...source, sourceType: "trainer_speed" },
            },
          ],
        });
        if (index % h.MEASURED_BATCH_SIZE === 0 || index === 20_000) {
          const draft = h.createTimerOnlyRecordingDraft(initial, receiptTime, "owner");
          if (!draft) throw new Error("Expected timer");
          const batch = {
            header: {
              version: journal.version,
              provenance: journal.provenance,
              windows: journal.windows,
            },
            expectedCursor: cursor,
            entries: journal.entries.slice(cursor, index),
          };
          maximumBatch = Math.max(maximumBatch, batch.entries.length);
          maximumWriteBytes = Math.max(
            maximumWriteBytes,
            new TextEncoder().encode(JSON.stringify({ draft, batch })).byteLength,
          );
          totalEntriesWritten += batch.entries.length;
          writes++;
          cursor = await storage.appendMeasuredCheckpoint(draft, batch);
        }
      }
      return {
        writes,
        cursor,
        totalEntriesWritten,
        maximumBatch,
        maximumWriteBytes,
        elapsedMs: performance.now() - started,
        sameEntriesArray: journal.entries === entriesIdentity,
      };
    });
    assert.equal(evidence.writes, 157);
    assert.equal(evidence.cursor, 20_000);
    assert.equal(evidence.totalEntriesWritten, 20_000);
    assert.equal(evidence.maximumBatch, 128);
    assert.equal(evidence.sameEntriesArray, true);
    assert.ok(evidence.maximumWriteBytes < 256_000);
    console.info("Measured IDB volume evidence", evidence);
    await page.reload();
    const recovered = await page.evaluate(async () => {
      const h = window.RecordingStorageHarness;
      const storage = new h.IndexedDbTimerDraftStorage("owner", "reader");
      await storage.takeOver();
      const result = await h.loadTimerDraft(storage, "owner");
      const entries = result.draft?.measuredJournal?.entries ?? [];
      return {
        count: entries.length,
        ordered: entries.every(
          (entry, index) =>
            entry.sequenceNumber === index + 1 && entry.notification.sequenceNumber === index + 1,
        ),
        first: entries[0]?.notification.samples[0]?.value,
        last: entries.at(-1)?.notification.samples[0]?.value,
      };
    });
    assert.deepEqual(recovered, { count: 20_000, ordered: true, first: 201, last: 200 });
  });

  it("aborts chunk/cursor together and recovers commits whose acknowledgement was lost", async () => {
    const result = await page.evaluate(async () => {
      const h = window.RecordingStorageHarness;
      const epoch = Date.parse("2026-09-20T10:00:00Z");
      const state = h.startTimerOnlyRecording(
        h.configureTimerOnlyRecording(h.createInitialTimerOnlyRecordingState(), {
          activity_category: "bike",
        }).state,
        epoch,
        "failure-session",
      ).state;
      const storage = new h.IndexedDbTimerDraftStorage("owner", "writer", () => epoch + 10_000);
      const journal = h.openMeasuredWindow(h.emptyMeasuredJournal(), new Date(epoch).toISOString());
      const collector = new h.MeasuredNotificationAppender();
      for (let sequenceNumber = 1; sequenceNumber <= 2; sequenceNumber++) {
        const recordedAt = new Date(epoch + sequenceNumber * 1000).toISOString();
        collector.append(journal, {
          origin: "bluetooth_notification",
          sourceId: "trainer",
          recordedAt,
          sequenceNumber,
          samples: [
            {
              recordedAt,
              sequenceNumber,
              metricFamily: "distance",
              unit: "meters",
              value: sequenceNumber * 10,
              source: {
                sourceId: "trainer",
                sourceType: "trainer_speed",
                provenance: "actual",
                adapterId: "web-bluetooth",
              },
            },
          ],
        });
      }
      const draft = h.createTimerOnlyRecordingDraft(state, epoch + 3000, "owner");
      if (!draft) throw new Error("Expected draft");
      const header = {
        version: journal.version,
        provenance: journal.provenance,
        windows: journal.windows,
      };
      await storage.appendMeasuredCheckpoint(draft, {
        header,
        expectedCursor: 0,
        entries: journal.entries.slice(0, 1),
      });
      const add = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function (value: unknown, key?: IDBValidKey) {
        const request = add.call(this, value, key);
        if (this.name === "measured-chunks")
          request.addEventListener("success", () => this.transaction.abort());
        return request;
      };
      let aborted = false;
      try {
        await storage.appendMeasuredCheckpoint(draft, {
          header,
          expectedCursor: 1,
          entries: journal.entries.slice(1),
        });
      } catch {
        aborted = true;
      }
      IDBObjectStore.prototype.add = add;
      const afterAbort = await h.loadTimerDraft(storage, "owner");
      let lostAcknowledgement = false;
      try {
        await storage
          .appendMeasuredCheckpoint(draft, {
            header,
            expectedCursor: 1,
            entries: journal.entries.slice(1),
          })
          .then(() => {
            throw new Error("Lost acknowledgement after commit");
          });
      } catch {
        lostAcknowledgement = true;
      }
      let staleRetryRejected = false;
      try {
        await storage.appendMeasuredCheckpoint(draft, {
          header,
          expectedCursor: 1,
          entries: journal.entries.slice(1),
        });
      } catch {
        staleRetryRejected = true;
      }
      const afterCommit = await h.loadTimerDraft(storage, "owner");
      const closed = h.closeMeasuredWindow(journal, new Date(epoch + 4000).toISOString());
      const paused = h.pauseTimerOnlyRecording(state, epoch + 4000).state;
      const pausedDraft = h.createTimerOnlyRecordingDraft(paused, epoch + 4000, "owner");
      if (!pausedDraft) throw new Error("Expected paused draft");
      await storage.appendMeasuredCheckpoint(pausedDraft, {
        header: { version: closed.version, provenance: closed.provenance, windows: closed.windows },
        expectedCursor: 2,
        entries: [],
      });
      const artifact = await h.finalizeTimerRecordingArtifact({
        state: h.finishTimerOnlyRecording(paused, epoch + 4000).state,
        ownerId: "owner",
        segmentId: "11111111-1111-4111-8111-111111111111",
        measuredJournal: closed,
        review: {
          name: "Committed",
          notes: null,
          perceivedEffort: null,
          distanceMeters: 10,
          calories: null,
        },
      });
      await storage.finalize(artifact);
      return {
        aborted,
        lostAcknowledgement,
        staleRetryRejected,
        afterAbort: afterAbort.draft?.measuredJournal?.entries.length,
        afterCommit: afterCommit.draft?.measuredJournal?.entries.length,
        finalized: (await storage.loadLatestArtifact())?.measuredJournal?.entries.length,
        draftAfterFinish: await storage.load(),
      };
    });
    assert.deepEqual(result, {
      aborted: true,
      lostAcknowledgement: true,
      staleRetryRejected: true,
      afterAbort: 1,
      afterCommit: 2,
      finalized: 2,
      draftAfterFinish: null,
    });
  });
});
