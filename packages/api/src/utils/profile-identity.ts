import { profiles } from "@repo/db";
import { inArray } from "drizzle-orm";
import { z } from "zod";

export const profileIdentitySchema = z
  .object({
    id: z.string().uuid(),
    username: z.string().nullable(),
    avatar_url: z.string().nullable(),
  })
  .strict();

export type ProfileIdentity = z.infer<typeof profileIdentitySchema>;

export async function loadProfileIdentityMap(
  db: any,
  profileIds: Array<string | null | undefined>,
) {
  const ids = Array.from(new Set(profileIds.filter((id): id is string => typeof id === "string")));

  if (ids.length === 0) {
    return new Map<string, ProfileIdentity>();
  }

  const rows = await db
    .select({
      id: profiles.id,
      username: profiles.username,
      avatar_url: profiles.avatar_url,
    })
    .from(profiles)
    .where(inArray(profiles.id, ids));

  const parsedRows = z.array(profileIdentitySchema).parse(rows);
  return new Map(parsedRows.map((row) => [row.id, row]));
}
