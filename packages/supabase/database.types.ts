export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          average_cadence: number | null
          average_heart_rate: number | null
          average_power: number | null
          average_speed_mps: number | null
          calories_burned: number | null
          client_id: string
          cloud_storage_path: string | null
          created_at: string
          description: string | null
          device_id: string | null
          distance_meters: number | null
          duration_seconds: number | null
          elevation_gain_meters: number | null
          end_latitude: number | null
          end_longitude: number | null
          ended_at: string | null
          fit_file_checksum: string | null
          id: string
          last_sync_attempt: string | null
          local_file_size_bytes: number | null
          local_fit_file_path: string | null
          max_heart_rate: number | null
          max_power: number | null
          max_speed_mps: number | null
          name: string | null
          privacy: Database["public"]["Enums"]["privacy_level"]
          recorded_at: string
          sport: Database["public"]["Enums"]["sport_type"]
          start_latitude: number | null
          start_longitude: number | null
          started_at: string
          status: Database["public"]["Enums"]["activity_status"]
          sync_attempt_count: number | null
          sync_error_message: string | null
          sync_priority: number | null
          sync_status: Database["public"]["Enums"]["sync_status"]
          synced_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          average_cadence?: number | null
          average_heart_rate?: number | null
          average_power?: number | null
          average_speed_mps?: number | null
          calories_burned?: number | null
          client_id: string
          cloud_storage_path?: string | null
          created_at?: string
          description?: string | null
          device_id?: string | null
          distance_meters?: number | null
          duration_seconds?: number | null
          elevation_gain_meters?: number | null
          end_latitude?: number | null
          end_longitude?: number | null
          ended_at?: string | null
          fit_file_checksum?: string | null
          id?: string
          last_sync_attempt?: string | null
          local_file_size_bytes?: number | null
          local_fit_file_path?: string | null
          max_heart_rate?: number | null
          max_power?: number | null
          max_speed_mps?: number | null
          name?: string | null
          privacy?: Database["public"]["Enums"]["privacy_level"]
          recorded_at: string
          sport: Database["public"]["Enums"]["sport_type"]
          start_latitude?: number | null
          start_longitude?: number | null
          started_at: string
          status?: Database["public"]["Enums"]["activity_status"]
          sync_attempt_count?: number | null
          sync_error_message?: string | null
          sync_priority?: number | null
          sync_status?: Database["public"]["Enums"]["sync_status"]
          synced_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          average_cadence?: number | null
          average_heart_rate?: number | null
          average_power?: number | null
          average_speed_mps?: number | null
          calories_burned?: number | null
          client_id?: string
          cloud_storage_path?: string | null
          created_at?: string
          description?: string | null
          device_id?: string | null
          distance_meters?: number | null
          duration_seconds?: number | null
          elevation_gain_meters?: number | null
          end_latitude?: number | null
          end_longitude?: number | null
          ended_at?: string | null
          fit_file_checksum?: string | null
          id?: string
          last_sync_attempt?: string | null
          local_file_size_bytes?: number | null
          local_fit_file_path?: string | null
          max_heart_rate?: number | null
          max_power?: number | null
          max_speed_mps?: number | null
          name?: string | null
          privacy?: Database["public"]["Enums"]["privacy_level"]
          recorded_at?: string
          sport?: Database["public"]["Enums"]["sport_type"]
          start_latitude?: number | null
          start_longitude?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["activity_status"]
          sync_attempt_count?: number | null
          sync_error_message?: string | null
          sync_priority?: number | null
          sync_status?: Database["public"]["Enums"]["sync_status"]
          synced_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_sync_log: {
        Row: {
          activity_id: string | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          started_at: string
          success: boolean | null
          sync_operation: string
          user_id: string | null
        }
        Insert: {
          activity_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          started_at?: string
          success?: boolean | null
          sync_operation: string
          user_id?: string | null
        }
        Update: {
          activity_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          started_at?: string
          success?: boolean | null
          sync_operation?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_sync_log_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_sync_log_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "recent_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_sync_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_sync_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      device_sync_state: {
        Row: {
          created_at: string
          device_id: string
          device_name: string | null
          failed_activities_count: number | null
          id: string
          last_seen_at: string | null
          last_sync_at: string | null
          pending_activities_count: number | null
          platform: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          device_name?: string | null
          failed_activities_count?: number | null
          id?: string
          last_seen_at?: string | null
          last_sync_at?: string | null
          pending_activities_count?: number | null
          platform?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          device_name?: string | null
          failed_activities_count?: number | null
          id?: string
          last_seen_at?: string | null
          last_sync_at?: string | null
          pending_activities_count?: number | null
          platform?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_sync_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_sync_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          full_name: string | null
          id: string
          updated_at: string | null
          username: string | null
          website: string | null
        }
        Insert: {
          avatar_url?: string | null
          full_name?: string | null
          id: string
          updated_at?: string | null
          username?: string | null
          website?: string | null
        }
        Update: {
          avatar_url?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
          username?: string | null
          website?: string | null
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          achieved_at: string | null
          achieved_value: number | null
          achievement_type: Database["public"]["Enums"]["achievement_type"]
          activity_id: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          sport: Database["public"]["Enums"]["sport_type"] | null
          threshold_unit: string
          threshold_value: number
          user_id: string
        }
        Insert: {
          achieved_at?: string | null
          achieved_value?: number | null
          achievement_type: Database["public"]["Enums"]["achievement_type"]
          activity_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          sport?: Database["public"]["Enums"]["sport_type"] | null
          threshold_unit: string
          threshold_value: number
          user_id: string
        }
        Update: {
          achieved_at?: string | null
          achieved_value?: number | null
          achievement_type?: Database["public"]["Enums"]["achievement_type"]
          activity_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          sport?: Database["public"]["Enums"]["sport_type"] | null
          threshold_unit?: string
          threshold_value?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_achievements_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "recent_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_metrics: {
        Row: {
          average_distance_meters: number | null
          average_duration_seconds: number | null
          calculated_at: string
          id: string
          metric_type: Database["public"]["Enums"]["metric_type"]
          period_end: string
          period_start: string
          sport: Database["public"]["Enums"]["sport_type"] | null
          total_activities: number | null
          total_calories_burned: number | null
          total_distance_meters: number | null
          total_duration_seconds: number | null
          total_elevation_gain_meters: number | null
          user_id: string
        }
        Insert: {
          average_distance_meters?: number | null
          average_duration_seconds?: number | null
          calculated_at?: string
          id?: string
          metric_type: Database["public"]["Enums"]["metric_type"]
          period_end: string
          period_start: string
          sport?: Database["public"]["Enums"]["sport_type"] | null
          total_activities?: number | null
          total_calories_burned?: number | null
          total_distance_meters?: number | null
          total_duration_seconds?: number | null
          total_elevation_gain_meters?: number | null
          user_id: string
        }
        Update: {
          average_distance_meters?: number | null
          average_duration_seconds?: number | null
          calculated_at?: string
          id?: string
          metric_type?: Database["public"]["Enums"]["metric_type"]
          period_end?: string
          period_start?: string
          sport?: Database["public"]["Enums"]["sport_type"] | null
          total_activities?: number | null
          total_calories_burned?: number | null
          total_distance_meters?: number | null
          total_duration_seconds?: number | null
          total_elevation_gain_meters?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_metrics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_metrics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          clerk_user_id: string
          created_at: string
          device_id: string | null
          email: string
          full_name: string | null
          id: string
          last_sync_at: string | null
          preferred_units: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          clerk_user_id: string
          created_at?: string
          device_id?: string | null
          email: string
          full_name?: string | null
          id?: string
          last_sync_at?: string | null
          preferred_units?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          clerk_user_id?: string
          created_at?: string
          device_id?: string | null
          email?: string
          full_name?: string | null
          id?: string
          last_sync_at?: string | null
          preferred_units?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      recent_activities: {
        Row: {
          avatar_url: string | null
          distance_meters: number | null
          duration_seconds: number | null
          id: string | null
          name: string | null
          privacy: Database["public"]["Enums"]["privacy_level"] | null
          sport: Database["public"]["Enums"]["sport_type"] | null
          started_at: string | null
          sync_status: Database["public"]["Enums"]["sync_status"] | null
          user_name: string | null
        }
        Relationships: []
      }
      user_dashboard: {
        Row: {
          clerk_user_id: string | null
          device_last_sync: string | null
          failed_activities_count: number | null
          full_name: string | null
          id: string | null
          last_sync_at: string | null
          pending_activities_count: number | null
          preferred_units: string | null
          total_activities: number | null
          total_calories_burned: number | null
          total_distance_meters: number | null
          total_duration_seconds: number | null
          total_elevation_gain_meters: number | null
          week_activities: number | null
          week_distance: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      generate_sample_activities: {
        Args: { activity_count?: number; target_user_id: string }
        Returns: string
      }
      recalculate_user_metrics: {
        Args: { target_user_id: string }
        Returns: string
      }
      update_user_metrics: {
        Args: {
          metric_period: Database["public"]["Enums"]["metric_type"]
          target_sport?: Database["public"]["Enums"]["sport_type"]
          target_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      achievement_type:
        | "distance"
        | "duration"
        | "elevation"
        | "speed"
        | "consistency"
      activity_status: "recording" | "completed" | "cancelled"
      metric_type: "daily" | "weekly" | "monthly" | "yearly" | "all_time"
      privacy_level: "private" | "friends" | "public"
      sport_type:
        | "cycling"
        | "running"
        | "walking"
        | "hiking"
        | "swimming"
        | "other"
      sync_status:
        | "local_only"
        | "pending_sync"
        | "syncing"
        | "synced"
        | "sync_failed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      achievement_type: [
        "distance",
        "duration",
        "elevation",
        "speed",
        "consistency",
      ],
      activity_status: ["recording", "completed", "cancelled"],
      metric_type: ["daily", "weekly", "monthly", "yearly", "all_time"],
      privacy_level: ["private", "friends", "public"],
      sport_type: [
        "cycling",
        "running",
        "walking",
        "hiking",
        "swimming",
        "other",
      ],
      sync_status: [
        "local_only",
        "pending_sync",
        "syncing",
        "synced",
        "sync_failed",
      ],
    },
  },
} as const
