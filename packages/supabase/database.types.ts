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
          avg_target_adherence: number | null
          created_at: string
          distance_meters: number
          duration_seconds: number
          external_id: string | null
          finished_at: string
          hr_zone_seconds: number[] | null
          id: string
          idx: number
          is_private: boolean
          location: string | null
          metrics: Json
          moving_seconds: number
          name: string
          notes: string | null
          power_zone_seconds: number[] | null
          profile_id: string
          profile_snapshot: Json | null
          provider: Database["public"]["Enums"]["integration_provider"] | null
          route_id: string | null
          started_at: string
          type: string
          updated_at: string
        }
        Insert: {
          activity_plan_id?: string | null
          avg_target_adherence?: number | null
          created_at?: string
          distance_meters?: number
          duration_seconds?: number
          external_id?: string | null
          finished_at: string
          hr_zone_seconds?: number[] | null
          id?: string
          idx?: number
          is_private?: boolean
          location?: string | null
          metrics?: Json
          moving_seconds?: number
          name: string
          notes?: string | null
          power_zone_seconds?: number[] | null
          profile_id: string
          profile_snapshot?: Json | null
          provider?: Database["public"]["Enums"]["integration_provider"] | null
          route_id?: string | null
          started_at: string
          type: string
          updated_at?: string
        }
        Update: {
          activity_plan_id?: string | null
          avg_target_adherence?: number | null
          created_at?: string
          distance_meters?: number
          duration_seconds?: number
          external_id?: string | null
          finished_at?: string
          hr_zone_seconds?: number[] | null
          id?: string
          idx?: number
          is_private?: boolean
          location?: string | null
          metrics?: Json
          moving_seconds?: number
          name?: string
          notes?: string | null
          power_zone_seconds?: number[] | null
          profile_id?: string
          profile_snapshot?: Json | null
          provider?: Database["public"]["Enums"]["integration_provider"] | null
          route_id?: string | null
          started_at?: string
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
          {
            foreignKeyName: "activities_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "activity_routes"
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
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          dob: string | null
          ftp: number | null
          id: string
          idx: number
          language: string | null
          onboarded: boolean | null
          preferred_units: string | null
          threshold_hr: number | null
          updated_at: string
          username: string | null
          weight_kg: number | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          dob?: string | null
          ftp?: number | null
          id: string
          idx?: number
          language?: string | null
          onboarded?: boolean | null
          preferred_units?: string | null
          threshold_hr?: number | null
          updated_at?: string
          username?: string | null
          weight_kg?: number | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          dob?: string | null
          ftp?: number | null
          id?: string
          idx?: number
          language?: string | null
          onboarded?: boolean | null
          preferred_units?: string | null
          threshold_hr?: number | null
          updated_at?: string
          username?: string | null
          weight_kg?: number | null
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
      [_ in never]: never
    }
    Enums: {
      activity_category: "run" | "bike" | "swim" | "strength" | "other"
      activity_location: "outdoor" | "indoor"
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
      activity_category: ["run", "bike", "swim", "strength", "other"],
      activity_location: ["outdoor", "indoor"],
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

