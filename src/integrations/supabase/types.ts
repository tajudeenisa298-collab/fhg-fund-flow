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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          id: number
          updated_at: string
          usd_to_ngn: number
        }
        Insert: {
          id?: number
          updated_at?: string
          usd_to_ngn?: number
        }
        Update: {
          id?: number
          updated_at?: string
          usd_to_ngn?: number
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          account_number: string
          account_owner_name: string
          bank_code: string | null
          bank_name: string
          created_at: string
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          account_number: string
          account_owner_name: string
          bank_code?: string | null
          bank_name: string
          created_at?: string
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          account_number?: string
          account_owner_name?: string
          bank_code?: string | null
          bank_name?: string
          created_at?: string
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      fund_rules: {
        Row: {
          active: boolean
          amount_ngn: number
          created_at: string
          custom_days: number | null
          description: string | null
          frequency: Database["public"]["Enums"]["fund_frequency"] | null
          id: string
          kind: Database["public"]["Enums"]["fund_kind"]
          leader_id: string
          name: string
          next_run_at: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount_ngn: number
          created_at?: string
          custom_days?: number | null
          description?: string | null
          frequency?: Database["public"]["Enums"]["fund_frequency"] | null
          id?: string
          kind: Database["public"]["Enums"]["fund_kind"]
          leader_id: string
          name: string
          next_run_at?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount_ngn?: number
          created_at?: string
          custom_days?: number | null
          description?: string | null
          frequency?: Database["public"]["Enums"]["fund_frequency"] | null
          id?: string
          kind?: Database["public"]["Enums"]["fund_kind"]
          leader_id?: string
          name?: string
          next_run_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      invite_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          id: string
          leader_id: string
          revoked: boolean
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          expires_at?: string
          id?: string
          leader_id: string
          revoked?: boolean
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          leader_id?: string
          revoked?: boolean
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invite_codes_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_codes_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      paystack_banks: {
        Row: {
          active: boolean
          code: string
          fetched_at: string
          name: string
          slug: string | null
        }
        Insert: {
          active?: boolean
          code: string
          fetched_at?: string
          name: string
          slug?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          fetched_at?: string
          name?: string
          slug?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          balance_usd: number
          can_handle_funds: boolean
          created_at: string
          email: string | null
          full_name: string
          id: string
          leader_id: string | null
          rank: string
          updated_at: string
        }
        Insert: {
          balance_usd?: number
          can_handle_funds?: boolean
          created_at?: string
          email?: string | null
          full_name: string
          id: string
          leader_id?: string | null
          rank?: string
          updated_at?: string
        }
        Update: {
          balance_usd?: number
          can_handle_funds?: boolean
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          leader_id?: string | null
          rank?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount_usd: number
          created_at: string
          currency: string
          exchange_rate: number | null
          id: string
          leader_id: string | null
          local_amount: number | null
          member_id: string
          note: string | null
          request_id: string | null
          type: Database["public"]["Enums"]["txn_type"]
        }
        Insert: {
          amount_usd: number
          created_at?: string
          currency?: string
          exchange_rate?: number | null
          id?: string
          leader_id?: string | null
          local_amount?: number | null
          member_id: string
          note?: string | null
          request_id?: string | null
          type: Database["public"]["Enums"]["txn_type"]
        }
        Update: {
          amount_usd?: number
          created_at?: string
          currency?: string
          exchange_rate?: number | null
          id?: string
          leader_id?: string | null
          local_amount?: number | null
          member_id?: string
          note?: string | null
          request_id?: string | null
          type?: Database["public"]["Enums"]["txn_type"]
        }
        Relationships: [
          {
            foreignKeyName: "transactions_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "withdrawal_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      upkeep_plans: {
        Row: {
          active: boolean
          amount_usd: number
          created_at: string
          custom_days: number | null
          frequency: Database["public"]["Enums"]["upkeep_frequency"]
          id: string
          leader_id: string
          member_id: string
          next_run_at: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount_usd: number
          created_at?: string
          custom_days?: number | null
          frequency: Database["public"]["Enums"]["upkeep_frequency"]
          id?: string
          leader_id: string
          member_id: string
          next_run_at?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount_usd?: number
          created_at?: string
          custom_days?: number | null
          frequency?: Database["public"]["Enums"]["upkeep_frequency"]
          id?: string
          leader_id?: string
          member_id?: string
          next_run_at?: string
          updated_at?: string
        }
        Relationships: []
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
          role: Database["public"]["Enums"]["app_role"]
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
      withdrawal_requests: {
        Row: {
          amount_usd: number
          created_at: string
          description: string
          id: string
          leader_id: string
          leader_note: string | null
          member_id: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["withdrawal_status"]
        }
        Insert: {
          amount_usd: number
          created_at?: string
          description: string
          id?: string
          leader_id: string
          leader_note?: string | null
          member_id: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["withdrawal_status"]
        }
        Update: {
          amount_usd?: number
          created_at?: string
          description?: string
          id?: string
          leader_id?: string
          leader_note?: string | null
          member_id?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["withdrawal_status"]
        }
        Relationships: [
          {
            foreignKeyName: "withdrawal_requests_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawal_requests_member_id_fkey"
            columns: ["member_id"]
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      notify_user: {
        Args: {
          _body: string
          _kind: Database["public"]["Enums"]["notification_kind"]
          _link?: string
          _title: string
          _user_id: string
        }
        Returns: undefined
      }
      promote_member: {
        Args: {
          _grant_fund_handler?: boolean
          _member_id: string
          _new_rank: string
          _note?: string
        }
        Returns: undefined
      }
      promote_member_to_leader: {
        Args: { _member_id: string; _note?: string }
        Returns: undefined
      }
      run_due_fund_rules: { Args: never; Returns: number }
      run_due_upkeep: { Args: never; Returns: number }
      validate_invite_code: {
        Args: { _code: string }
        Returns: {
          leader_id: string
          leader_name: string
        }[]
      }
    }
    Enums: {
      app_role: "member" | "leader"
      fund_frequency:
        | "one_time"
        | "weekly"
        | "biweekly"
        | "monthly"
        | "custom_days"
      fund_kind: "per_usd" | "fixed"
      gender_kind: "male" | "female" | "other" | "prefer_not_to_say"
      notification_kind:
        | "request_new"
        | "request_resolved"
        | "deposit"
        | "fund_deduction"
        | "bank_updated"
        | "upkeep"
        | "generic"
        | "office"
      txn_type:
        | "deposit"
        | "withdrawal"
        | "release"
        | "adjustment"
        | "fund_deduction"
        | "bank_fee"
        | "office_credit"
        | "office_expense"
        | "leader_credit"
        | "leader_debit"
      upkeep_frequency:
        | "every_3_days"
        | "weekly"
        | "biweekly"
        | "monthly"
        | "custom_days"
      withdrawal_status: "pending" | "approved" | "declined"
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
      app_role: ["member", "leader"],
      fund_frequency: [
        "one_time",
        "weekly",
        "biweekly",
        "monthly",
        "custom_days",
      ],
      fund_kind: ["per_usd", "fixed"],
      gender_kind: ["male", "female", "other", "prefer_not_to_say"],
      notification_kind: [
        "request_new",
        "request_resolved",
        "deposit",
        "fund_deduction",
        "bank_updated",
        "upkeep",
        "generic",
        "office",
      ],
      txn_type: [
        "deposit",
        "withdrawal",
        "release",
        "adjustment",
        "fund_deduction",
        "bank_fee",
        "office_credit",
        "office_expense",
        "leader_credit",
        "leader_debit",
      ],
      upkeep_frequency: [
        "every_3_days",
        "weekly",
        "biweekly",
        "monthly",
        "custom_days",
      ],
      withdrawal_status: ["pending", "approved", "declined"],
    },
  },
} as const
