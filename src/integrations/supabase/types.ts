export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      breach_alerts: {
        Row: {
          breach_data: Json
          breach_date: string | null
          breach_source: string
          created_at: string
          id: string
          is_read: boolean
          monitored_subject_id: string
          user_id: string
        }
        Insert: {
          breach_data: Json
          breach_date?: string | null
          breach_source: string
          created_at?: string
          id?: string
          is_read?: boolean
          monitored_subject_id: string
          user_id: string
        }
        Update: {
          breach_data?: Json
          breach_date?: string | null
          breach_source?: string
          created_at?: string
          id?: string
          is_read?: boolean
          monitored_subject_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "breach_alerts_monitored_subject_id_fkey"
            columns: ["monitored_subject_id"]
            isOneToOne: false
            referencedRelation: "monitored_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      case_items: {
        Row: {
          case_id: string
          content: Json
          created_at: string
          id: string
          item_type: string
          screenshot_url: string | null
          source_investigation_id: string | null
          source_url: string | null
          tags: string[] | null
          title: string
          user_id: string
        }
        Insert: {
          case_id: string
          content: Json
          created_at?: string
          id?: string
          item_type: string
          screenshot_url?: string | null
          source_investigation_id?: string | null
          source_url?: string | null
          tags?: string[] | null
          title: string
          user_id: string
        }
        Update: {
          case_id?: string
          content?: Json
          created_at?: string
          id?: string
          item_type?: string
          screenshot_url?: string | null
          source_investigation_id?: string | null
          source_url?: string | null
          tags?: string[] | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_items_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_items_source_investigation_id_fkey"
            columns: ["source_investigation_id"]
            isOneToOne: false
            referencedRelation: "investigations"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      findings: {
        Row: {
          agent_type: string
          confidence_score: number | null
          created_at: string
          data: Json
          id: string
          investigation_id: string
          source: string
          verification_status: string | null
        }
        Insert: {
          agent_type: string
          confidence_score?: number | null
          created_at?: string
          data: Json
          id?: string
          investigation_id: string
          source: string
          verification_status?: string | null
        }
        Update: {
          agent_type?: string
          confidence_score?: number | null
          created_at?: string
          data?: Json
          id?: string
          investigation_id?: string
          source?: string
          verification_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "findings_investigation_id_fkey"
            columns: ["investigation_id"]
            isOneToOne: false
            referencedRelation: "investigations"
            referencedColumns: ["id"]
          },
        ]
      }
      investigations: {
        Row: {
          created_at: string
          id: string
          status: string
          target: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          status?: string
          target: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          status?: string
          target?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      monitored_subjects: {
        Row: {
          created_at: string
          id: string
          last_checked_at: string | null
          subject_type: string
          subject_value: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_checked_at?: string | null
          subject_type: string
          subject_value: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_checked_at?: string | null
          subject_type?: string
          subject_value?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_investigations: {
        Row: {
          created_at: string
          finding_id: string
          id: string
          investigation_id: string
          platform: string
          results: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          finding_id: string
          id?: string
          investigation_id: string
          platform: string
          results?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          finding_id?: string
          id?: string
          investigation_id?: string
          platform?: string
          results?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_investigations_finding_id_fkey"
            columns: ["finding_id"]
            isOneToOne: false
            referencedRelation: "findings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_investigations_investigation_id_fkey"
            columns: ["investigation_id"]
            isOneToOne: false
            referencedRelation: "investigations"
            referencedColumns: ["id"]
          },
        ]
      }
      sunbiz_verifications: {
        Row: {
          created_at: string
          entity_name: string
          entity_number: string
          id: string
          investigation_id: string
          notes: string | null
          status: string
          user_id: string
          verified_at: string
        }
        Insert: {
          created_at?: string
          entity_name: string
          entity_number: string
          id?: string
          investigation_id: string
          notes?: string | null
          status: string
          user_id: string
          verified_at?: string
        }
        Update: {
          created_at?: string
          entity_name?: string
          entity_number?: string
          id?: string
          investigation_id?: string
          notes?: string | null
          status?: string
          user_id?: string
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sunbiz_verifications_investigation_id_fkey"
            columns: ["investigation_id"]
            isOneToOne: false
            referencedRelation: "investigations"
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
      [_ in never]: never
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
    Enums: {},
  },
} as const
