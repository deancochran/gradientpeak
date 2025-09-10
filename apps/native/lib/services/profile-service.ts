import { calculateHrZones } from "@repo/core/calculations";
import {
  createProfile,
  getProfileById,
  updateFTP,
  updateProfile,
  updateThresholdHR,
} from "@repo/core/queries";
import type { Profile, UpdateProfileInput } from "@repo/core/schemas";
import { supabase } from "../supabase";

export class ProfileService {
  private static profileCache: Profile | null = null;
  private static lastCacheUpdate = 0;
  private static readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Get current user profile
   */
  static async getCurrentProfile(): Promise<Profile | null> {
    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (error || !user) {
        console.warn(
          "ProfileService - User not authenticated:",
          error?.message,
        );
        return null;
      }

      // Check cache first
      if (
        this.profileCache &&
        Date.now() - this.lastCacheUpdate < this.CACHE_DURATION
      ) {
        console.log("ProfileService - Returning cached profile");
        return this.profileCache;
      }

      console.log(
        "ProfileService - Fetching profile from database for user:",
        user.id,
      );
      const profile = await getProfileById(user.id);
      if (profile) {
        this.profileCache = profile;
        this.lastCacheUpdate = Date.now();
        console.log("ProfileService - Profile cached successfully");
      } else {
        console.log("ProfileService - No profile found for user");
      }

      return profile;
    } catch (error) {
      console.error("ProfileService - Error getting current profile:", error);
      return null;
    }
  }

  /**
   * Create new user profile
   */
  static async createProfile(
    profileData: UpdateProfileInput,
  ): Promise<Profile | null> {
    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (error || !user) {
        console.error(
          "ProfileService - User not authenticated for profile creation",
        );
        return null;
      }

      console.log("ProfileService - Creating new profile for user:", user.id);
      const newProfile = await createProfile({
        ...profileData,
        // Add any required fields that might be missing
      } as any);

      if (newProfile) {
        this.profileCache = newProfile;
        this.lastCacheUpdate = Date.now();
        console.log("ProfileService - New profile created and cached");
      }

      return newProfile;
    } catch (error) {
      console.error("ProfileService - Error creating profile:", error);
      return null;
    }
  }

  /**
   * Update user profile
   */
  static async updateProfile(
    updates: UpdateProfileInput,
  ): Promise<Profile | null> {
    try {
      const currentProfile = await this.getCurrentProfile();
      if (!currentProfile) {
        console.error("ProfileService - No current profile found for update");
        return null;
      }

      console.log("ProfileService - Updating profile:", currentProfile.id);
      const updatedProfile = await updateProfile(currentProfile.id, updates);

      if (updatedProfile) {
        this.profileCache = updatedProfile;
        this.lastCacheUpdate = Date.now();
        console.log("ProfileService - Profile updated and cached");
      }

      return updatedProfile;
    } catch (error) {
      console.error("ProfileService - Error updating profile:", error);
      return null;
    }
  }

  /**
   * Update FTP with timestamp
   */
  static async updateFTP(ftp: number): Promise<Profile | null> {
    try {
      const currentProfile = await this.getCurrentProfile();
      if (!currentProfile) {
        console.error(
          "ProfileService - No current profile found for FTP update",
        );
        return null;
      }

      console.log("ProfileService - Updating FTP:", {
        profileId: currentProfile.id,
        ftp,
      });
      const updatedProfile = await updateFTP(currentProfile.id, ftp);

      if (updatedProfile) {
        this.profileCache = updatedProfile;
        this.lastCacheUpdate = Date.now();
        console.log("ProfileService - FTP updated successfully");
      }

      return updatedProfile;
    } catch (error) {
      console.error("ProfileService - Error updating FTP:", error);
      return null;
    }
  }

  /**
   * Update threshold heart rate with timestamp
   */
  static async updateThresholdHR(thresholdHr: number): Promise<Profile | null> {
    try {
      const currentProfile = await this.getCurrentProfile();
      if (!currentProfile) {
        console.error(
          "ProfileService - No current profile found for threshold HR update",
        );
        return null;
      }

      console.log("ProfileService - Updating threshold HR:", {
        profileId: currentProfile.id,
        thresholdHr,
      });
      const updatedProfile = await updateThresholdHR(
        currentProfile.id,
        thresholdHr,
      );

      if (updatedProfile) {
        this.profileCache = updatedProfile;
        this.lastCacheUpdate = Date.now();
        console.log("ProfileService - Threshold HR updated successfully");
      }

      return updatedProfile;
    } catch (error) {
      console.error("ProfileService - Error updating threshold HR:", error);
      return null;
    }
  }

  /**
   * Get heart rate zones for current profile
   */
  static async getHeartRateZones() {
    try {
      const profile = await this.getCurrentProfile();
      if (!profile || !profile.thresholdHr) {
        console.log(
          "ProfileService - Cannot calculate HR zones: missing profile or threshold HR",
        );
        return null;
      }

      const zones = calculateHrZones(profile);
      console.log("ProfileService - HR zones calculated:", zones);
      return zones;
    } catch (error) {
      console.error("ProfileService - Error calculating HR zones:", error);
      return null;
    }
  }

  /**
   * Clear profile cache
   */
  static clearCache(): void {
    console.log("ProfileService - Clearing profile cache");
    this.profileCache = null;
    this.lastCacheUpdate = 0;
  }

  /**
   * Check if user has completed profile setup
   */
  static async isProfileComplete(): Promise<boolean> {
    try {
      const profile = await this.getCurrentProfile();
      if (!profile) return false;

      // Check if essential fields are filled
      const hasBasicInfo = !!(profile.username && profile.weightKg);
      const hasTrainingMetrics = !!(profile.ftp || profile.thresholdHr);

      return hasBasicInfo && hasTrainingMetrics;
    } catch (error) {
      console.error(
        "ProfileService - Error checking profile completeness:",
        error,
      );
      return false;
    }
  }

  /**
   * Get profile setup progress (0-100)
   */
  static async getSetupProgress(): Promise<number> {
    try {
      const profile = await this.getCurrentProfile();
      if (!profile) return 0;

      let progress = 0;
      const fields = [
        profile.username,
        profile.weightKg,
        profile.gender,
        profile.ftp,
        profile.thresholdHr,
      ];

      const filledFields = fields.filter(
        (field) => field !== null && field !== undefined,
      ).length;
      progress = (filledFields / fields.length) * 100;

      return Math.round(progress);
    } catch (error) {
      console.error(
        "ProfileService - Error calculating setup progress:",
        error,
      );
      return 0;
    }
  }
}
