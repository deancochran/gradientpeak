# Tasks: FIT File Architecture Rework (v7.0.0)

**Goal:** Implement the new architecture where the mobile client is a "smart recorder" that generates the FIT file in real-time, and the server is the sole authority for parsing the uploaded file and calculating all database metrics.

---

## Phase 1: Documentation (COMPLETE)

- [x] **T-101:** Update `DESIGN.md` with the new client-side encoding and server-side calculation architecture. (Done by Documentation Strategist)
- [x] **T-102:** Create `CLIENT_IMPLEMENTATION_GUIDE.md` with detailed best practices for the mobile FIT encoder. (Done by Garmin FIT SDK Expert)
- [x] **T-103:** Create `INTEGRATION_GUIDE.md` defining the client-server data flow, tRPC endpoints, and error handling. (Done by Integration Analyst)
- [x] **T-104:** Update this `TASKS.md` file to reflect the new implementation plan.

---

## Phase 2: Mobile "Smart Recorder" Implementation

**Goal:** Refactor the mobile app to generate a compliant, high-quality FIT file in real-time during an activity.

- [ ] **T-201:** **Audit & Refactor `ActivityRecorder` Service:**
  - Review the existing FIT encoding logic against the specifications in `CLIENT_IMPLEMENTATION_GUIDE.md`.
  - Ensure the correct initialization sequence (`File Id`, `Device Info`, `Event Timer Start`).
  - Implement proper pause/resume logic using `Event Timer Stop/Start` messages.
  - Ensure no `Record` messages are written while paused.

- [ ] **T-202:** **Implement Pool Swim Logic:**
  - Add logic to generate `Length` messages for each completed pool length.
  - **Crucially, ensure every `Length` message is paired with a corresponding `Record` message with a matching timestamp.**
  - Implement `Lap` message generation to group sets of lengths.
  - Add support for `Drill Mode` lengths.
  - Verify all required fields for swim messages are populated as per the spec.

- [ ] **T-203:** **Implement File Finalization:**
  - Ensure the correct sequence of summary messages (`Lap`, `Session`, `Activity`) is written when the user saves the activity.
  - Verify the file is correctly closed and saved to the device's local storage.

- [ ] **T-204:** **Unit Tests for Mobile Encoder:**
  - Create `apps/mobile/__tests__/fit-recorder.test.ts`.
  - Write tests to verify correct file initialization.
  - Write tests for `Record` message generation and pause handling.
  - Write tests for pool swim `Length` and `Lap` generation.
  - Add a round-trip test: encode a sample activity and then parse it with a reference parser to ensure validity.

---

## Phase 3: Server-Side "Source of Truth" Implementation

**Goal:** Refactor the backend to treat the uploaded FIT file as the definitive source for all activity metrics.

- [ ] **T-301:** **Update tRPC Endpoints:**
  - Review the `fitFiles.getSignedUploadUrl` mutation to ensure it's ready for use.
  - Refactor the `fitFiles.processFitFile` mutation to be the primary entry point for creating an activity.
  - Remove the old logic from `activities.create` that accepts pre-calculated metrics from the client.

- [ ] **T-302:** **Implement Server-Side Metric Calculation:**
  - Inside `processFitFile`, after parsing the FIT file, use the functions from `@repo/core` to calculate all required metrics (duration, distance, averages, TSS, IF, etc.).
  - Ensure these server-calculated values are the only ones used to populate the database.

- [ ] **T-303:** **Create Activity Record:**
  - After all metrics are calculated, create the new record in the `activities` table.
  - Ensure the `fit_file_path` and other metadata are stored correctly.
  - Return the newly created activity object to the client.

- [ ] **T-304:** **Enhance Error Handling:**
  - Implement the error handling strategy outlined in `INTEGRATION_GUIDE.md`.
  - Ensure that if any step of the server-side process fails (download, parse, calculate, store), the entire transaction is rolled back and a clear error is returned to the client.
  - Consider moving failed FIT files to a "quarantine" storage bucket for later analysis.

- [ ] **T-305:** **Unit Tests for Server Processing:**
  - Expand tests in `packages/trpc/src/routers/__tests__/fit-files.test.ts`.
  - Add tests to verify that metrics are calculated correctly from a sample FIT file.
  - Test error handling for corrupt or invalid FIT files.
  - Test the failure case where the database insert fails and ensure the uploaded file is cleaned up.

---

## Phase 4: Client-Server Integration

**Goal:** Connect the refactored mobile app and backend to complete the new data flow.

- [ ] **T-401:** **Refactor `useActivitySubmission` Hook:**
  - Remove all on-device metric calculation logic (`calculateActivityMetrics`).
  - The hook's primary responsibility is now to orchestrate the upload process.
  - It should first call `getSignedUploadUrl`, then upload the file, and finally call `processFitFile`.

- [ ] **T-402:** **Implement User-Facing UI:**
  - Ensure the activity submission screen provides clear feedback to the user (e.g., "Uploading...", "Processing...", "Success!").
  - Display errors returned from the server in a user-friendly manner.
  - Upon success, navigate to the new activity detail screen using the data returned from the `processFitFile` mutation.

- [ ] **T-403:** **End-to-End Testing:**
  - Perform manual end-to-end tests of the entire flow: record an activity, save it, and verify it appears correctly in the app and database with server-calculated metrics.
  - Test with both a short time-based activity (run/bike) and a pool swim activity.
