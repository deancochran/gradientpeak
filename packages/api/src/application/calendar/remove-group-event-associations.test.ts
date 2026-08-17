import { describe, expect, it, vi } from "vitest";
import {
  PlannedSessionGroupEventAssociationConflictError,
  removeGroupEventAssociationsForDeletion,
} from "./remove-group-event-associations";

const profileId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const groupEventId = "33333333-3333-4333-8333-333333333333";

function testDb(returning: Array<{ id: string }>) {
  const selected = {
    id: sessionId,
    profileId,
    groupEventId,
    sessionRevision: 4,
  };
  const selectBuilder: Record<string, unknown> = {};
  Object.assign(selectBuilder, {
    from: vi.fn(() => selectBuilder),
    where: vi.fn(() => selectBuilder),
    orderBy: vi.fn(() => selectBuilder),
    for: vi.fn(async () => [selected]),
  });
  const returningMock = vi.fn(async () => returning);
  const whereMock = vi.fn(() => ({ returning: returningMock }));
  const setMock = vi.fn(() => ({ where: whereMock }));
  const db = {
    select: vi.fn(() => selectBuilder),
    update: vi.fn(() => ({ set: setMock })),
  };
  return { db, returningMock, setMock, whereMock };
}

describe("removeGroupEventAssociationsForDeletion", () => {
  it("clears the owner-scoped association and advances its revision", async () => {
    const { db, setMock } = testDb([{ id: sessionId }]);

    await expect(
      removeGroupEventAssociationsForDeletion({ db: db as never, groupEventIds: [groupEventId] }),
    ).resolves.toBe(1);
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ group_event_id: null, session_revision: expect.anything() }),
    );
  });

  it("fails the deletion transaction if a stale association cannot be revisioned", async () => {
    const { db } = testDb([]);

    await expect(
      removeGroupEventAssociationsForDeletion({ db: db as never, groupEventIds: [groupEventId] }),
    ).rejects.toBeInstanceOf(PlannedSessionGroupEventAssociationConflictError);
  });
});
