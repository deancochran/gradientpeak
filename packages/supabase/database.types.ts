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
          activity_plan_id: string | null
          aerobic_decoupling: number | null
          avg_cadence: number | null
          avg_heart_rate: number | null
          avg_power: number | null
          avg_speed_mps: number | null
          avg_swolf: number | null
          avg_temperature: number | null
          calories: number | null
          created_at: string
          device_manufacturer: string | null
          device_product: string | null
          distance_meters: number
          duration_seconds: number
          efficiency_factor: number | null
          elevation_gain_meters: number | null
          elevation_loss_meters: number | null
          external_id: string | null
          finished_at: string
          fit_file_path: string | null
          fit_file_size: number | null
          hr_zone_1_seconds: number | null
          hr_zone_2_seconds: number | null
          hr_zone_3_seconds: number | null
          hr_zone_4_seconds: number | null
          hr_zone_5_seconds: number | null
          id: string
          idx: number
          intensity_factor: number | null
          is_private: boolean
          laps: Json | null
          location: string | null
          map_bounds: Json | null
          max_cadence: number | null
          max_heart_rate: number | null
          max_power: number | null
          max_speed_mps: number | null
          moving_seconds: number
          name: string
          normalized_graded_speed_mps: number | null
          normalized_power: number | null
          normalized_speed_mps: number | null
          notes: string | null
          polyline: string | null
          pool_length: number | null
          power_zone_1_seconds: number | null
          power_zone_2_seconds: number | null
          power_zone_3_seconds: number | null
          power_zone_4_seconds: number | null
          power_zone_5_seconds: number | null
          power_zone_6_seconds: number | null
          power_zone_7_seconds: number | null
          profile_id: string
          provider: Database["public"]["Enums"]["integration_provider"] | null
          started_at: string
          total_strokes: number | null
          training_effect:
            | Database["public"]["Enums"]["training_effect_label"]
            | null
          training_stress_score: number | null
          type: string
          updated_at: string
        }
        Insert: {
          activity_plan_id?: string | null
          aerobic_decoupling?: number | null
          avg_cadence?: number | null
          avg_heart_rate?: number | null
          avg_power?: number | null
          avg_speed_mps?: number | null
          avg_swolf?: number | null
          avg_temperature?: number | null
          calories?: number | null
          created_at?: string
          device_manufacturer?: string | null
          device_product?: string | null
          distance_meters?: number
          duration_seconds?: number
          efficiency_factor?: number | null
          elevation_gain_meters?: number | null
          elevation_loss_meters?: number | null
          external_id?: string | null
          finished_at: string
          fit_file_path?: string | null
          fit_file_size?: number | null
          hr_zone_1_seconds?: number | null
          hr_zone_2_seconds?: number | null
          hr_zone_3_seconds?: number | null
          hr_zone_4_seconds?: number | null
          hr_zone_5_seconds?: number | null
          id?: string
          idx?: number
          intensity_factor?: number | null
          is_private?: boolean
          laps?: Json | null
          location?: string | null
          map_bounds?: Json | null
          max_cadence?: number | null
          max_heart_rate?: number | null
          max_power?: number | null
          max_speed_mps?: number | null
          moving_seconds?: number
          name: string
          normalized_graded_speed_mps?: number | null
          normalized_power?: number | null
          normalized_speed_mps?: number | null
          notes?: string | null
          polyline?: string | null
          pool_length?: number | null
          power_zone_1_seconds?: number | null
          power_zone_2_seconds?: number | null
          power_zone_3_seconds?: number | null
          power_zone_4_seconds?: number | null
          power_zone_5_seconds?: number | null
          power_zone_6_seconds?: number | null
          power_zone_7_seconds?: number | null
          profile_id: string
          provider?: Database["public"]["Enums"]["integration_provider"] | null
          started_at: string
          total_strokes?: number | null
          training_effect?:
            | Database["public"]["Enums"]["training_effect_label"]
            | null
          training_stress_score?: number | null
          type: string
          updated_at?: string
        }
        Update: {
          activity_plan_id?: string | null
          aerobic_decoupling?: number | null
          avg_cadence?: number | null
          avg_heart_rate?: number | null
          avg_power?: number | null
          avg_speed_mps?: number | null
          avg_swolf?: number | null
          avg_temperature?: number | null
          calories?: number | null
          created_at?: string
          device_manufacturer?: string | null
          device_product?: string | null
          distance_meters?: number
          duration_seconds?: number
          efficiency_factor?: number | null
          elevation_gain_meters?: number | null
          elevation_loss_meters?: number | null
          external_id?: string | null
          finished_at?: string
          fit_file_path?: string | null
          fit_file_size?: number | null
          hr_zone_1_seconds?: number | null
          hr_zone_2_seconds?: number | null
          hr_zone_3_seconds?: number | null
          hr_zone_4_seconds?: number | null
          hr_zone_5_seconds?: number | null
          id?: string
          idx?: number
          intensity_factor?: number | null
          is_private?: boolean
          laps?: Json | null
          location?: string | null
          map_bounds?: Json | null
          max_cadence?: number | null
          max_heart_rate?: number | null
          max_power?: number | null
          max_speed_mps?: number | null
          moving_seconds?: number
          name?: string
          normalized_graded_speed_mps?: number | null
          normalized_power?: number | null
          normalized_speed_mps?: number | null
          notes?: string | null
          polyline?: string | null
          pool_length?: number | null
          power_zone_1_seconds?: number | null
          power_zone_2_seconds?: number | null
          power_zone_3_seconds?: number | null
          power_zone_4_seconds?: number | null
          power_zone_5_seconds?: number | null
          power_zone_6_seconds?: number | null
          power_zone_7_seconds?: number | null
          profile_id?: string
          provider?: Database["public"]["Enums"]["integration_provider"] | null
          started_at?: string
          total_strokes?: number | null
          training_effect?:
            | Database["public"]["Enums"]["training_effect_label"]
            | null
          training_stress_score?: number | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_activity_plan_id_fkey"
            columns: ["activity_plan_id"]
            isOneToOne: false
            referencedRelation: "activity_plans"
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
      activity_efforts: {
        Row: {
          activity_category: Database["public"]["Enums"]["activity_category"]
          activity_id: string
          created_at: string
          duration_seconds: number
          effort_type: Database["public"]["Enums"]["effort_type"]
          id: string
          profile_id: string
          recorded_at: string
          start_offset: number | null
          unit: string
          value: number
        }
        Insert: {
          activity_category: Database["public"]["Enums"]["activity_category"]
          activity_id: string
          created_at?: string
          duration_seconds: number
          effort_type: Database["public"]["Enums"]["effort_type"]
          id?: string
          profile_id: string
          recorded_at: string
          start_offset?: number | null
          unit: string
          value: number
        }
        Update: {
          activity_category?: Database["public"]["Enums"]["activity_category"]
          activity_id?: string
          created_at?: string
          duration_seconds?: number
          effort_type?: Database["public"]["Enums"]["effort_type"]
          id?: string
          profile_id?: string
          recorded_at?: string
          start_offset?: number | null
          unit?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "activity_efforts_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_efforts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_plans: {
        Row: {
          activity_category: Database["public"]["Enums"]["activity_category"]
          activity_location: Database["public"]["Enums"]["activity_location"]
          created_at: string
          description: string
          id: string
          idx: number
          is_system_template: boolean
          name: string
          notes: string | null
          profile_id: string | null
          route_id: string | null
          structure: Json | null
          updated_at: string
          version: string
        }
        Insert: {
          activity_category?: Database["public"]["Enums"]["activity_category"]
          activity_location?: Database["public"]["Enums"]["activity_location"]
          created_at?: string
          description: string
          id?: string
          idx?: number
          is_system_template?: boolean
          name: string
          notes?: string | null
          profile_id?: string | null
          route_id?: string | null
          structure?: Json | null
          updated_at?: string
          version?: string
        }
        Update: {
          activity_category?: Database["public"]["Enums"]["activity_category"]
          activity_location?: Database["public"]["Enums"]["activity_location"]
          created_at?: string
          description?: string
          id?: string
          idx?: number
          is_system_template?: boolean
          name?: string
          notes?: string | null
          profile_id?: string | null
          route_id?: string | null
          structure?: Json | null
          updated_at?: string
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
          {
            foreignKeyName: "activity_plans_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "activity_routes"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_routes: {
        Row: {
          activity_category: Database["public"]["Enums"]["activity_category"]
          created_at: string
          description: string | null
          elevation_polyline: string | null
          file_path: string
          id: string
          idx: number
          name: string
          polyline: string
          profile_id: string
          source: string | null
          total_ascent: number | null
          total_descent: number | null
          total_distance: number
          updated_at: string
        }
        Insert: {
          activity_category?: Database["public"]["Enums"]["activity_category"]
          created_at?: string
          description?: string | null
          elevation_polyline?: string | null
          file_path: string
          id?: string
          idx?: number
          name: string
          polyline: string
          profile_id: string
          source?: string | null
          total_ascent?: number | null
          total_descent?: number | null
          total_distance: number
          updated_at?: string
        }
        Update: {
          activity_category?: Database["public"]["Enums"]["activity_category"]
          created_at?: string
          description?: string | null
          elevation_polyline?: string | null
          file_path?: string
          id?: string
          idx?: number
          name?: string
          polyline?: string
          profile_id?: string
          source?: string | null
          total_ascent?: number | null
          total_descent?: number | null
          total_distance?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_routes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string | null
          external_id: string
          id: string
          idx: number
          profile_id: string
          provider: Database["public"]["Enums"]["integration_provider"]
          refresh_token: string | null
          scope: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at?: string | null
          external_id: string
          id?: string
          idx?: number
          profile_id: string
          provider: Database["public"]["Enums"]["integration_provider"]
          refresh_token?: string | null
          scope?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string | null
          external_id?: string
          id?: string
          idx?: number
          profile_id?: string
          provider?: Database["public"]["Enums"]["integration_provider"]
          refresh_token?: string | null
          scope?: string | null
          updated_at?: string
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
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          profile_id: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          profile_id: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          profile_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey"
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
          activity_plan_id: string | null
          created_at: string
          id: string
          idx: number
          notes: string | null
          profile_id: string
          scheduled_date: string
          training_plan_id: string | null
          updated_at: string
        }
        Insert: {
          activity_plan_id?: string | null
          created_at?: string
          id?: string
          idx?: number
          notes?: string | null
          profile_id: string
          scheduled_date: string
          training_plan_id?: string | null
          updated_at?: string
        }
        Update: {
          activity_plan_id?: string | null
          created_at?: string
          id?: string
          idx?: number
          notes?: string | null
          profile_id?: string
          scheduled_date?: string
          training_plan_id?: string | null
          updated_at?: string
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
          {
            foreignKeyName: "planned_activities_training_plan_id_fkey"
            columns: ["training_plan_id"]
            isOneToOne: false
            referencedRelation: "training_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_metrics: {
        Row: {
          created_at: string
          id: string
          idx: number
          metric_type: Database["public"]["Enums"]["profile_metric_type"]
          notes: string | null
          profile_id: string
          recorded_at: string
          reference_activity_id: string | null
          unit: string
          updated_at: string
          value: number
        }
        Insert: {
          created_at?: string
          id?: string
          idx?: number
          metric_type: Database["public"]["Enums"]["profile_metric_type"]
          notes?: string | null
          profile_id: string
          recorded_at: string
          reference_activity_id?: string | null
          unit: string
          updated_at?: string
          value: number
        }
        Update: {
          created_at?: string
          id?: string
          idx?: number
          metric_type?: Database["public"]["Enums"]["profile_metric_type"]
          notes?: string | null
          profile_id?: string
          recorded_at?: string
          reference_activity_id?: string | null
          unit?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "profile_metrics_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_metrics_reference_activity_id_fkey"
            columns: ["reference_activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
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
          id: string
          idx: number
          language: string | null
          onboarded: boolean | null
          preferred_units: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          dob?: string | null
          id: string
          idx?: number
          language?: string | null
          onboarded?: boolean | null
          preferred_units?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          dob?: string | null
          id?: string
          idx?: number
          language?: string | null
          onboarded?: boolean | null
          preferred_units?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      synced_planned_activities: {
        Row: {
          created_at: string
          external_id: string
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
          external_id: string
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
          external_id?: string
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
          is_system_template: boolean
          name: string
          profile_id: string | null
          structure: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          idx?: number
          is_active?: boolean
          is_system_template?: boolean
          name: string
          profile_id?: string | null
          structure: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          idx?: number
          is_active?: boolean
          is_system_template?: boolean
          name?: string
          profile_id?: string | null
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
      delete_own_account: { Args: never; Returns: undefined }
      get_user_status: { Args: never; Returns: string }
    }
    Enums: {
      activity_category: "run" | "bike" | "swim" | "strength" | "other"
      activity_location: "outdoor" | "indoor"
      effort_type: "power" | "speed"
      integration_provider:
        | "strava"
        | "wahoo"
        | "trainingpeaks"
        | "garmin"
        | "zwift"
      profile_metric_type:
        | "weight_kg"
        | "resting_hr"
        | "sleep_hours"
        | "hrv_rmssd"
        | "vo2_max"
        | "body_fat_percentage"
        | "hydration_level"
        | "stress_score"
        | "soreness_level"
        | "wellness_score"
        | "max_hr"
        | "lthr"
      training_effect_label:
        | "recovery"
        | "base"
        | "tempo"
        | "threshold"
        | "vo2max"
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
      activity_category: ["run", "bike", "swim", "strength", "other"],
      activity_location: ["outdoor", "indoor"],
      effort_type: ["power", "speed"],
      integration_provider: [
        "strava",
        "wahoo",
        "trainingpeaks",
        "garmin",
        "zwift",
      ],
      profile_metric_type: [
        "weight_kg",
        "resting_hr",
        "sleep_hours",
        "hrv_rmssd",
        "vo2_max",
        "body_fat_percentage",
        "hydration_level",
        "stress_score",
        "soreness_level",
        "wellness_score",
        "max_hr",
        "lthr",
      ],
      training_effect_label: [
        "recovery",
        "base",
        "tempo",
        "threshold",
        "vo2max",
      ],
    },
  },
} as const

