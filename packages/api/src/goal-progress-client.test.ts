import { describe, expect, it } from "vitest";
import { selectPublishedGoalProgressHistory } from "./goal-progress-client";

const history = [{ id: "same-revision" }];

describe("selectPublishedGoalProgressHistory", () => {
  it("joins threshold history only for matching non-null publications", () => {
    expect(
      selectPublishedGoalProgressHistory(
        { publication: { publishedRevision: 7 } },
        { publication: { publishedRevision: 7 }, history: { items: history, nextCursor: "next" } },
      ),
    ).toEqual({ history, historyLimited: true, publicationMismatch: false });
  });

  it.each([
    [{ publication: { publishedRevision: 7 } }, { publication: { publishedRevision: 8 } }],
    [{ publication: { publishedRevision: null } }, { publication: { publishedRevision: null } }],
    [{}, { publication: { publishedRevision: 7 } }],
  ] as const)("excludes foreign or unversioned history", (progress, overview) => {
    expect(
      selectPublishedGoalProgressHistory(progress, {
        ...overview,
        history: { items: history, nextCursor: null },
      }),
    ).toEqual({ history: [], historyLimited: false, publicationMismatch: true });
  });
});
