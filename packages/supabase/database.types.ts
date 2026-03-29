export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

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
          activity_plan_id: string | null;
          aerobic_decoupling: number | null;
          avg_cadence: number | null;
          avg_heart_rate: number | null;
          avg_power: number | null;
          avg_speed_mps: number | null;
          avg_swolf: number | null;
          avg_temperature: number | null;
          calories: number | null;
          created_at: string;
          device_manufacturer: string | null;
          device_product: string | null;
          distance_meters: number;
          duration_seconds: number;
          efficiency_factor: number | null;
          elevation_gain_meters: number | null;
          elevation_loss_meters: number | null;
          external_id: string | null;
          finished_at: string;
          fit_file_path: string | null;
          fit_file_size: number | null;
          id: string;
          idx: number;
          import_file_type: string | null;
          import_original_file_name: string | null;
          import_source: string | null;
          is_private: boolean;
          laps: Json | null;
          likes_count: number | null;
          map_bounds: Json | null;
          max_cadence: number | null;
          max_heart_rate: number | null;
          max_power: number | null;
          max_speed_mps: number | null;
          moving_seconds: number;
          name: string;
          normalized_graded_speed_mps: number | null;
          normalized_power: number | null;
          normalized_speed_mps: number | null;
          notes: string | null;
          polyline: string | null;
          pool_length: number | null;
          profile_id: string;
          provider: Database["public"]["Enums"]["integration_provider"] | null;
          started_at: string;
          total_strokes: number | null;
          type: string;
          updated_at: string;
        };
        Insert: {
          activity_plan_id?: string | null;
          aerobic_decoupling?: number | null;
          avg_cadence?: number | null;
          avg_heart_rate?: number | null;
          avg_power?: number | null;
          avg_speed_mps?: number | null;
          avg_swolf?: number | null;
          avg_temperature?: number | null;
          calories?: number | null;
          created_at?: string;
          device_manufacturer?: string | null;
          device_product?: string | null;
          distance_meters?: number;
          duration_seconds?: number;
          efficiency_factor?: number | null;
          elevation_gain_meters?: number | null;
          elevation_loss_meters?: number | null;
          external_id?: string | null;
          finished_at: string;
          fit_file_path?: string | null;
          fit_file_size?: number | null;
          id?: string;
          idx?: number;
          import_file_type?: string | null;
          import_original_file_name?: string | null;
          import_source?: string | null;
          is_private?: boolean;
          laps?: Json | null;
          likes_count?: number | null;
          map_bounds?: Json | null;
          max_cadence?: number | null;
          max_heart_rate?: number | null;
          max_power?: number | null;
          max_speed_mps?: number | null;
          moving_seconds?: number;
          name: string;
          normalized_graded_speed_mps?: number | null;
          normalized_power?: number | null;
          normalized_speed_mps?: number | null;
          notes?: string | null;
          polyline?: string | null;
          pool_length?: number | null;
          profile_id: string;
          provider?: Database["public"]["Enums"]["integration_provider"] | null;
          started_at: string;
          total_strokes?: number | null;
          type: string;
          updated_at?: string;
        };
        Update: {
          activity_plan_id?: string | null;
          aerobic_decoupling?: number | null;
          avg_cadence?: number | null;
          avg_heart_rate?: number | null;
          avg_power?: number | null;
          avg_speed_mps?: number | null;
          avg_swolf?: number | null;
          avg_temperature?: number | null;
          calories?: number | null;
          created_at?: string;
          device_manufacturer?: string | null;
          device_product?: string | null;
          distance_meters?: number;
          duration_seconds?: number;
          efficiency_factor?: number | null;
          elevation_gain_meters?: number | null;
          elevation_loss_meters?: number | null;
          external_id?: string | null;
          finished_at?: string;
          fit_file_path?: string | null;
          fit_file_size?: number | null;
          id?: string;
          idx?: number;
          import_file_type?: string | null;
          import_original_file_name?: string | null;
          import_source?: string | null;
          is_private?: boolean;
          laps?: Json | null;
          likes_count?: number | null;
          map_bounds?: Json | null;
          max_cadence?: number | null;
          max_heart_rate?: number | null;
          max_power?: number | null;
          max_speed_mps?: number | null;
          moving_seconds?: number;
          name?: string;
          normalized_graded_speed_mps?: number | null;
          normalized_power?: number | null;
          normalized_speed_mps?: number | null;
          notes?: string | null;
          polyline?: string | null;
          pool_length?: number | null;
          profile_id?: string;
          provider?: Database["public"]["Enums"]["integration_provider"] | null;
          started_at?: string;
          total_strokes?: number | null;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activities_activity_plan_id_fkey";
            columns: ["activity_plan_id"];
            isOneToOne: false;
            referencedRelation: "activity_plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activities_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      activity_efforts: {
        Row: {
          activity_category: Database["public"]["Enums"]["activity_category"];
          activity_id: string | null;
          created_at: string;
          duration_seconds: number;
          effort_type: Database["public"]["Enums"]["effort_type"];
          id: string;
          profile_id: string;
          recorded_at: string;
          start_offset: number | null;
          unit: string;
          value: number;
        };
        Insert: {
          activity_category: Database["public"]["Enums"]["activity_category"];
          activity_id?: string | null;
          created_at?: string;
          duration_seconds: number;
          effort_type: Database["public"]["Enums"]["effort_type"];
          id?: string;
          profile_id: string;
          recorded_at: string;
          start_offset?: number | null;
          unit: string;
          value: number;
        };
        Update: {
          activity_category?: Database["public"]["Enums"]["activity_category"];
          activity_id?: string | null;
          created_at?: string;
          duration_seconds?: number;
          effort_type?: Database["public"]["Enums"]["effort_type"];
          id?: string;
          profile_id?: string;
          recorded_at?: string;
          start_offset?: number | null;
          unit?: string;
          value?: number;
        };
        Relationships: [
          {
            foreignKeyName: "activity_efforts_activity_id_fkey";
            columns: ["activity_id"];
            isOneToOne: false;
            referencedRelation: "activities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activity_efforts_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      activity_plans: {
        Row: {
          activity_category: Database["public"]["Enums"]["activity_category"];
          created_at: string;
          description: string;
          id: string;
          idx: number;
          import_external_id: string | null;
          import_provider: string | null;
          is_system_template: boolean;
          likes_count: number | null;
          name: string;
          notes: string | null;
          profile_id: string | null;
          route_id: string | null;
          structure: Json | null;
          template_visibility: string;
          updated_at: string;
          version: string;
        };
        Insert: {
          activity_category?: Database["public"]["Enums"]["activity_category"];
          created_at?: string;
          description: string;
          id?: string;
          idx?: number;
          import_external_id?: string | null;
          import_provider?: string | null;
          is_system_template?: boolean;
          likes_count?: number | null;
          name: string;
          notes?: string | null;
          profile_id?: string | null;
          route_id?: string | null;
          structure?: Json | null;
          template_visibility?: string;
          updated_at?: string;
          version?: string;
        };
        Update: {
          activity_category?: Database["public"]["Enums"]["activity_category"];
          created_at?: string;
          description?: string;
          id?: string;
          idx?: number;
          import_external_id?: string | null;
          import_provider?: string | null;
          is_system_template?: boolean;
          likes_count?: number | null;
          name?: string;
          notes?: string | null;
          profile_id?: string | null;
          route_id?: string | null;
          structure?: Json | null;
          template_visibility?: string;
          updated_at?: string;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activity_plans_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activity_plans_route_id_fkey";
            columns: ["route_id"];
            isOneToOne: false;
            referencedRelation: "activity_routes";
            referencedColumns: ["id"];
          },
        ];
      };
      activity_routes: {
        Row: {
          activity_category: Database["public"]["Enums"]["activity_category"];
          created_at: string;
          description: string | null;
          elevation_polyline: string | null;
          file_path: string;
          id: string;
          idx: number;
          likes_count: number | null;
          name: string;
          polyline: string;
          profile_id: string;
          source: string | null;
          total_ascent: number | null;
          total_descent: number | null;
          total_distance: number;
          updated_at: string;
        };
        Insert: {
          activity_category?: Database["public"]["Enums"]["activity_category"];
          created_at?: string;
          description?: string | null;
          elevation_polyline?: string | null;
          file_path: string;
          id?: string;
          idx?: number;
          likes_count?: number | null;
          name: string;
          polyline: string;
          profile_id: string;
          source?: string | null;
          total_ascent?: number | null;
          total_descent?: number | null;
          total_distance: number;
          updated_at?: string;
        };
        Update: {
          activity_category?: Database["public"]["Enums"]["activity_category"];
          created_at?: string;
          description?: string | null;
          elevation_polyline?: string | null;
          file_path?: string;
          id?: string;
          idx?: number;
          likes_count?: number | null;
          name?: string;
          polyline?: string;
          profile_id?: string;
          source?: string | null;
          total_ascent?: number | null;
          total_descent?: number | null;
          total_distance?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activity_routes_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      comments: {
        Row: {
          content: string;
          created_at: string | null;
          entity_id: string;
          entity_type: string;
          id: string;
          profile_id: string | null;
          updated_at: string | null;
        };
        Insert: {
          content: string;
          created_at?: string | null;
          entity_id: string;
          entity_type: string;
          id?: string;
          profile_id?: string | null;
          updated_at?: string | null;
        };
        Update: {
          content?: string;
          created_at?: string | null;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          profile_id?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "comments_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          activity_plan_id: string | null;
          all_day: boolean;
          created_at: string;
          description: string | null;
          ends_at: string | null;
          event_type: Database["public"]["Enums"]["event_type"];
          external_calendar_id: string | null;
          external_event_id: string | null;
          id: string;
          idx: number;
          integration_account_id: string | null;
          linked_activity_id: string | null;
          notes: string | null;
          occurrence_key: string;
          original_starts_at: string | null;
          profile_id: string;
          recurrence_rule: string | null;
          recurrence_timezone: string | null;
          schedule_batch_id: string | null;
          series_id: string | null;
          source_provider: string | null;
          starts_at: string;
          status: Database["public"]["Enums"]["event_status"];
          timezone: string;
          title: string;
          training_plan_id: string | null;
          updated_at: string;
          user_training_plan_id: string | null;
        };
        Insert: {
          activity_plan_id?: string | null;
          all_day?: boolean;
          created_at?: string;
          description?: string | null;
          ends_at?: string | null;
          event_type: Database["public"]["Enums"]["event_type"];
          external_calendar_id?: string | null;
          external_event_id?: string | null;
          id?: string;
          idx?: number;
          integration_account_id?: string | null;
          linked_activity_id?: string | null;
          notes?: string | null;
          occurrence_key?: string;
          original_starts_at?: string | null;
          profile_id: string;
          recurrence_rule?: string | null;
          recurrence_timezone?: string | null;
          schedule_batch_id?: string | null;
          series_id?: string | null;
          source_provider?: string | null;
          starts_at: string;
          status?: Database["public"]["Enums"]["event_status"];
          timezone?: string;
          title: string;
          training_plan_id?: string | null;
          updated_at?: string;
          user_training_plan_id?: string | null;
        };
        Update: {
          activity_plan_id?: string | null;
          all_day?: boolean;
          created_at?: string;
          description?: string | null;
          ends_at?: string | null;
          event_type?: Database["public"]["Enums"]["event_type"];
          external_calendar_id?: string | null;
          external_event_id?: string | null;
          id?: string;
          idx?: number;
          integration_account_id?: string | null;
          linked_activity_id?: string | null;
          notes?: string | null;
          occurrence_key?: string;
          original_starts_at?: string | null;
          profile_id?: string;
          recurrence_rule?: string | null;
          recurrence_timezone?: string | null;
          schedule_batch_id?: string | null;
          series_id?: string | null;
          source_provider?: string | null;
          starts_at?: string;
          status?: Database["public"]["Enums"]["event_status"];
          timezone?: string;
          title?: string;
          training_plan_id?: string | null;
          updated_at?: string;
          user_training_plan_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "events_activity_plan_id_fkey";
            columns: ["activity_plan_id"];
            isOneToOne: false;
            referencedRelation: "activity_plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_series_id_fkey";
            columns: ["series_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_training_plan_id_fkey";
            columns: ["training_plan_id"];
            isOneToOne: false;
            referencedRelation: "training_plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_user_training_plan_id_fkey";
            columns: ["user_training_plan_id"];
            isOneToOne: false;
            referencedRelation: "user_training_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      follows: {
        Row: {
          created_at: string | null;
          follower_id: string;
          following_id: string;
          status: string | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          follower_id: string;
          following_id: string;
          status?: string | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          follower_id?: string;
          following_id?: string;
          status?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey";
            columns: ["follower_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "follows_following_id_fkey";
            columns: ["following_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      integrations: {
        Row: {
          access_token: string;
          created_at: string;
          expires_at: string | null;
          external_id: string;
          id: string;
          idx: number;
          profile_id: string;
          provider: Database["public"]["Enums"]["integration_provider"];
          refresh_token: string | null;
          scope: string | null;
          updated_at: string;
        };
        Insert: {
          access_token: string;
          created_at?: string;
          expires_at?: string | null;
          external_id: string;
          id?: string;
          idx?: number;
          profile_id: string;
          provider: Database["public"]["Enums"]["integration_provider"];
          refresh_token?: string | null;
          scope?: string | null;
          updated_at?: string;
        };
        Update: {
          access_token?: string;
          created_at?: string;
          expires_at?: string | null;
          external_id?: string;
          id?: string;
          idx?: number;
          profile_id?: string;
          provider?: Database["public"]["Enums"]["integration_provider"];
          refresh_token?: string | null;
          scope?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "integrations_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      likes: {
        Row: {
          created_at: string | null;
          entity_id: string;
          entity_type: string | null;
          id: string;
          profile_id: string | null;
        };
        Insert: {
          created_at?: string | null;
          entity_id: string;
          entity_type?: string | null;
          id?: string;
          profile_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          entity_id?: string;
          entity_type?: string | null;
          id?: string;
          profile_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "likes_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          created_at: string;
          id: string;
          is_read: boolean;
          message: string;
          profile_id: string;
          title: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_read?: boolean;
          message: string;
          profile_id: string;
          title: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_read?: boolean;
          message?: string;
          profile_id?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      oauth_states: {
        Row: {
          created_at: string;
          expires_at: string;
          id: string;
          idx: number;
          mobile_redirect_uri: string;
          profile_id: string;
          provider: Database["public"]["Enums"]["integration_provider"];
          state: string;
        };
        Insert: {
          created_at?: string;
          expires_at: string;
          id?: string;
          idx?: number;
          mobile_redirect_uri: string;
          profile_id: string;
          provider: Database["public"]["Enums"]["integration_provider"];
          state: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          idx?: number;
          mobile_redirect_uri?: string;
          profile_id?: string;
          provider?: Database["public"]["Enums"]["integration_provider"];
          state?: string;
        };
        Relationships: [
          {
            foreignKeyName: "oauth_states_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_goals: {
        Row: {
          activity_category: string | null;
          created_at: string;
          id: string;
          milestone_event_id: string;
          priority: number;
          profile_id: string;
          target_payload: Json | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          activity_category?: string | null;
          created_at?: string;
          id?: string;
          milestone_event_id: string;
          priority?: number;
          profile_id: string;
          target_payload?: Json | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          activity_category?: string | null;
          created_at?: string;
          id?: string;
          milestone_event_id?: string;
          priority?: number;
          profile_id?: string;
          target_payload?: Json | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_goals_milestone_event_id_fkey";
            columns: ["milestone_event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profile_goals_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_metrics: {
        Row: {
          created_at: string;
          id: string;
          idx: number;
          metric_type: Database["public"]["Enums"]["profile_metric_type"];
          notes: string | null;
          profile_id: string;
          recorded_at: string;
          reference_activity_id: string | null;
          unit: string;
          updated_at: string;
          value: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          idx?: number;
          metric_type: Database["public"]["Enums"]["profile_metric_type"];
          notes?: string | null;
          profile_id: string;
          recorded_at: string;
          reference_activity_id?: string | null;
          unit: string;
          updated_at?: string;
          value: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          idx?: number;
          metric_type?: Database["public"]["Enums"]["profile_metric_type"];
          notes?: string | null;
          profile_id?: string;
          recorded_at?: string;
          reference_activity_id?: string | null;
          unit?: string;
          updated_at?: string;
          value?: number;
        };
        Relationships: [
          {
            foreignKeyName: "profile_metrics_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profile_metrics_reference_activity_id_fkey";
            columns: ["reference_activity_id"];
            isOneToOne: false;
            referencedRelation: "activities";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_training_settings: {
        Row: {
          profile_id: string;
          settings: Json;
          updated_at: string;
        };
        Insert: {
          profile_id: string;
          settings?: Json;
          updated_at?: string;
        };
        Update: {
          profile_id?: string;
          settings?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_training_settings_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: true;
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
          gender: string | null;
          id: string;
          idx: number;
          is_public: boolean | null;
          language: string | null;
          onboarded: boolean | null;
          preferred_units: string | null;
          updated_at: string;
          username: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          dob?: string | null;
          gender?: string | null;
          id: string;
          idx?: number;
          is_public?: boolean | null;
          language?: string | null;
          onboarded?: boolean | null;
          preferred_units?: string | null;
          updated_at?: string;
          username?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          dob?: string | null;
          gender?: string | null;
          id?: string;
          idx?: number;
          is_public?: boolean | null;
          language?: string | null;
          onboarded?: boolean | null;
          preferred_units?: string | null;
          updated_at?: string;
          username?: string | null;
        };
        Relationships: [];
      };
      synced_events: {
        Row: {
          created_at: string;
          event_id: string;
          external_id: string;
          id: string;
          idx: number;
          profile_id: string;
          provider: Database["public"]["Enums"]["integration_provider"];
          synced_at: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          event_id: string;
          external_id: string;
          id?: string;
          idx?: number;
          profile_id: string;
          provider: Database["public"]["Enums"]["integration_provider"];
          synced_at?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          external_id?: string;
          id?: string;
          idx?: number;
          profile_id?: string;
          provider?: Database["public"]["Enums"]["integration_provider"];
          synced_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "synced_events_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "synced_events_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      training_plans: {
        Row: {
          created_at: string;
          description: string | null;
          duration_hours: number | null;
          id: string;
          idx: number;
          is_public: boolean;
          is_system_template: boolean;
          likes_count: number | null;
          name: string;
          profile_id: string | null;
          sessions_per_week_target: number | null;
          structure: Json;
          template_visibility: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          duration_hours?: number | null;
          id?: string;
          idx?: number;
          is_public?: boolean;
          is_system_template?: boolean;
          likes_count?: number | null;
          name: string;
          profile_id?: string | null;
          sessions_per_week_target?: number | null;
          structure: Json;
          template_visibility?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          duration_hours?: number | null;
          id?: string;
          idx?: number;
          is_public?: boolean;
          is_system_template?: boolean;
          likes_count?: number | null;
          name?: string;
          profile_id?: string | null;
          sessions_per_week_target?: number | null;
          structure?: Json;
          template_visibility?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "training_plans_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_training_plans: {
        Row: {
          created_at: string;
          id: string;
          profile_id: string;
          snapshot_structure: Json | null;
          start_date: string;
          status: string;
          target_date: string | null;
          training_plan_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          profile_id: string;
          snapshot_structure?: Json | null;
          start_date: string;
          status?: string;
          target_date?: string | null;
          training_plan_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          profile_id?: string;
          snapshot_structure?: Json | null;
          start_date?: string;
          status?: string;
          target_date?: string | null;
          training_plan_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_training_plans_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_training_plans_training_plan_id_fkey";
            columns: ["training_plan_id"];
            isOneToOne: false;
            referencedRelation: "training_plans";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      delete_own_account: { Args: never; Returns: undefined };
      get_user_status: { Args: never; Returns: string };
    };
    Enums: {
      activity_category: "run" | "bike" | "swim" | "strength" | "other";
      effort_type: "power" | "speed";
      event_status: "scheduled" | "completed" | "cancelled";
      event_type: "planned_activity" | "rest_day" | "race" | "custom" | "imported";
      gender: "male" | "female" | "other";
      integration_provider: "strava" | "wahoo" | "trainingpeaks" | "garmin" | "zwift";
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
        | "lthr";
      training_effect_label: "recovery" | "base" | "tempo" | "threshold" | "vo2max";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

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
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
      activity_category: ["run", "bike", "swim", "strength", "other"],
      effort_type: ["power", "speed"],
      event_status: ["scheduled", "completed", "cancelled"],
      event_type: ["planned_activity", "rest_day", "race", "custom", "imported"],
      gender: ["male", "female", "other"],
      integration_provider: ["strava", "wahoo", "trainingpeaks", "garmin", "zwift"],
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
      training_effect_label: ["recovery", "base", "tempo", "threshold", "vo2max"],
    },
  },
} as const;
