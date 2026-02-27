import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import { profilesRouter } from "../profiles";

type QueryResult = {
  data: any;
  error: { code?: string; message: string } | null;
};

function createSupabaseMock(results: Record<string, QueryResult>) {
  const tableSpies = new Map<
    string,
    {
      select: ReturnType<typeof vi.fn>;
    }
  >();

  const client = {
    tableSpies,
    from: (table: string) => {
      const result = results[table] ?? { data: null, error: null };
      const selectSpy = vi.fn(() => builder);
      const builder: any = {
        select: selectSpy,
        eq: vi.fn(() => builder),
        single: vi.fn(() => Promise.resolve(result)),
      };

      tableSpies.set(table, { select: selectSpy });
      return builder;
    },
  };

  return client;
}

function createProfilesCaller(results: Record<string, QueryResult>) {
  const supabase = createSupabaseMock(results);

  return {
    caller: profilesRouter.createCaller({
      supabase: supabase as any,
      session: {
        user: {
          id: "11111111-1111-4111-8111-111111111111",
        },
      },
      headers: new Headers(),
      clientType: "test",
      trpcSource: "vitest",
    } as any),
    tableSpies: supabase.tableSpies,
  };
}

describe("profilesRouter contracts", () => {
  it("uses explicit projection for public profile lookup", async () => {
    const { caller, tableSpies } = createProfilesCaller({
      profiles: {
        data: {
          id: "22222222-2222-4222-8222-222222222222",
          username: "other",
          avatar_url: null,
          bio: null,
          gender: null,
          preferred_units: null,
          language: null,
        },
        error: null,
      },
    });

    await caller.getPublicById({
      id: "22222222-2222-4222-8222-222222222222",
    });

    const profilesSelect = tableSpies.get("profiles")?.select;
    expect(profilesSelect).toHaveBeenCalledWith(
      "id, username, avatar_url, bio, gender, preferred_units, language",
    );
    expect(profilesSelect).not.toHaveBeenCalledWith("*");
  });

  it("maps public lookup not-found to NOT_FOUND", async () => {
    const { caller } = createProfilesCaller({
      profiles: {
        data: null,
        error: {
          code: "PGRST116",
          message: "Row not found",
        },
      },
    });

    await expect(
      caller.getPublicById({
        id: "33333333-3333-4333-8333-333333333333",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" } as Partial<TRPCError>);
  });

  it("keeps self profile query on full contract", async () => {
    const { caller, tableSpies } = createProfilesCaller({
      profiles: {
        data: {
          id: "11111111-1111-4111-8111-111111111111",
          username: "owner",
          dob: "1990-01-01",
        },
        error: null,
      },
    });

    await caller.get();

    const profilesSelect = tableSpies.get("profiles")?.select;
    expect(profilesSelect).toHaveBeenCalledWith("*");
  });
});
