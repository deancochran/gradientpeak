import { describe, expect, it } from "vitest";
import type { WahooRepository } from "../../repositories/wahoo-repository";
import { createWahooRepository } from "./drizzle-wahoo-repository";

type RepositoryHasDirectActivityCreate = "createImportedActivity" extends keyof WahooRepository
  ? true
  : false;
const repositoryHasDirectActivityCreate: RepositoryHasDirectActivityCreate = false;

describe("Wahoo repository activity persistence boundary", () => {
  it("does not expose a direct imported-activity creation path", () => {
    const repository = createWahooRepository({ db: {} as never });
    expect(repositoryHasDirectActivityCreate).toBe(false);
    expect(repository).not.toHaveProperty("createImportedActivity");
  });

  it("keeps link repair as an idempotency concern separate from canonical creation", () => {
    const repository = createWahooRepository({ db: {} as never });
    expect(repository).toHaveProperty("findImportedActivityByProviderExternalId");
    expect(repository).toHaveProperty("createImportedActivityResourceLink");
  });
});
