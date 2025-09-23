export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      activities: {
        Row: {
          activity_type: Database["public"]["Enums"]["activity_type"];
          avg_cadence: number | null;
          avg_heart_rate: number | null;
          avg_power: number | null;
          avg_speed: number | null;
          created_at: string;
          distance: number | null;
          id: string;
          idx: number;
          if: number;
          local_file_path: string;
          max_cadence: number | null;
          max_heart_rate: number | null;
          max_speed: number | null;
          moving_time: number;
          name: string;
          normalized_power: number | null;
          notes: string | null;
          peak_power: number | null;
          profile_id: string;
          snapshot_ftp: number;
          snapshot_threshold_hr: number;
          snapshot_weight_kg: number;
          started_at: string;
          sync_status: Database["public"]["Enums"]["sync_status"];
          total_ascent: number | null;
          total_descent: number | null;
          total_time: number;
          tss: number;
        };
        Insert: {
          activity_type?: Database["public"]["Enums"]["activity_type"];
          avg_cadence?: number | null;
          avg_heart_rate?: number | null;
          avg_power?: number | null;
          avg_speed?: number | null;
          created_at?: string;
          distance?: number | null;
          id?: string;
          idx?: number;
          if: number;
          local_file_path: string;
          max_cadence?: number | null;
          max_heart_rate?: number | null;
          max_speed?: number | null;
          moving_time?: number;
          name: string;
          normalized_power?: number | null;
          notes?: string | null;
          peak_power?: number | null;
          profile_id: string;
          snapshot_ftp: number;
          snapshot_threshold_hr: number;
          snapshot_weight_kg: number;
          started_at: string;
          sync_status?: Database["public"]["Enums"]["sync_status"];
          total_ascent?: number | null;
          total_descent?: number | null;
          total_time?: number;
          tss: number;
        };
        Update: {
          activity_type?: Database["public"]["Enums"]["activity_type"];
          avg_cadence?: number | null;
          avg_heart_rate?: number | null;
          avg_power?: number | null;
          avg_speed?: number | null;
          created_at?: string;
          distance?: number | null;
          id?: string;
          idx?: number;
          if?: number;
          local_file_path?: string;
          max_cadence?: number | null;
          max_heart_rate?: number | null;
          max_speed?: number | null;
          moving_time?: number;
          name?: string;
          normalized_power?: number | null;
          notes?: string | null;
          peak_power?: number | null;
          profile_id?: string;
          snapshot_ftp?: number;
          snapshot_threshold_hr?: number;
          snapshot_weight_kg?: number;
          started_at?: string;
          sync_status?: Database["public"]["Enums"]["sync_status"];
          total_ascent?: number | null;
          total_descent?: number | null;
          total_time?: number;
          tss?: number;
        };
        Relationships: [
          {
            foreignKeyName: "activities_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      activity_streams: {
        Row: {
          activity_id: string;
          chunk_index: number;
          created_at: string;
          data: Json;
          data_type: Database["public"]["Enums"]["activity_metric_data_type"];
          id: string;
          original_size: number;
          type: Database["public"]["Enums"]["activity_metric"];
        };
        Insert: {
          activity_id: string;
          chunk_index?: number;
          created_at?: string;
          data: Json;
          data_type: Database["public"]["Enums"]["activity_metric_data_type"];
          id?: string;
          original_size: number;
          type: Database["public"]["Enums"]["activity_metric"];
        };
        Update: {
          activity_id?: string;
          chunk_index?: number;
          created_at?: string;
          data?: Json;
          data_type?: Database["public"]["Enums"]["activity_metric_data_type"];
          id?: string;
          original_size?: number;
          type?: Database["public"]["Enums"]["activity_metric"];
        };
        Relationships: [
          {
            foreignKeyName: "activity_streams_activity_id_fkey";
            columns: ["activity_id"];
            isOneToOne: false;
            referencedRelation: "activities";
            referencedColumns: ["id"];
          },
        ];
      };
      planned_activities: {
        Row: {
          activity_type: Database["public"]["Enums"]["activity_type"];
          completed_activity_id: string | null;
          created_at: string;
          description: string | null;
          estimated_distance: number | null;
          estimated_duration: number | null;
          estimated_tss: number | null;
          id: string;
          idx: number;
          name: string;
          profile_id: string | null;
          scheduled_date: string;
          structure: Json;
        };
        Insert: {
          activity_type: Database["public"]["Enums"]["activity_type"];
          completed_activity_id?: string | null;
          created_at?: string;
          description?: string | null;
          estimated_distance?: number | null;
          estimated_duration?: number | null;
          estimated_tss?: number | null;
          id?: string;
          idx?: number;
          name: string;
          profile_id?: string | null;
          scheduled_date: string;
          structure: Json;
        };
        Update: {
          activity_type?: Database["public"]["Enums"]["activity_type"];
          completed_activity_id?: string | null;
          created_at?: string;
          description?: string | null;
          estimated_distance?: number | null;
          estimated_duration?: number | null;
          estimated_tss?: number | null;
          id?: string;
          idx?: number;
          name?: string;
          profile_id?: string | null;
          scheduled_date?: string;
          structure?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "planned_activities_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          created_at: string;
          dob: string | null;
          ftp: number | null;
          gender: string | null;
          id: string;
          idx: number;
          language: string | null;
          onboarded: boolean | null;
          preferred_units: string | null;
          threshold_hr: number | null;
          username: string | null;
          weight_kg: number | null;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          dob?: string | null;
          ftp?: number | null;
          gender?: string | null;
          id: string;
          idx?: number;
          language?: string | null;
          onboarded?: boolean | null;
          preferred_units?: string | null;
          threshold_hr?: number | null;
          username?: string | null;
          weight_kg?: number | null;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          dob?: string | null;
          ftp?: number | null;
          gender?: string | null;
          id?: string;
          idx?: number;
          language?: string | null;
          onboarded?: boolean | null;
          preferred_units?: string | null;
          threshold_hr?: number | null;
          username?: string | null;
          weight_kg?: number | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
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
        | "temperature"
        | "gradient";
      activity_metric_data_type:
        | "float"
        | "boolean"
        | "string"
        | "integer"
        | "latlng";
      activity_type:
        | "outdoor_run"
        | "outdoor_bike"
        | "indoor_treadmill"
        | "indoor_strength"
        | "indoor_swim"
        | "other";
      sync_status: "local_only" | "synced";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

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
        "temperature",
        "gradient",
      ],
      activity_metric_data_type: [
        "float",
        "boolean",
        "string",
        "integer",
        "latlng",
      ],
      activity_type: [
        "outdoor_run",
        "outdoor_bike",
        "indoor_treadmill",
        "indoor_strength",
        "indoor_swim",
        "other",
      ],
      sync_status: ["local_only", "synced"],
    },
  },
} as const;
