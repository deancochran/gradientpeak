import { eq } from "drizzle-orm";
import { db } from "../db";
import { profiles } from "../schemas/profiles";

export async function createProfile(
  profileData: Omit<
    typeof profiles.$inferInsert,
    "id" | "idx" | "createdAt" | "updatedAt"
  >,
) {
  const [profile] = await db.insert(profiles).values(profileData).returning();
  return profile;
}

export async function getProfileById(profileId: string) {
  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, profileId));
  return profile;
}

export async function getProfileByUserId(userId: string) {
  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId));
  return profile;
}

export async function updateProfile(
  profileId: string,
  updates: Partial<typeof profiles.$inferInsert>,
) {
  const [updatedProfile] = await db
    .update(profiles)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(profiles.id, profileId))
    .returning();
  return updatedProfile;
}

export async function updateFTP(profileId: string, ftp: number) {
  const [updatedProfile] = await db
    .update(profiles)
    .set({
      ftp,
      lastFtpUpdate: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(profiles.id, profileId))
    .returning();
  return updatedProfile;
}

export async function updateThresholdHR(
  profileId: string,
  thresholdHr: number,
) {
  const [updatedProfile] = await db
    .update(profiles)
    .set({
      thresholdHr,
      lastThresholdHrUpdate: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(profiles.id, profileId))
    .returning();
  return updatedProfile;
}

export async function deleteProfile(profileId: string) {
  const [deletedProfile] = await db
    .delete(profiles)
    .where(eq(profiles.id, profileId))
    .returning();
  return deletedProfile;
}

export async function getAllProfiles() {
  return await db.select().from(profiles);
}

export async function getProfilesByGender(gender: "male" | "female" | "other") {
  return await db.select().from(profiles).where(eq(profiles.gender, gender));
}

export async function getProfilesWithFTP() {
  return await db.select().from(profiles).where(profiles.ftp.isNotNull());
}

export async function getProfilesWithThresholdHR() {
  return await db
    .select()
    .from(profiles)
    .where(profiles.thresholdHr.isNotNull());
}

export async function updateProfileOnboarding(
  profileId: string,
  onboarded: boolean,
) {
  const [updatedProfile] = await db
    .update(profiles)
    .set({
      onboarded,
      updatedAt: new Date(),
    })
    .where(eq(profiles.id, profileId))
    .returning();
  return updatedProfile;
}
