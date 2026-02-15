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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          id: string
          organization_id: string | null
          setting_key: string
          setting_value: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          organization_id?: string | null
          setting_key: string
          setting_value?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          organization_id?: string | null
          setting_key?: string
          setting_value?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          actions: Json | null
          auto_send: boolean | null
          conditions: Json | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string | null
          page_id: string | null
          trigger_config: Json | null
          trigger_type: string
          updated_at: string
        }
        Insert: {
          actions?: Json | null
          auto_send?: boolean | null
          conditions?: Json | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          organization_id?: string | null
          page_id?: string | null
          trigger_config?: Json | null
          trigger_type: string
          updated_at?: string
        }
        Update: {
          actions?: Json | null
          auto_send?: boolean | null
          conditions?: Json | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string | null
          page_id?: string | null
          trigger_config?: Json | null
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_rules_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "connected_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      connected_pages: {
        Row: {
          ai_comment_hint: string | null
          ai_comment_reply_enabled: boolean | null
          ai_debounce_seconds: number
          ai_description: string | null
          ai_enabled: boolean | null
          ai_followup_settings: Json | null
          ai_instructions: string | null
          auto_followup_messages: Json | null
          auto_reply_first_message: string | null
          auto_reply_followup: string | null
          auto_reply_keywords: Json | null
          auto_reply_messages: Json | null
          automation_enabled: boolean | null
          comment_auto_reply: string | null
          connected_by: string | null
          connection_status: string
          created_at: string
          id: string
          organization_id: string | null
          page_access_token: string
          page_id: string
          page_name: string
          page_picture_url: string | null
          product_description: string | null
          product_name: string | null
          token_expiry: string | null
          updated_at: string
        }
        Insert: {
          ai_comment_hint?: string | null
          ai_comment_reply_enabled?: boolean | null
          ai_debounce_seconds?: number
          ai_description?: string | null
          ai_enabled?: boolean | null
          ai_followup_settings?: Json | null
          ai_instructions?: string | null
          auto_followup_messages?: Json | null
          auto_reply_first_message?: string | null
          auto_reply_followup?: string | null
          auto_reply_keywords?: Json | null
          auto_reply_messages?: Json | null
          automation_enabled?: boolean | null
          comment_auto_reply?: string | null
          connected_by?: string | null
          connection_status?: string
          created_at?: string
          id?: string
          organization_id?: string | null
          page_access_token: string
          page_id: string
          page_name: string
          page_picture_url?: string | null
          product_description?: string | null
          product_name?: string | null
          token_expiry?: string | null
          updated_at?: string
        }
        Update: {
          ai_comment_hint?: string | null
          ai_comment_reply_enabled?: boolean | null
          ai_debounce_seconds?: number
          ai_description?: string | null
          ai_enabled?: boolean | null
          ai_followup_settings?: Json | null
          ai_instructions?: string | null
          auto_followup_messages?: Json | null
          auto_reply_first_message?: string | null
          auto_reply_followup?: string | null
          auto_reply_keywords?: Json | null
          auto_reply_messages?: Json | null
          automation_enabled?: boolean | null
          comment_auto_reply?: string | null
          connected_by?: string | null
          connection_status?: string
          created_at?: string
          id?: string
          organization_id?: string | null
          page_access_token?: string
          page_id?: string
          page_name?: string
          page_picture_url?: string | null
          product_description?: string | null
          product_name?: string | null
          token_expiry?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connected_pages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          ai_followup_next_at: string | null
          ai_followup_step: number | null
          assigned_to: string | null
          auto_followup_next_at: string | null
          auto_followup_step: number | null
          created_at: string
          deleted_at: string | null
          external_conversation_id: string
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          organization_id: string | null
          page_id: string
          participant_id: string | null
          participant_name: string | null
          participant_picture_url: string | null
          status: string
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          ai_followup_next_at?: string | null
          ai_followup_step?: number | null
          assigned_to?: string | null
          auto_followup_next_at?: string | null
          auto_followup_step?: number | null
          created_at?: string
          deleted_at?: string | null
          external_conversation_id: string
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          organization_id?: string | null
          page_id: string
          participant_id?: string | null
          participant_name?: string | null
          participant_picture_url?: string | null
          status?: string
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          ai_followup_next_at?: string | null
          ai_followup_step?: number | null
          assigned_to?: string | null
          auto_followup_next_at?: string | null
          auto_followup_step?: number | null
          created_at?: string
          deleted_at?: string | null
          external_conversation_id?: string
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          organization_id?: string | null
          page_id?: string
          participant_id?: string | null
          participant_name?: string | null
          participant_picture_url?: string | null
          status?: string
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "connected_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_logs: {
        Row: {
          conversation_id: string
          created_at: string
          followup_type: string
          id: string
          message_text: string | null
          organization_id: string | null
          page_id: string
          sent_at: string
          step_number: number
        }
        Insert: {
          conversation_id: string
          created_at?: string
          followup_type?: string
          id?: string
          message_text?: string | null
          organization_id?: string | null
          page_id: string
          sent_at?: string
          step_number?: number
        }
        Update: {
          conversation_id?: string
          created_at?: string
          followup_type?: string
          id?: string
          message_text?: string | null
          organization_id?: string | null
          page_id?: string
          sent_at?: string
          step_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "followup_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_logs_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "connected_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          conversation_id: string | null
          created_at: string
          followup_due_date: string | null
          full_name: string | null
          id: string
          last_message: string | null
          notes: string | null
          organization_id: string | null
          page_id: string | null
          phone: string | null
          product: string | null
          remark: string | null
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          conversation_id?: string | null
          created_at?: string
          followup_due_date?: string | null
          full_name?: string | null
          id?: string
          last_message?: string | null
          notes?: string | null
          organization_id?: string | null
          page_id?: string | null
          phone?: string | null
          product?: string | null
          remark?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          conversation_id?: string | null
          created_at?: string
          followup_due_date?: string | null
          full_name?: string | null
          id?: string
          last_message?: string | null
          notes?: string | null
          organization_id?: string | null
          page_id?: string | null
          phone?: string | null
          product?: string | null
          remark?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "connected_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          external_message_id: string | null
          id: string
          is_internal_note: boolean | null
          media_url: string | null
          message_type: string
          sender_type: string
          sent_by: string | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          external_message_id?: string | null
          id?: string
          is_internal_note?: boolean | null
          media_url?: string | null
          message_type?: string
          sender_type: string
          sent_by?: string | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          external_message_id?: string | null
          id?: string
          is_internal_note?: boolean | null
          media_url?: string | null
          message_type?: string
          sender_type?: string
          sent_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          max_pages: number
          max_team_members: number
          name: string
          owner_id: string
          plan: string
          rejected_reason: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          max_pages?: number
          max_team_members?: number
          name: string
          owner_id: string
          plan?: string
          rejected_reason?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          max_pages?: number
          max_team_members?: number
          name?: string
          owner_id?: string
          plan?: string
          rejected_reason?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reply_templates: {
        Row: {
          category: string
          content: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string | null
          placeholders: string[] | null
          updated_at: string
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          organization_id?: string | null
          placeholders?: string[] | null
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string | null
          placeholders?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reply_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_org_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_user_org_id: { Args: { _user_id: string }; Returns: string }
      get_user_org_status: { Args: { _user_id: string }; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "manager" | "agent"
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
      app_role: ["admin", "manager", "agent"],
    },
  },
} as const
