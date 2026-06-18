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
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: string
          target_id: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      announcement_dismissals: {
        Row: {
          announcement_id: string
          dismissed_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          dismissed_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          dismissed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_dismissals_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          body: string
          created_at: string
          expires_at: string | null
          id: string
          is_emergency: boolean
          leader_id: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_emergency?: boolean
          leader_id: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_emergency?: boolean
          leader_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          deposit_reversal_window_hours: number
          dual_approval_threshold_usd: number
          fx_rates: Json
          id: number
          member_daily_upkeep_cap_usd: number
          member_daily_withdrawal_cap_usd: number
          member_weekly_withdrawal_cap_usd: number
          updated_at: string
          usd_to_ngn: number
        }
        Insert: {
          deposit_reversal_window_hours?: number
          dual_approval_threshold_usd?: number
          fx_rates?: Json
          id?: number
          member_daily_upkeep_cap_usd?: number
          member_daily_withdrawal_cap_usd?: number
          member_weekly_withdrawal_cap_usd?: number
          updated_at?: string
          usd_to_ngn?: number
        }
        Update: {
          deposit_reversal_window_hours?: number
          dual_approval_threshold_usd?: number
          fx_rates?: Json
          id?: number
          member_daily_upkeep_cap_usd?: number
          member_daily_withdrawal_cap_usd?: number
          member_weekly_withdrawal_cap_usd?: number
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
      cron_failure_alerts: {
        Row: {
          alerted_at: string
          id: string
          jobid: number
          jobname: string | null
          runid: number
        }
        Insert: {
          alerted_at?: string
          id?: string
          jobid: number
          jobname?: string | null
          runid: number
        }
        Update: {
          alerted_at?: string
          id?: string
          jobid?: number
          jobname?: string | null
          runid?: number
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
          destination: Database["public"]["Enums"]["fund_destination"]
          frequency: Database["public"]["Enums"]["fund_frequency"] | null
          id: string
          kind: Database["public"]["Enums"]["fund_kind"]
          leader_id: string
          member_id: string | null
          name: string
          next_run_at: string | null
          target_rank: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount_ngn: number
          created_at?: string
          custom_days?: number | null
          description?: string | null
          destination?: Database["public"]["Enums"]["fund_destination"]
          frequency?: Database["public"]["Enums"]["fund_frequency"] | null
          id?: string
          kind: Database["public"]["Enums"]["fund_kind"]
          leader_id: string
          member_id?: string | null
          name: string
          next_run_at?: string | null
          target_rank?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount_ngn?: number
          created_at?: string
          custom_days?: number | null
          description?: string | null
          destination?: Database["public"]["Enums"]["fund_destination"]
          frequency?: Database["public"]["Enums"]["fund_frequency"] | null
          id?: string
          kind?: Database["public"]["Enums"]["fund_kind"]
          leader_id?: string
          member_id?: string | null
          name?: string
          next_run_at?: string | null
          target_rank?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_rules_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          id: string
          is_used: boolean | null
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
          is_used?: boolean | null
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
          is_used?: boolean | null
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
      leader_purse_ledger: {
        Row: {
          amount_usd: number
          created_at: string
          id: string
          kind: string
          leader_id: string
          note: string | null
        }
        Insert: {
          amount_usd: number
          created_at?: string
          id?: string
          kind: string
          leader_id: string
          note?: string | null
        }
        Update: {
          amount_usd?: number
          created_at?: string
          id?: string
          kind?: string
          leader_id?: string
          note?: string | null
        }
        Relationships: []
      }
      login_devices: {
        Row: {
          device_hash: string
          first_seen_at: string
          id: string
          label: string | null
          last_seen_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          device_hash: string
          first_seen_at?: string
          id?: string
          label?: string | null
          last_seen_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          device_hash?: string
          first_seen_at?: string
          id?: string
          label?: string | null
          last_seen_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      member_notes: {
        Row: {
          body: string
          created_at: string
          id: string
          leader_id: string
          member_id: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          leader_id: string
          member_id: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          leader_id?: string
          member_id?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_notes_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_notes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      member_status_log: {
        Row: {
          action: Database["public"]["Enums"]["member_status_action"]
          actor_id: string | null
          created_at: string
          effective_until: string | null
          id: string
          leader_id: string
          member_id: string
          reason: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["member_status_action"]
          actor_id?: string | null
          created_at?: string
          effective_until?: string | null
          id?: string
          leader_id: string
          member_id: string
          reason?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["member_status_action"]
          actor_id?: string | null
          created_at?: string
          effective_until?: string | null
          id?: string
          leader_id?: string
          member_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_status_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_status_log_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_status_log_member_id_fkey"
            columns: ["member_id"]
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
      office_ledger: {
        Row: {
          amount_ngn: number
          category: string | null
          created_at: string
          id: string
          kind: string
          leader_id: string
          note: string | null
          source_txn_id: string | null
        }
        Insert: {
          amount_ngn: number
          category?: string | null
          created_at?: string
          id?: string
          kind: string
          leader_id: string
          note?: string | null
          source_txn_id?: string | null
        }
        Update: {
          amount_ngn?: number
          category?: string | null
          created_at?: string
          id?: string
          kind?: string
          leader_id?: string
          note?: string | null
          source_txn_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "office_ledger_source_txn_id_fkey"
            columns: ["source_txn_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
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
          avatar_url: string | null
          balance_usd: number
          can_handle_funds: boolean
          created_at: string
          email: string | null
          finalized_at: string | null
          full_name: string
          gender: Database["public"]["Enums"]["gender_kind"] | null
          id: string
          leader_id: string | null
          locale: string
          payout_method: Database["public"]["Enums"]["payout_method_kind"]
          rank: string
          sponsor_id: string | null
          suspended_reason: string | null
          suspended_until: string | null
          terminated_at: string | null
          terminated_reason: string | null
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          avatar_url?: string | null
          balance_usd?: number
          can_handle_funds?: boolean
          created_at?: string
          email?: string | null
          finalized_at?: string | null
          full_name: string
          gender?: Database["public"]["Enums"]["gender_kind"] | null
          id: string
          leader_id?: string | null
          locale?: string
          payout_method?: Database["public"]["Enums"]["payout_method_kind"]
          rank?: string
          sponsor_id?: string | null
          suspended_reason?: string | null
          suspended_until?: string | null
          terminated_at?: string | null
          terminated_reason?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          avatar_url?: string | null
          balance_usd?: number
          can_handle_funds?: boolean
          created_at?: string
          email?: string | null
          finalized_at?: string | null
          full_name?: string
          gender?: Database["public"]["Enums"]["gender_kind"] | null
          id?: string
          leader_id?: string | null
          locale?: string
          payout_method?: Database["public"]["Enums"]["payout_method_kind"]
          rank?: string
          sponsor_id?: string | null
          suspended_reason?: string | null
          suspended_until?: string | null
          terminated_at?: string | null
          terminated_reason?: string | null
          updated_at?: string
          whatsapp_number?: string | null
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
      pv_logs: {
        Row: {
          created_at: string
          exchange_rate: number | null
          id: string
          member_id: string
          note: string | null
          period_month: string
          price_ngn: number | null
          price_usd: number
          pv: number
          txn_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          exchange_rate?: number | null
          id?: string
          member_id: string
          note?: string | null
          period_month: string
          price_ngn?: number | null
          price_usd?: number
          pv: number
          txn_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          exchange_rate?: number | null
          id?: string
          member_id?: string
          note?: string | null
          period_month?: string
          price_ngn?: number | null
          price_usd?: number
          pv?: number
          txn_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pv_logs_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pv_logs_txn_id_fkey"
            columns: ["txn_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      rank_upkeep_defaults: {
        Row: {
          amount_usd: number
          created_at: string
          custom_days: number | null
          frequency: Database["public"]["Enums"]["upkeep_frequency"]
          id: string
          leader_id: string
          rank: string
          updated_at: string
        }
        Insert: {
          amount_usd: number
          created_at?: string
          custom_days?: number | null
          frequency?: Database["public"]["Enums"]["upkeep_frequency"]
          id?: string
          leader_id: string
          rank: string
          updated_at?: string
        }
        Update: {
          amount_usd?: number
          created_at?: string
          custom_days?: number | null
          frequency?: Database["public"]["Enums"]["upkeep_frequency"]
          id?: string
          leader_id?: string
          rank?: string
          updated_at?: string
        }
        Relationships: []
      }
      resources: {
        Row: {
          body: string | null
          category: string | null
          created_at: string
          id: string
          kind: string
          leader_id: string
          storage_path: string | null
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          body?: string | null
          category?: string | null
          created_at?: string
          id?: string
          kind: string
          leader_id: string
          storage_path?: string | null
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          body?: string | null
          category?: string | null
          created_at?: string
          id?: string
          kind?: string
          leader_id?: string
          storage_path?: string | null
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resources_leader_id_fkey"
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
          parent_txn_id: string | null
          receipt_sha256: string | null
          request_id: string | null
          reversal_window_until: string | null
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
          parent_txn_id?: string | null
          receipt_sha256?: string | null
          request_id?: string | null
          reversal_window_until?: string | null
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
          parent_txn_id?: string | null
          receipt_sha256?: string | null
          request_id?: string | null
          reversal_window_until?: string | null
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
            foreignKeyName: "transactions_parent_txn_id_fkey"
            columns: ["parent_txn_id"]
            isOneToOne: false
            referencedRelation: "transactions"
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
      upkeep_dispensations: {
        Row: {
          acknowledged_at: string | null
          amount_usd: number
          created_at: string
          dispute_note: string | null
          id: string
          leader_id: string
          member_id: string
          note: string | null
          resolution_credit: boolean | null
          resolution_note: string | null
          resolved_at: string | null
          screenshot_path: string | null
          status: Database["public"]["Enums"]["upkeep_ack_status"]
          txn_id: string | null
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          amount_usd: number
          created_at?: string
          dispute_note?: string | null
          id?: string
          leader_id: string
          member_id: string
          note?: string | null
          resolution_credit?: boolean | null
          resolution_note?: string | null
          resolved_at?: string | null
          screenshot_path?: string | null
          status?: Database["public"]["Enums"]["upkeep_ack_status"]
          txn_id?: string | null
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          amount_usd?: number
          created_at?: string
          dispute_note?: string | null
          id?: string
          leader_id?: string
          member_id?: string
          note?: string | null
          resolution_credit?: boolean | null
          resolution_note?: string | null
          resolved_at?: string | null
          screenshot_path?: string | null
          status?: Database["public"]["Enums"]["upkeep_ack_status"]
          txn_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "upkeep_dispensations_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upkeep_dispensations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upkeep_dispensations_txn_id_fkey"
            columns: ["txn_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      upkeep_dispute_messages: {
        Row: {
          author_id: string
          body: string
          created_at: string
          dispensation_id: string
          id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          dispensation_id: string
          id?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          dispensation_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "upkeep_dispute_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upkeep_dispute_messages_dispensation_id_fkey"
            columns: ["dispensation_id"]
            isOneToOne: false
            referencedRelation: "upkeep_dispensations"
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
          cancelled_by_member: boolean
          created_at: string
          description: string
          first_approver_at: string | null
          first_approver_id: string | null
          id: string
          leader_id: string
          leader_note: string | null
          member_id: string
          receipt_sha256: string | null
          resolved_at: string | null
          second_approver_at: string | null
          second_approver_id: string | null
          snapshot_currency: string | null
          snapshot_local_amount: number | null
          snapshot_rate: number | null
          status: Database["public"]["Enums"]["withdrawal_status"]
        }
        Insert: {
          amount_usd: number
          cancelled_by_member?: boolean
          created_at?: string
          description: string
          first_approver_at?: string | null
          first_approver_id?: string | null
          id?: string
          leader_id: string
          leader_note?: string | null
          member_id: string
          receipt_sha256?: string | null
          resolved_at?: string | null
          second_approver_at?: string | null
          second_approver_id?: string | null
          snapshot_currency?: string | null
          snapshot_local_amount?: number | null
          snapshot_rate?: number | null
          status?: Database["public"]["Enums"]["withdrawal_status"]
        }
        Update: {
          amount_usd?: number
          cancelled_by_member?: boolean
          created_at?: string
          description?: string
          first_approver_at?: string | null
          first_approver_id?: string | null
          id?: string
          leader_id?: string
          leader_note?: string | null
          member_id?: string
          receipt_sha256?: string | null
          resolved_at?: string | null
          second_approver_at?: string | null
          second_approver_id?: string | null
          snapshot_currency?: string | null
          snapshot_local_amount?: number | null
          snapshot_rate?: number | null
          status?: Database["public"]["Enums"]["withdrawal_status"]
        }
        Relationships: [
          {
            foreignKeyName: "withdrawal_requests_first_approver_id_fkey"
            columns: ["first_approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "withdrawal_requests_second_approver_id_fkey"
            columns: ["second_approver_id"]
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
      acknowledge_upkeep: {
        Args: { _dispensation_id: string }
        Returns: string
      }
      anonymize_finalized_members: { Args: never; Returns: number }
      cancel_withdrawal_request: { Args: { _id: string }; Returns: undefined }
      check_cron_failures: { Args: never; Returns: undefined }
      create_managed_transaction: {
        Args: {
          _amount_usd: number
          _currency?: string
          _exchange_rate?: number
          _local_amount?: number
          _member_id: string
          _note?: string
          _parent_txn_id?: string
          _type: string
        }
        Returns: string
      }
      dispense_upkeep: {
        Args: {
          _amount_usd: number
          _member_id: string
          _note?: string
          _screenshot_path?: string
        }
        Returns: string
      }
      dispute_upkeep: {
        Args: { _dispensation_id: string; _reason: string }
        Returns: undefined
      }
      finalize_terminated_members: { Args: never; Returns: number }
      get_balance_as_of: {
        Args: { _as_of: string; _member_id: string }
        Returns: number
      }
      get_cron_health: {
        Args: never
        Returns: {
          active: boolean
          jobname: string
          last_end: string
          last_return: string
          last_start: string
          last_status: string
          schedule: string
        }[]
      }
      get_downline: {
        Args: { _root: string }
        Returns: {
          avatar_url: string
          balance_usd: number
          can_handle_funds: boolean
          created_at: string
          depth: number
          email: string
          full_name: string
          gender: Database["public"]["Enums"]["gender_kind"]
          id: string
          leader_id: string
          payout_method: string
          rank: string
          sponsor_id: string
          updated_at: string
          whatsapp_number: string
        }[]
      }
      get_leader_monthly_reconciliation: {
        Args: { _month_start: string }
        Returns: {
          adjustments_usd: number
          bank_fees_usd: number
          deposits_usd: number
          fund_deductions_usd: number
          office_expense_out_ngn: number
          office_support_in_ngn: number
          purse_credits_usd: number
          purse_debits_usd: number
          releases_usd: number
          team_balance_usd: number
          upkeep_acknowledged_usd: number
          upkeep_disputed_usd: number
          upkeep_pending_usd: number
          withdrawals_usd: number
        }[]
      }
      get_org_pending_withdrawals: {
        Args: { _root: string }
        Returns: {
          amount_usd: number
          created_at: string
          description: string
          id: string
          leader_id: string
          leader_name: string
          member_id: string
          member_name: string
          status: string
        }[]
      }
      get_org_subleader_summary: {
        Args: { _root: string }
        Returns: {
          leader_id: string
          leader_name: string
          office_balance_ngn: number
          pending_upkeep_count: number
          pending_withdrawal_count: number
          purse_balance_usd: number
        }[]
      }
      get_upline_safe: {
        Args: { _member: string }
        Returns: {
          avatar_url: string
          can_handle_funds: boolean
          depth: number
          full_name: string
          id: string
          rank: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_descendant_of: {
        Args: { _ancestor: string; _descendant: string }
        Returns: boolean
      }
      is_valid_rank: { Args: { _rank: string }; Returns: boolean }
      leader_adjust_balance: {
        Args: {
          _amount_usd: number
          _direction: string
          _member_id: string
          _reason: string
        }
        Returns: string
      }
      leader_override_rank: {
        Args: { _member_id: string; _new_rank: string; _reason: string }
        Returns: undefined
      }
      leader_purse_withdraw: {
        Args: { _amount_usd: number; _note?: string }
        Returns: string
      }
      log_admin_action: {
        Args: {
          _action: string
          _details: Json
          _target_id: string
          _target_user_id: string
        }
        Returns: undefined
      }
      log_pv_with_deduction: {
        Args: {
          _exchange_rate?: number
          _member_id: string
          _note?: string
          _period_month: string
          _price_ngn?: number
          _price_usd?: number
          _pv: number
        }
        Returns: string
      }
      nearest_fund_handler: { Args: { _start: string }; Returns: string }
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
      pardon_member: { Args: { _member_id: string }; Returns: undefined }
      preview_reparent_count: { Args: { _member_id: string }; Returns: number }
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
      reassign_members_from: { Args: { _old_leader: string }; Returns: number }
      recompute_fund_handlers: { Args: { _root: string }; Returns: undefined }
      record_login_device: {
        Args: { _hash: string; _label: string; _ua: string }
        Returns: boolean
      }
      record_office_expense: {
        Args: { _amount_ngn: number; _category: string; _note?: string }
        Returns: string
      }
      resolve_dispute: {
        Args: { _credit: boolean; _dispensation_id: string; _note: string }
        Returns: undefined
      }
      resolve_withdrawal_request:
        | {
            Args: {
              _currency?: string
              _exchange_rate?: number
              _id: string
              _local_amount?: number
              _note?: string
              _status: string
            }
            Returns: undefined
          }
        | {
            Args: {
              _currency?: string
              _exchange_rate?: number
              _id: string
              _local_amount?: number
              _note?: string
              _platform_fee_usd?: number
              _status: string
            }
            Returns: undefined
          }
      reverse_transaction: {
        Args: { _reason?: string; _txn_id: string }
        Returns: string
      }
      run_due_fund_rules: { Args: never; Returns: number }
      run_due_upkeep: { Args: never; Returns: number }
      set_transaction_receipt_hash: {
        Args: { _sha256: string; _txn_id: string }
        Returns: undefined
      }
      set_withdrawal_receipt_hash: {
        Args: { _id: string; _sha256: string }
        Returns: undefined
      }
      suspend_member: {
        Args: { _member_id: string; _reason?: string; _until: string }
        Returns: undefined
      }
      terminate_member: {
        Args: { _member_id: string; _reason?: string }
        Returns: undefined
      }
      undo_recent_deposit: { Args: { _txn_id: string }; Returns: string }
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
      fund_destination:
        | "office_support"
        | "team_leader"
        | "custom"
        | "member_upkeep"
      fund_frequency:
        | "one_time"
        | "weekly"
        | "biweekly"
        | "monthly"
        | "custom_days"
      fund_kind: "per_usd" | "fixed"
      gender_kind: "male" | "female" | "other" | "prefer_not_to_say"
      member_status_action:
        | "suspended"
        | "terminated"
        | "pardoned"
        | "finalized"
      notification_kind:
        | "request_new"
        | "request_resolved"
        | "deposit"
        | "fund_deduction"
        | "bank_updated"
        | "upkeep"
        | "generic"
        | "office"
        | "fund_rule_changed"
        | "fx_rate_changed"
      payout_method_kind: "bank_transfer" | "neolife_pv"
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
      upkeep_ack_status: "pending" | "acknowledged" | "disputed"
      upkeep_frequency:
        | "every_3_days"
        | "weekly"
        | "biweekly"
        | "monthly"
        | "custom_days"
      withdrawal_status:
        | "pending"
        | "approved"
        | "declined"
        | "awaiting_second_approval"
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
      fund_destination: [
        "office_support",
        "team_leader",
        "custom",
        "member_upkeep",
      ],
      fund_frequency: [
        "one_time",
        "weekly",
        "biweekly",
        "monthly",
        "custom_days",
      ],
      fund_kind: ["per_usd", "fixed"],
      gender_kind: ["male", "female", "other", "prefer_not_to_say"],
      member_status_action: [
        "suspended",
        "terminated",
        "pardoned",
        "finalized",
      ],
      notification_kind: [
        "request_new",
        "request_resolved",
        "deposit",
        "fund_deduction",
        "bank_updated",
        "upkeep",
        "generic",
        "office",
        "fund_rule_changed",
        "fx_rate_changed",
      ],
      payout_method_kind: ["bank_transfer", "neolife_pv"],
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
      upkeep_ack_status: ["pending", "acknowledged", "disputed"],
      upkeep_frequency: [
        "every_3_days",
        "weekly",
        "biweekly",
        "monthly",
        "custom_days",
      ],
      withdrawal_status: [
        "pending",
        "approved",
        "declined",
        "awaiting_second_approval",
      ],
    },
  },
} as const
