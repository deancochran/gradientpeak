export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activities: {
        Row: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          avg_cadence: number | null
          avg_grade: number | null
          avg_heart_rate: number | null
          avg_power: number | null
          avg_speed: number | null
          avg_temperature: number | null
          calories: number | null
          created_at: string
          decoupling: number | null
          distance: number
          efficiency_factor: number | null
          elapsed_time: number
          elevation_gain_per_km: number | null
          external_id: string | null
          finished_at: string
          hr_zone_1_time: number | null
          hr_zone_2_time: number | null
          hr_zone_3_time: number | null
          hr_zone_4_time: number | null
          hr_zone_5_time: number | null
          id: string
          idx: number
          intensity_factor: number | null
          is_private: boolean
          max_cadence: number | null
          max_heart_rate: number | null
          max_hr_pct_threshold: number | null
          max_power: number | null
          max_speed: number | null
          max_temperature: number | null
          moving_time: number
          name: string
          normalized_power: number | null
          notes: string | null
          planned_activity_id: string | null
          power_heart_rate_ratio: number | null
          power_weight_ratio: number | null
          power_zone_1_time: number | null
          power_zone_2_time: number | null
          power_zone_3_time: number | null
          power_zone_4_time: number | null
          power_zone_5_time: number | null
          power_zone_6_time: number | null
          power_zone_7_time: number | null
          profile_age: number | null
          profile_ftp: number | null
          profile_id: string
          profile_recovery_time: number | null
          profile_threshold_hr: number | null
          profile_training_load: number | null
          profile_weight_kg: number | null
          provider: Database["public"]["Enums"]["integration_provider"] | null
          started_at: string
          total_ascent: number
          total_descent: number
          total_work: number | null
          training_stress_score: number | null
          variability_index: number | null
          weather_condition: string | null
        }
        Insert: {
          activity_type?: Database["public"]["Enums"]["activity_type"]
          avg_cadence?: number | null
          avg_grade?: number | null
          avg_heart_rate?: number | null
          avg_power?: number | null
          avg_speed?: number | null
          avg_temperature?: number | null
          calories?: number | null
          created_at?: string
          decoupling?: number | null
          distance?: number
          efficiency_factor?: number | null
          elapsed_time: number
          elevation_gain_per_km?: number | null
          external_id?: string | null
          finished_at: string
          hr_zone_1_time?: number | null
          hr_zone_2_time?: number | null
          hr_zone_3_time?: number | null
          hr_zone_4_time?: number | null
          hr_zone_5_time?: number | null
          id?: string
          idx?: number
          intensity_factor?: number | null
          is_private?: boolean
          max_cadence?: number | null
          max_heart_rate?: number | null
          max_hr_pct_threshold?: number | null
          max_power?: number | null
          max_speed?: number | null
          max_temperature?: number | null
          moving_time: number
          name: string
          normalized_power?: number | null
          notes?: string | null
          planned_activity_id?: string | null
          power_heart_rate_ratio?: number | null
          power_weight_ratio?: number | null
          power_zone_1_time?: number | null
          power_zone_2_time?: number | null
          power_zone_3_time?: number | null
          power_zone_4_time?: number | null
          power_zone_5_time?: number | null
          power_zone_6_time?: number | null
          power_zone_7_time?: number | null
          profile_age?: number | null
          profile_ftp?: number | null
          profile_id: string
          profile_recovery_time?: number | null
          profile_threshold_hr?: number | null
          profile_training_load?: number | null
          profile_weight_kg?: number | null
          provider?: Database["public"]["Enums"]["integration_provider"] | null
          started_at: string
          total_ascent?: number
          total_descent?: number
          total_work?: number | null
          training_stress_score?: number | null
          variability_index?: number | null
          weather_condition?: string | null
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["activity_type"]
          avg_cadence?: number | null
          avg_grade?: number | null
          avg_heart_rate?: number | null
          avg_power?: number | null
          avg_speed?: number | null
          avg_temperature?: number | null
          calories?: number | null
          created_at?: string
          decoupling?: number | null
          distance?: number
          efficiency_factor?: number | null
          elapsed_time?: number
          elevation_gain_per_km?: number | null
          external_id?: string | null
          finished_at?: string
          hr_zone_1_time?: number | null
          hr_zone_2_time?: number | null
          hr_zone_3_time?: number | null
          hr_zone_4_time?: number | null
          hr_zone_5_time?: number | null
          id?: string
          idx?: number
          intensity_factor?: number | null
          is_private?: boolean
          max_cadence?: number | null
          max_heart_rate?: number | null
          max_hr_pct_threshold?: number | null
          max_power?: number | null
          max_speed?: number | null
          max_temperature?: number | null
          moving_time?: number
          name?: string
          normalized_power?: number | null
          notes?: string | null
          planned_activity_id?: string | null
          power_heart_rate_ratio?: number | null
          power_weight_ratio?: number | null
          power_zone_1_time?: number | null
          power_zone_2_time?: number | null
          power_zone_3_time?: number | null
          power_zone_4_time?: number | null
          power_zone_5_time?: number | null
          power_zone_6_time?: number | null
          power_zone_7_time?: number | null
          profile_age?: number | null
          profile_ftp?: number | null
          profile_id?: string
          profile_recovery_time?: number | null
          profile_threshold_hr?: number | null
          profile_training_load?: number | null
          profile_weight_kg?: number | null
          provider?: Database["public"]["Enums"]["integration_provider"] | null
          started_at?: string
          total_ascent?: number
          total_descent?: number
          total_work?: number | null
          training_stress_score?: number | null
          variability_index?: number | null
          weather_condition?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_planned_activity_id_fkey"
            columns: ["planned_activity_id"]
            isOneToOne: false
            referencedRelation: "planned_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_plans: {
        Row: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          created_at: string
          description: string
          estimated_duration: number
          estimated_tss: number
          id: string
          idx: number
          name: string
          profile_id: string
          structure: Json
          version: string
        }
        Insert: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          created_at?: string
          description: string
          estimated_duration: number
          estimated_tss: number
          id?: string
          idx?: number
          name: string
          profile_id: string
          structure: Json
          version?: string
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["activity_type"]
          created_at?: string
          description?: string
          estimated_duration?: number
          estimated_tss?: number
          id?: string
          idx?: number
          name?: string
          profile_id?: string
          structure?: Json
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_plans_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_streams: {
        Row: {
          activity_id: string
          avg_value: number | null
          compressed_timestamps: string
          compressed_values: string
          created_at: string
          data_type: Database["public"]["Enums"]["activity_metric_data_type"]
          id: string
          idx: number
          max_value: number | null
          min_value: number | null
          original_size: number
          sample_count: number
          type: Database["public"]["Enums"]["activity_metric"]
        }
        Insert: {
          activity_id: string
          avg_value?: number | null
          compressed_timestamps: string
          compressed_values: string
          created_at?: string
          data_type: Database["public"]["Enums"]["activity_metric_data_type"]
          id?: string
          idx?: number
          max_value?: number | null
          min_value?: number | null
          original_size: number
          sample_count: number
          type: Database["public"]["Enums"]["activity_metric"]
        }
        Update: {
          activity_id?: string
          avg_value?: number | null
          compressed_timestamps?: string
          compressed_values?: string
          created_at?: string
          data_type?: Database["public"]["Enums"]["activity_metric_data_type"]
          id?: string
          idx?: number
          max_value?: number | null
          min_value?: number | null
          original_size?: number
          sample_count?: number
          type?: Database["public"]["Enums"]["activity_metric"]
        }
        Relationships: [
          {
            foreignKeyName: "activity_streams_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string | null
          id: string
          idx: number
          profile_id: string
          provider: Database["public"]["Enums"]["integration_provider"]
          refresh_token: string | null
          scope: string | null
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at?: string | null
          id?: string
          idx?: number
          profile_id: string
          provider: Database["public"]["Enums"]["integration_provider"]
          refresh_token?: string | null
          scope?: string | null
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          idx?: number
          profile_id?: string
          provider?: Database["public"]["Enums"]["integration_provider"]
          refresh_token?: string | null
          scope?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integrations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_states: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          idx: number
          mobile_redirect_uri: string
          profile_id: string
          provider: Database["public"]["Enums"]["integration_provider"]
          state: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          idx?: number
          mobile_redirect_uri: string
          profile_id: string
          provider: Database["public"]["Enums"]["integration_provider"]
          state: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          idx?: number
          mobile_redirect_uri?: string
          profile_id?: string
          provider?: Database["public"]["Enums"]["integration_provider"]
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_states_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      planned_activities: {
        Row: {
          activity_plan_id: string
          created_at: string
          id: string
          idx: number
          notes: string | null
          profile_id: string
          scheduled_date: string
        }
        Insert: {
          activity_plan_id: string
          created_at?: string
          id?: string
          idx?: number
          notes?: string | null
          profile_id: string
          scheduled_date: string
        }
        Update: {
          activity_plan_id?: string
          created_at?: string
          id?: string
          idx?: number
          notes?: string | null
          profile_id?: string
          scheduled_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "planned_activities_activity_plan_id_fkey"
            columns: ["activity_plan_id"]
            isOneToOne: false
            referencedRelation: "activity_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_activities_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          dob: string | null
          ftp: number | null
          gender: string | null
          id: string
          idx: number
          language: string | null
          onboarded: boolean | null
          preferred_units: string | null
          threshold_hr: number | null
          username: string | null
          weight_kg: number | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          dob?: string | null
          ftp?: number | null
          gender?: string | null
          id: string
          idx?: number
          language?: string | null
          onboarded?: boolean | null
          preferred_units?: string | null
          threshold_hr?: number | null
          username?: string | null
          weight_kg?: number | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          dob?: string | null
          ftp?: number | null
          gender?: string | null
          id?: string
          idx?: number
          language?: string | null
          onboarded?: boolean | null
          preferred_units?: string | null
          threshold_hr?: number | null
          username?: string | null
          weight_kg?: number | null
        }
        Relationships: []
      }
      synced_planned_activities: {
        Row: {
          created_at: string
          external_workout_id: string
          id: string
          idx: number
          planned_activity_id: string
          profile_id: string
          provider: Database["public"]["Enums"]["integration_provider"]
          synced_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_workout_id: string
          id?: string
          idx?: number
          planned_activity_id: string
          profile_id: string
          provider: Database["public"]["Enums"]["integration_provider"]
          synced_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_workout_id?: string
          id?: string
          idx?: number
          planned_activity_id?: string
          profile_id?: string
          provider?: Database["public"]["Enums"]["integration_provider"]
          synced_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "synced_planned_activities_planned_activity_id_fkey"
            columns: ["planned_activity_id"]
            isOneToOne: false
            referencedRelation: "planned_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "synced_planned_activities_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      training_plans: {
        Row: {
          created_at: string
          description: string | null
          id: string
          idx: number
          is_active: boolean
          name: string
          profile_id: string
          structure: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          idx?: number
          is_active?: boolean
          name: string
          profile_id: string
          structure: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          idx?: number
          is_active?: boolean
          name?: string
          profile_id?: string
          structure?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_plans_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      activity_metric:
        | "heartrate"
        | "power"
        | "speed"
        | "cadence"
        | "distance"
        | "latlng"
        | "moving"
        | "altitude"
        | "elevation"
        | "temperature"
        | "gradient"
        | "heading"
      activity_metric_data_type: "float" | "latlng" | "boolean"
      activity_type:
        | "outdoor_run"
        | "outdoor_bike"
        | "indoor_treadmill"
        | "indoor_bike_trainer"
        | "indoor_strength"
        | "indoor_swim"
        | "other"
      integration_provider:
        | "strava"
        | "wahoo"
        | "trainingpeaks"
        | "garmin"
        | "zwift"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      activity_metric: [
        "heartrate",
        "power",
        "speed",
        "cadence",
        "distance",
        "latlng",
        "moving",
        "altitude",
        "elevation",
        "temperature",
        "gradient",
        "heading",
      ],
      activity_metric_data_type: ["float", "latlng", "boolean"],
      activity_type: [
        "outdoor_run",
        "outdoor_bike",
        "indoor_treadmill",
        "indoor_bike_trainer",
        "indoor_strength",
        "indoor_swim",
        "other",
      ],
      integration_provider: [
        "strava",
        "wahoo",
        "trainingpeaks",
        "garmin",
        "zwift",
      ],
    },
  },
} as const

