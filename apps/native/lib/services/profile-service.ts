import { apiClient, type Profile } from "../api/client";
import { supabase } from "../supabase";

export class ProfileService {
  private static profileCache: Profile | null = null;
  private static lastCacheUpdate = 0;
  private static readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Get current user profile from Next.js API
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
        console.log("📱 ProfileService - Returning cached profile");
        return this.profileCache;
      }

      console.log(
        "🌐 ProfileService - Fetching profile from API for user:",
        user.id,
      );
      const response = await apiClient.getProfile();

      if (response.success && response.data) {
        this.profileCache = response.data;
        this.lastCacheUpdate = Date.now();
        console.log("✅ ProfileService - Profile cached successfully");
        return response.data;
      } else {
        console.error(
          "❌ ProfileService - Failed to fetch profile:",
          response.error,
        );
        return null;
      }
    } catch (error) {
      console.error(
        "❌ ProfileService - Error getting current profile:",
        error,
      );
      return null;
    }
  }

  /**
   * Update user profile via Next.js API
   */
  static async updateProfile(
    updates: Partial<Profile>,
  ): Promise<Profile | null> {
    try {
      console.log("🌐 ProfileService - Updating profile via API");
      const response = await apiClient.updateProfile(updates);

      if (response.success && response.data) {
        this.profileCache = response.data;
        this.lastCacheUpdate = Date.now();
        console.log("✅ ProfileService - Profile updated and cached");
        return response.data;
      } else {
        console.error(
          "❌ ProfileService - Failed to update profile:",
          response.error,
        );
        return null;
      }
    } catch (error) {
      console.error("❌ ProfileService - Error updating profile:", error);
      return null;
    }
  }

  /**
   * Update FTP with timestamp
   */
  static async updateFTP(ftp: number): Promise<Profile | null> {
    try {
      console.log("🌐 ProfileService - Updating FTP:", ftp);
      return await this.updateProfile({ ftpWatts: ftp });
    } catch (error) {
      console.error("❌ ProfileService - Error updating FTP:", error);
      return null;
    }
  }

  /**
   * Update threshold heart rate with timestamp
   */
  static async updateThresholdHR(
    maxHR: number,
    restingHR?: number,
  ): Promise<Profile | null> {
    try {
      console.log("🌐 ProfileService - Updating HR thresholds:", {
        maxHR,
        restingHR,
      });
      const updates: Partial<Profile> = { maxHeartRate: maxHR };
      if (restingHR !== undefined) {
        updates.restingHeartRate = restingHR;
      }
      return await this.updateProfile(updates);
    } catch (error) {
      console.error("❌ ProfileService - Error updating threshold HR:", error);
      return null;
    }
  }

  /**
   * Get heart rate zones from Next.js API
   */
  static async getHeartRateZones() {
    try {
      console.log("🌐 ProfileService - Fetching HR zones from API");
      const response = await apiClient.getTrainingZones();

      if (response.success && response.data) {
        console.log("✅ ProfileService - HR zones retrieved successfully");
        return response.data.heartRateZones;
      } else {
        console.error(
          "❌ ProfileService - Failed to get HR zones:",
          response.error,
        );
        return null;
      }
    } catch (error) {
      console.error("❌ ProfileService - Error getting HR zones:", error);
      return null;
    }
  }

  /**
   * Get power zones from Next.js API
   */
  static async getPowerZones() {
    try {
      console.log("🌐 ProfileService - Fetching power zones from API");
      const response = await apiClient.getTrainingZones();

      if (response.success && response.data) {
        console.log("✅ ProfileService - Power zones retrieved successfully");
        return response.data.powerZones;
      } else {
        console.error(
          "❌ ProfileService - Failed to get power zones:",
          response.error,
        );
        return null;
      }
    } catch (error) {
      console.error("❌ ProfileService - Error getting power zones:", error);
      return null;
    }
  }

  /**
   * Update training zones
   */
  static async updateTrainingZones(zones: {
    maxHeartRate?: number;
    restingHeartRate?: number;
    ftpWatts?: number;
  }) {
    try {
      console.log("🌐 ProfileService - Updating training zones:", zones);
      const response = await apiClient.updateTrainingZones(zones);

      if (response.success) {
        // Clear cache to force refresh
        this.clearCache();
        console.log("✅ ProfileService - Training zones updated successfully");
        return response.data;
      } else {
        console.error(
          "❌ ProfileService - Failed to update zones:",
          response.error,
        );
        return null;
      }
    } catch (error) {
      console.error(
        "❌ ProfileService - Error updating training zones:",
        error,
      );
      return null;
    }
  }

  /**
   * Recalculate training zones
   */
  static async recalculateZones(params: {
    type: "heart_rate" | "power" | "both";
    maxHeartRate?: number;
    restingHeartRate?: number;
    ftpWatts?: number;
  }) {
    try {
      console.log("🌐 ProfileService - Recalculating zones:", params);
      const response = await apiClient.recalculateZones(params);

      if (response.success) {
        // Clear cache to force refresh
        this.clearCache();
        console.log("✅ ProfileService - Zones recalculated successfully");
        return response.data;
      } else {
        console.error(
          "❌ ProfileService - Failed to recalculate zones:",
          response.error,
        );
        return null;
      }
    } catch (error) {
      console.error("❌ ProfileService - Error recalculating zones:", error);
      return null;
    }
  }

  /**
   * Get profile statistics
   */
  static async getProfileStats(period: number = 30) {
    try {
      console.log(
        "🌐 ProfileService - Fetching profile stats for",
        period,
        "days",
      );
      const response = await apiClient.getProfileStats(period);

      if (response.success) {
        console.log("✅ ProfileService - Profile stats retrieved successfully");
        return response.data;
      } else {
        console.error(
          "❌ ProfileService - Failed to get profile stats:",
          response.error,
        );
        return null;
      }
    } catch (error) {
      console.error("❌ ProfileService - Error getting profile stats:", error);
      return null;
    }
  }

  /**
   * Get training load analysis
   */
  static async getTrainingLoadAnalysis(params?: {
    period?: number;
    projection?: number;
    includeProjection?: boolean;
  }) {
    try {
      console.log(
        "🌐 ProfileService - Fetching training load analysis:",
        params,
      );
      const response = await apiClient.getTrainingLoadAnalysis(params);

      if (response.success) {
        console.log(
          "✅ ProfileService - Training load analysis retrieved successfully",
        );
        return response.data;
      } else {
        console.error(
          "❌ ProfileService - Failed to get training load:",
          response.error,
        );
        return null;
      }
    } catch (error) {
      console.error("❌ ProfileService - Error getting training load:", error);
      return null;
    }
  }

  /**
   * Get performance trends
   */
  static async getPerformanceTrends(params?: {
    period?: number;
    sport?: string;
    metric?: string;
  }) {
    try {
      console.log("🌐 ProfileService - Fetching performance trends:", params);
      const response = await apiClient.getPerformanceTrends(params);

      if (response.success) {
        console.log(
          "✅ ProfileService - Performance trends retrieved successfully",
        );
        return response.data;
      } else {
        console.error(
          "❌ ProfileService - Failed to get performance trends:",
          response.error,
        );
        return null;
      }
    } catch (error) {
      console.error(
        "❌ ProfileService - Error getting performance trends:",
        error,
      );
      return null;
    }
  }

  /**
   * Clear profile cache
   */
  static clearCache(): void {
    console.log("🧹 ProfileService - Clearing profile cache");
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
      const hasBasicInfo = !!(profile.displayName && profile.weightKg);
      const hasTrainingMetrics = !!(profile.ftpWatts || profile.maxHeartRate);

      return hasBasicInfo && hasTrainingMetrics;
    } catch (error) {
      console.error(
        "❌ ProfileService - Error checking profile completeness:",
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
        profile.displayName,
        profile.weightKg,
        profile.gender,
        profile.ftpWatts,
        profile.maxHeartRate,
        profile.heightCm,
      ];

      const filledFields = fields.filter(
        (field) => field !== null && field !== undefined,
      ).length;
      progress = (filledFields / fields.length) * 100;

      return Math.round(progress);
    } catch (error) {
      console.error(
        "❌ ProfileService - Error calculating setup progress:",
        error,
      );
      return 0;
    }
  }

  /**
   * Validate authentication and profile access
   */
  static async validateAccess(): Promise<boolean> {
    try {
      const response = await apiClient.verifyAuth();
      return response.success;
    } catch (error) {
      console.error("❌ ProfileService - Auth validation failed:", error);
      return false;
    }
  }
}
