import assert from "node:assert/strict";
import test from "node:test";
import { workspaceCaptures, workspaceFlowFor } from "./current-candidate-support";

test("keeps the full selected-session detail journey as the default workspace flow", () => {
  assert.equal(workspaceFlowFor(), "athlete-visual-workspace.yaml");
});

test("selects the bounded selected-Home setup flow only when explicitly requested", () => {
  assert.equal(
    workspaceFlowFor("selected-home-only"),
    "athlete-visual-workspace-selected-home.yaml",
  );
  assert.deepEqual(workspaceCaptures, ["athlete-workspace-selected-session"]);
});
