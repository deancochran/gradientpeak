import { profiles } from "@repo/drizzle/schemas";
import { z } from "zod";

// We create a type here based on the drizzle schema
// This is a common pattern to avoid circular dependencies
export type Profile = z.infer<typeof profiles>;

export const getProfile = async (): Promise<Profile> => {
  // This function will eventually call your Drizzle-backed API
  // For now, it uses a placeholder fetch call
  const response = await fetch("/api/mobile/profile");
  if (!response.ok) {
    // In a real app, you'd want to parse the error response
    const errorBody = await response.text();
    console.error("API Error:", errorBody);
    throw new Error(`Failed to fetch profile: ${response.statusText}`);
  }
  return response.json();
};
