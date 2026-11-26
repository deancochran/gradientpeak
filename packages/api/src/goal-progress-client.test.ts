import { describe, expect, it } from "vitest";
import { selectPublishedGoalProgressHistory } from "./goal-progress-client";

const history = [{ id: "same-revision" }];

describe("selectPublishedGoalProgressHistory", () => {
  it.each([
    {
      name: "equal known publications",
      progress: { publication: { publishedRevision: 7 } },
      overview: { publication: { publishedRevision: 7 } },
      expected: { history, historyLimited: true, publicationMismatch: false },
    },
    {
      name: "equal zero publications",
      progress: { publication: { publishedRevision: 0 } },
      overview: { publication: { publishedRevision: 0 } },
      expected: { history, historyLimited: true, publicationMismatch: false },
    },
    {
      name: "different known publications",
      progress: { publication: { publishedRevision: 7 } },
      overview: { publication: { publishedRevision: 8 } },
      expected: { history: [], historyLimited: false, publicationMismatch: true },
    },
    {
      name: "different known publications beginning at zero",
      progress: { publication: { publishedRevision: 0 } },
      overview: { publication: { publishedRevision: 1 } },
      expected: { history: [], historyLimited: false, publicationMismatch: true },
    },
    {
      name: "the cold null publications from the evidence-free goal",
      progress: { publication: { publishedRevision: null } },
      overview: { publication: { publishedRevision: null } },
      expected: { history: [], historyLimited: false, publicationMismatch: false },
    },
    {
      name: "a progress publication missing against a known overview",
      progress: {},
      overview: { publication: { publishedRevision: 7 } },
      expected: { history: [], historyLimited: false, publicationMismatch: false },
    },
    {
      name: "a known progress publication against a missing overview publication",
      progress: { publication: { publishedRevision: 7 } },
      overview: {},
      expected: { history: [], historyLimited: false, publicationMismatch: false },
    },
  ] as const)("handles $name without inventing compatible history", ({
    progress,
    overview,
    expected,
  }) => {
    expect(
      selectPublishedGoalProgressHistory(progress, {
        ...overview,
        history: { items: history, nextCursor: "next" },
      }),
    ).toEqual(expected);
  });

  it.each([
    {
      name: "no progress read",
      progress: undefined,
      overview: { publication: { publishedRevision: 7 } },
    },
    {
      name: "no overview read",
      progress: { publication: { publishedRevision: 7 } },
      overview: undefined,
    },
  ] as const)("keeps unavailable reads distinct from a publication mismatch: $name", ({
    progress,
    overview,
  }) => {
    expect(
      selectPublishedGoalProgressHistory(
        progress,
        overview && { ...overview, history: { items: history, nextCursor: null } },
      ),
    ).toEqual({ history: [], historyLimited: false, publicationMismatch: false });
  });
});
