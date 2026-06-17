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
      accounting_rules: {
        Row: {
          conditions_json: Json | null
          confidence_score: number | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string | null
          pattern: string
          priority: number | null
          target_account_id: string | null
          updated_at: string | null
        }
        Insert: {
          conditions_json?: Json | null
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          organization_id?: string | null
          pattern: string
          priority?: number | null
          target_account_id?: string | null
          updated_at?: string | null
        }
        Update: {
          conditions_json?: Json | null
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string | null
          pattern?: string
          priority?: number | null
          target_account_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounting_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_rules_target_account_id_fkey"
            columns: ["target_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          category: string | null
          code: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string | null
          qb_account_id: string | null
          subtype: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          code: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          organization_id?: string | null
          qb_account_id?: string | null
          subtype?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          code?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string | null
          qb_account_id?: string | null
          subtype?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_classification_logs: {
        Row: {
          ai_intent: Json | null
          created_at: string | null
          final_account_id: string | null
          id: string
          line_item_index: number | null
          suggested_account_id: string | null
          transaction_id: string | null
          was_overridden: boolean | null
        }
        Insert: {
          ai_intent?: Json | null
          created_at?: string | null
          final_account_id?: string | null
          id?: string
          line_item_index?: number | null
          suggested_account_id?: string | null
          transaction_id?: string | null
          was_overridden?: boolean | null
        }
        Update: {
          ai_intent?: Json | null
          created_at?: string | null
          final_account_id?: string | null
          id?: string
          line_item_index?: number | null
          suggested_account_id?: string | null
          transaction_id?: string | null
          was_overridden?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_classification_logs_final_account_id_fkey"
            columns: ["final_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_classification_logs_suggested_account_id_fkey"
            columns: ["suggested_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_classification_logs_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "requisitions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_metrics: {
        Row: {
          ai_hits: number | null
          created_at: string | null
          date: string | null
          id: string
          low_confidence_count: number | null
          memory_hits: number | null
          override_count: number | null
          prediction_count: number | null
          rule_hits: number | null
        }
        Insert: {
          ai_hits?: number | null
          created_at?: string | null
          date?: string | null
          id?: string
          low_confidence_count?: number | null
          memory_hits?: number | null
          override_count?: number | null
          prediction_count?: number | null
          rule_hits?: number | null
        }
        Update: {
          ai_hits?: number | null
          created_at?: string | null
          date?: string | null
          id?: string
          low_confidence_count?: number | null
          memory_hits?: number | null
          override_count?: number | null
          prediction_count?: number | null
          rule_hits?: number | null
        }
        Relationships: []
      }
      ai_transaction_memory: {
        Row: {
          accuracy_score: number | null
          confidence: number | null
          description_signature: string
          embedding: string | null
          id: string
          intent: Json
          last_used_at: string | null
          system_account_id: string | null
          usage_count: number | null
        }
        Insert: {
          accuracy_score?: number | null
          confidence?: number | null
          description_signature: string
          embedding?: string | null
          id?: string
          intent: Json
          last_used_at?: string | null
          system_account_id?: string | null
          usage_count?: number | null
        }
        Update: {
          accuracy_score?: number | null
          confidence?: number | null
          description_signature?: string
          embedding?: string | null
          id?: string
          intent?: Json
          last_used_at?: string | null
          system_account_id?: string | null
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_transaction_memory_system_account_id_fkey"
            columns: ["system_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          changes: Json | null
          entity_id: string
          entity_type: string
          id: string
          timestamp: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          changes?: Json | null
          entity_id: string
          entity_type: string
          id?: string
          timestamp?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          changes?: Json | null
          entity_id?: string
          entity_type?: string
          id?: string
          timestamp?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          amount: number
          created_at: string | null
          created_by: string | null
          end_date: string
          id: string
          organization_id: string
          period_type: string
          qb_account_id: string
          qb_account_name: string
          start_date: string
          updated_at: string | null
        }
        Insert: {
          amount?: number
          created_at?: string | null
          created_by?: string | null
          end_date: string
          id?: string
          organization_id: string
          period_type: string
          qb_account_id: string
          qb_account_name: string
          start_date: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          created_by?: string | null
          end_date?: string
          id?: string
          organization_id?: string
          period_type?: string
          qb_account_id?: string
          qb_account_name?: string
          start_date?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budgets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_inflows: {
        Row: {
          cashbook_entry_id: string
          contact_details: string | null
          created_at: string | null
          denominations: Json | null
          id: string
          person_name: string
          purpose: string
        }
        Insert: {
          cashbook_entry_id: string
          contact_details?: string | null
          created_at?: string | null
          denominations?: Json | null
          id?: string
          person_name: string
          purpose: string
        }
        Update: {
          cashbook_entry_id?: string
          contact_details?: string | null
          created_at?: string | null
          denominations?: Json | null
          id?: string
          person_name?: string
          purpose?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_inflows_cashbook_entry_id_fkey"
            columns: ["cashbook_entry_id"]
            isOneToOne: false
            referencedRelation: "cashbook_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      cashbook_entries: {
        Row: {
          account_id: string | null
          account_type: string | null
          balance_after: number
          created_at: string | null
          created_by: string | null
          credit: number | null
          date: string
          debit: number | null
          description: string
          entry_type: string | null
          external_reference: string | null
          id: string
          organization_id: string | null
          qb_deposit_id: string | null
          qb_purchase_id: string | null
          qb_sync_at: string | null
          qb_sync_error: string | null
          qb_sync_status: string | null
          reference_number: string | null
          requisition_id: string | null
          status: string | null
          voucher_id: string | null
          wallet_id: string | null
        }
        Insert: {
          account_id?: string | null
          account_type?: string | null
          balance_after: number
          created_at?: string | null
          created_by?: string | null
          credit?: number | null
          date: string
          debit?: number | null
          description: string
          entry_type?: string | null
          external_reference?: string | null
          id?: string
          organization_id?: string | null
          qb_deposit_id?: string | null
          qb_purchase_id?: string | null
          qb_sync_at?: string | null
          qb_sync_error?: string | null
          qb_sync_status?: string | null
          reference_number?: string | null
          requisition_id?: string | null
          status?: string | null
          voucher_id?: string | null
          wallet_id?: string | null
        }
        Update: {
          account_id?: string | null
          account_type?: string | null
          balance_after?: number
          created_at?: string | null
          created_by?: string | null
          credit?: number | null
          date?: string
          debit?: number | null
          description?: string
          entry_type?: string | null
          external_reference?: string | null
          id?: string
          organization_id?: string | null
          qb_deposit_id?: string | null
          qb_purchase_id?: string | null
          qb_sync_at?: string | null
          qb_sync_error?: string | null
          qb_sync_status?: string | null
          reference_number?: string | null
          requisition_id?: string | null
          status?: string | null
          voucher_id?: string | null
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cashbook_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashbook_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashbook_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashbook_entries_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "requisitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashbook_entries_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashbook_entries_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "organization_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          code: string
          id: string
          is_active: boolean | null
          name: string
          qb_account_id: string | null
          type: string
        }
        Insert: {
          code: string
          id?: string
          is_active?: boolean | null
          name: string
          qb_account_id?: string | null
          type: string
        }
        Update: {
          code?: string
          id?: string
          is_active?: boolean | null
          name?: string
          qb_account_id?: string | null
          type?: string
        }
        Relationships: []
      }
      disbursements: {
        Row: {
          actual_change_amount: number | null
          cashier_id: string
          cashier_signature: string | null
          change_external_reference: string | null
          change_submission_method: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          confirmed_change_amount: number | null
          confirmed_denominations: Json | null
          denominations: Json | null
          discrepancy_amount: number | null
          external_reference: string | null
          id: string
          issued_at: string | null
          line_item_id: string | null
          organization_id: string | null
          payment_method: string | null
          recipient_account: string | null
          recipient_account_name: string | null
          recipient_bank_code: string | null
          requestor_signature: string | null
          requisition_id: string
          returned_denominations: Json | null
          total_prepared: number
          transfer_proof_url: string | null
        }
        Insert: {
          actual_change_amount?: number | null
          cashier_id: string
          cashier_signature?: string | null
          change_external_reference?: string | null
          change_submission_method?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_change_amount?: number | null
          confirmed_denominations?: Json | null
          denominations?: Json | null
          discrepancy_amount?: number | null
          external_reference?: string | null
          id?: string
          issued_at?: string | null
          line_item_id?: string | null
          organization_id?: string | null
          payment_method?: string | null
          recipient_account?: string | null
          recipient_account_name?: string | null
          recipient_bank_code?: string | null
          requestor_signature?: string | null
          requisition_id: string
          returned_denominations?: Json | null
          total_prepared: number
          transfer_proof_url?: string | null
        }
        Update: {
          actual_change_amount?: number | null
          cashier_id?: string
          cashier_signature?: string | null
          change_external_reference?: string | null
          change_submission_method?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_change_amount?: number | null
          confirmed_denominations?: Json | null
          denominations?: Json | null
          discrepancy_amount?: number | null
          external_reference?: string | null
          id?: string
          issued_at?: string | null
          line_item_id?: string | null
          organization_id?: string | null
          payment_method?: string | null
          recipient_account?: string | null
          recipient_account_name?: string | null
          recipient_bank_code?: string | null
          requestor_signature?: string | null
          requisition_id?: string
          returned_denominations?: Json | null
          total_prepared?: number
          transfer_proof_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disbursements_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disbursements_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disbursements_line_item_id_fkey"
            columns: ["line_item_id"]
            isOneToOne: false
            referencedRelation: "line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disbursements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disbursements_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "requisitions"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          access_token: string | null
          config: Json | null
          created_at: string | null
          id: string
          organization_id: string | null
          provider: string
          realm_id: string | null
          refresh_token: string | null
          refresh_token_expires_at: string | null
          token_expires_at: string | null
          updated_at: string | null
        }
        Insert: {
          access_token?: string | null
          config?: Json | null
          created_at?: string | null
          id?: string
          organization_id?: string | null
          provider: string
          realm_id?: string | null
          refresh_token?: string | null
          refresh_token_expires_at?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string | null
          config?: Json | null
          created_at?: string | null
          id?: string
          organization_id?: string | null
          provider?: string
          realm_id?: string | null
          refresh_token?: string | null
          refresh_token_expires_at?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          entry_date: string
          id: string
          organization_id: string
          reference_number: string | null
          source_id: string | null
          source_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_date: string
          id?: string
          organization_id: string
          reference_number?: string | null
          source_id?: string | null
          source_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_date?: string
          id?: string
          organization_id?: string
          reference_number?: string | null
          source_id?: string | null
          source_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_id: string
          created_at: string
          credit: number
          debit: number
          description: string | null
          id: string
          journal_entry_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          journal_entry_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          journal_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      line_items: {
        Row: {
          account_id: string | null
          actual_amount: number | null
          ai_confidence: number | null
          ai_decision_path: string | null
          ai_extracted_amount: number | null
          ai_reasoning: string | null
          ai_risk_level: string | null
          ai_rule_id: string | null
          ai_similarity_score: number | null
          ai_suggested_account_id: string | null
          created_at: string | null
          description: string
          employee_id: string | null
          employee_name: string | null
          error_message: string | null
          estimated_amount: number
          id: string
          is_valid: boolean | null
          payment_method: string | null
          qb_account_id: string | null
          qb_account_name: string | null
          quantity: number | null
          receipt_ocr_data: Json | null
          receipt_ocr_status: string | null
          receipt_url: string | null
          recipient_account: string | null
          recipient_bank_code: string | null
          requisition_id: string
          unit_price: number | null
          updated_at: string | null
          verified_name: string | null
        }
        Insert: {
          account_id?: string | null
          actual_amount?: number | null
          ai_confidence?: number | null
          ai_decision_path?: string | null
          ai_extracted_amount?: number | null
          ai_reasoning?: string | null
          ai_risk_level?: string | null
          ai_rule_id?: string | null
          ai_similarity_score?: number | null
          ai_suggested_account_id?: string | null
          created_at?: string | null
          description: string
          employee_id?: string | null
          employee_name?: string | null
          error_message?: string | null
          estimated_amount: number
          id?: string
          is_valid?: boolean | null
          payment_method?: string | null
          qb_account_id?: string | null
          qb_account_name?: string | null
          quantity?: number | null
          receipt_ocr_data?: Json | null
          receipt_ocr_status?: string | null
          receipt_url?: string | null
          recipient_account?: string | null
          recipient_bank_code?: string | null
          requisition_id: string
          unit_price?: number | null
          updated_at?: string | null
          verified_name?: string | null
        }
        Update: {
          account_id?: string | null
          actual_amount?: number | null
          ai_confidence?: number | null
          ai_decision_path?: string | null
          ai_extracted_amount?: number | null
          ai_reasoning?: string | null
          ai_risk_level?: string | null
          ai_rule_id?: string | null
          ai_similarity_score?: number | null
          ai_suggested_account_id?: string | null
          created_at?: string | null
          description?: string
          employee_id?: string | null
          employee_name?: string | null
          error_message?: string | null
          estimated_amount?: number
          id?: string
          is_valid?: boolean | null
          payment_method?: string | null
          qb_account_id?: string | null
          qb_account_name?: string | null
          quantity?: number | null
          receipt_ocr_data?: Json | null
          receipt_ocr_status?: string | null
          receipt_url?: string | null
          recipient_account?: string | null
          recipient_bank_code?: string | null
          requisition_id?: string
          unit_price?: number | null
          updated_at?: string | null
          verified_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "line_items_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "line_items_ai_rule_id_fkey"
            columns: ["ai_rule_id"]
            isOneToOne: false
            referencedRelation: "accounting_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "line_items_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "requisitions"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_wallets: {
        Row: {
          created_at: string | null
          id: string
          is_main: boolean
          name: string
          organization_id: string
          qb_account_id: string | null
          qb_account_name: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_main?: boolean
          name: string
          organization_id: string
          qb_account_id?: string | null
          qb_account_name?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_main?: boolean
          name?: string
          organization_id?: string
          qb_account_id?: string | null
          qb_account_name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_wallets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          created_at: string | null
          email: string | null
          id: string
          lenco_public_key: string | null
          lenco_secret_key: string | null
          lenco_subaccount_id: string | null
          lenco_sync_cutoff_date: string | null
          logo_url: string | null
          name: string
          payment_test_mode: boolean | null
          phone: string | null
          slug: string
          tax_id: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          lenco_public_key?: string | null
          lenco_secret_key?: string | null
          lenco_subaccount_id?: string | null
          lenco_sync_cutoff_date?: string | null
          logo_url?: string | null
          name: string
          payment_test_mode?: boolean | null
          phone?: string | null
          slug: string
          tax_id?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          lenco_public_key?: string | null
          lenco_secret_key?: string | null
          lenco_subaccount_id?: string | null
          lenco_sync_cutoff_date?: string | null
          logo_url?: string | null
          name?: string
          payment_test_mode?: boolean | null
          phone?: string | null
          slug?: string
          tax_id?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      payment_links: {
        Row: {
          amount: number
          created_at: string | null
          created_by: string | null
          customer_name: string
          customer_phone: string
          id: string
          organization_id: string
          paid_at: string | null
          product_id: string
          reference: string | null
          status: string
          token: string
          wallet_id: string | null
        }
        Insert: {
          amount?: number
          created_at?: string | null
          created_by?: string | null
          customer_name: string
          customer_phone: string
          id?: string
          organization_id: string
          paid_at?: string | null
          product_id: string
          reference?: string | null
          status?: string
          token: string
          wallet_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          created_by?: string | null
          customer_name?: string
          customer_phone?: string
          id?: string
          organization_id?: string
          paid_at?: string | null
          product_id?: string
          reference?: string | null
          status?: string
          token?: string
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_links_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_links_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "organization_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      product_sales: {
        Row: {
          amount_paid: number
          created_at: string | null
          customer_name: string
          customer_phone: string
          id: string
          organization_id: string
          product_id: string
          quantity: number
          reference: string
          status: string
          updated_at: string | null
        }
        Insert: {
          amount_paid?: number
          created_at?: string | null
          customer_name: string
          customer_phone: string
          id?: string
          organization_id: string
          product_id: string
          quantity?: number
          reference: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          amount_paid?: number
          created_at?: string | null
          customer_name?: string
          customer_phone?: string
          id?: string
          organization_id?: string
          product_id?: string
          quantity?: number
          reference?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_sales_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_sales_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          income_account_id: string | null
          is_active: boolean | null
          name: string
          organization_id: string
          price: number
          product_type: string
          updated_at: string | null
          wallet_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          income_account_id?: string | null
          is_active?: boolean | null
          name: string
          organization_id: string
          price?: number
          product_type?: string
          updated_at?: string | null
          wallet_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          income_account_id?: string | null
          is_active?: boolean | null
          name?: string
          organization_id?: string
          price?: number
          product_type?: string
          updated_at?: string | null
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_income_account_id_fkey"
            columns: ["income_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "organization_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          file_url: string
          id: string
          line_item_id: string | null
          ocr_data: Json | null
          ocr_text: string | null
          requisition_id: string
          uploaded_at: string | null
          uploaded_by: string
        }
        Insert: {
          file_url: string
          id?: string
          line_item_id?: string | null
          ocr_data?: Json | null
          ocr_text?: string | null
          requisition_id: string
          uploaded_at?: string | null
          uploaded_by: string
        }
        Update: {
          file_url?: string
          id?: string
          line_item_id?: string | null
          ocr_data?: Json | null
          ocr_text?: string | null
          requisition_id?: string
          uploaded_at?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipts_line_item_id_fkey"
            columns: ["line_item_id"]
            isOneToOne: false
            referencedRelation: "line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "requisitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_counters: {
        Row: {
          entity_type: string
          last_value: number
          organization_id: string
          year: number
        }
        Insert: {
          entity_type: string
          last_value?: number
          organization_id: string
          year: number
        }
        Update: {
          entity_type?: string
          last_value?: number
          organization_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "reference_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      requisition_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          message_type: string
          metadata: Json | null
          requisition_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          message_type: string
          metadata?: Json | null
          requisition_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          message_type?: string
          metadata?: Json | null
          requisition_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "requisition_messages_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "requisitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisition_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      requisitions: {
        Row: {
          accounted_at: string | null
          actual_total: number | null
          audit_score: number | null
          audit_score_breakdown: Json | null
          created_at: string | null
          department: string | null
          description: string | null
          employee_id: string | null
          estimated_total: number
          has_unread_updates: boolean | null
          id: string
          interest_rate: number | null
          loan_amount: number | null
          monthly_deduction: number | null
          organization_id: string | null
          payment_method: string | null
          qb_expense_id: string | null
          qb_sync_at: string | null
          qb_sync_error: string | null
          qb_sync_status: string | null
          recipient_account: string | null
          recipient_bank_code: string | null
          recipient_name: string | null
          reference_number: string | null
          repayment_period: number | null
          requestor_id: string
          staff_name: string | null
          status: string
          type: string | null
          updated_at: string | null
          wallet_id: string | null
        }
        Insert: {
          accounted_at?: string | null
          actual_total?: number | null
          audit_score?: number | null
          audit_score_breakdown?: Json | null
          created_at?: string | null
          department?: string | null
          description?: string | null
          employee_id?: string | null
          estimated_total?: number
          has_unread_updates?: boolean | null
          id?: string
          interest_rate?: number | null
          loan_amount?: number | null
          monthly_deduction?: number | null
          organization_id?: string | null
          payment_method?: string | null
          qb_expense_id?: string | null
          qb_sync_at?: string | null
          qb_sync_error?: string | null
          qb_sync_status?: string | null
          recipient_account?: string | null
          recipient_bank_code?: string | null
          recipient_name?: string | null
          reference_number?: string | null
          repayment_period?: number | null
          requestor_id: string
          staff_name?: string | null
          status: string
          type?: string | null
          updated_at?: string | null
          wallet_id?: string | null
        }
        Update: {
          accounted_at?: string | null
          actual_total?: number | null
          audit_score?: number | null
          audit_score_breakdown?: Json | null
          created_at?: string | null
          department?: string | null
          description?: string | null
          employee_id?: string | null
          estimated_total?: number
          has_unread_updates?: boolean | null
          id?: string
          interest_rate?: number | null
          loan_amount?: number | null
          monthly_deduction?: number | null
          organization_id?: string | null
          payment_method?: string | null
          qb_expense_id?: string | null
          qb_sync_at?: string | null
          qb_sync_error?: string | null
          qb_sync_status?: string | null
          recipient_account?: string | null
          recipient_bank_code?: string | null
          recipient_name?: string | null
          reference_number?: string | null
          repayment_period?: number | null
          requestor_id?: string
          staff_name?: string | null
          status?: string
          type?: string | null
          updated_at?: string | null
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "requisitions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisitions_requestor_id_fkey"
            columns: ["requestor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisitions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "organization_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_logs: {
        Row: {
          created_at: string | null
          details: Json | null
          id: string
          qb_expense_id: string | null
          requisition_id: string | null
          status: string
          synced_by: string | null
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          id?: string
          qb_expense_id?: string | null
          requisition_id?: string | null
          status: string
          synced_by?: string | null
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          id?: string
          qb_expense_id?: string | null
          requisition_id?: string | null
          status?: string
          synced_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_logs_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "requisitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_logs_synced_by_fkey"
            columns: ["synced_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      twalumbu_recon_backup_20260615: {
        Row: {
          account_id: string | null
          account_type: string | null
          backed_up_at: string | null
          balance_after: number | null
          created_at: string | null
          created_by: string | null
          credit: number | null
          date: string | null
          debit: number | null
          description: string | null
          entry_type: string | null
          external_reference: string | null
          id: string | null
          organization_id: string | null
          qb_deposit_id: string | null
          qb_purchase_id: string | null
          qb_sync_at: string | null
          qb_sync_error: string | null
          qb_sync_status: string | null
          reference_number: string | null
          requisition_id: string | null
          status: string | null
          voucher_id: string | null
          wallet_id: string | null
        }
        Insert: {
          account_id?: string | null
          account_type?: string | null
          backed_up_at?: string | null
          balance_after?: number | null
          created_at?: string | null
          created_by?: string | null
          credit?: number | null
          date?: string | null
          debit?: number | null
          description?: string | null
          entry_type?: string | null
          external_reference?: string | null
          id?: string | null
          organization_id?: string | null
          qb_deposit_id?: string | null
          qb_purchase_id?: string | null
          qb_sync_at?: string | null
          qb_sync_error?: string | null
          qb_sync_status?: string | null
          reference_number?: string | null
          requisition_id?: string | null
          status?: string | null
          voucher_id?: string | null
          wallet_id?: string | null
        }
        Update: {
          account_id?: string | null
          account_type?: string | null
          backed_up_at?: string | null
          balance_after?: number | null
          created_at?: string | null
          created_by?: string | null
          credit?: number | null
          date?: string | null
          debit?: number | null
          description?: string | null
          entry_type?: string | null
          external_reference?: string | null
          id?: string | null
          organization_id?: string | null
          qb_deposit_id?: string | null
          qb_purchase_id?: string | null
          qb_sync_at?: string | null
          qb_sync_error?: string | null
          qb_sync_status?: string | null
          reference_number?: string | null
          requisition_id?: string | null
          status?: string | null
          voucher_id?: string | null
          wallet_id?: string | null
        }
        Relationships: []
      }
      user_organizations: {
        Row: {
          created_at: string | null
          employee_id: string | null
          id: string
          organization_id: string
          role: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          employee_id?: string | null
          id?: string
          organization_id: string
          role: string
          status: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          employee_id?: string | null
          id?: string
          organization_id?: string
          role?: string
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_organizations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_organizations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string | null
          email: string | null
          employee_id: string | null
          id: string
          name: string
          organization_id: string | null
          payment_info: Json | null
          role: string
          status: string | null
          updated_at: string | null
          username: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          employee_id?: string | null
          id: string
          name: string
          organization_id?: string | null
          payment_info?: Json | null
          role: string
          status?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          employee_id?: string | null
          id?: string
          name?: string
          organization_id?: string | null
          payment_info?: Json | null
          role?: string
          status?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_lines: {
        Row: {
          account_id: string
          credit: number | null
          debit: number | null
          description: string | null
          id: string
          voucher_id: string
        }
        Insert: {
          account_id: string
          credit?: number | null
          debit?: number | null
          description?: string | null
          id?: string
          voucher_id: string
        }
        Update: {
          account_id?: string
          credit?: number | null
          debit?: number | null
          description?: string | null
          id?: string
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_lines_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      vouchers: {
        Row: {
          created_at: string | null
          created_by: string
          id: string
          organization_id: string | null
          payment_account_id: string | null
          payment_account_name: string | null
          posted_at: string | null
          posted_by: string | null
          reference_number: string | null
          requisition_id: string | null
          status: string
          total_credit: number
          total_debit: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          id?: string
          organization_id?: string | null
          payment_account_id?: string | null
          payment_account_name?: string | null
          posted_at?: string | null
          posted_by?: string | null
          reference_number?: string | null
          requisition_id?: string | null
          status: string
          total_credit: number
          total_debit: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          id?: string
          organization_id?: string | null
          payment_account_id?: string | null
          payment_account_name?: string | null
          posted_at?: string | null
          posted_by?: string | null
          reference_number?: string | null
          requisition_id?: string | null
          status?: string
          total_credit?: number
          total_debit?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "requisitions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cashbook_entries_missing_journal: {
        Args: { p_organization_id: string }
        Returns: {
          id: string
        }[]
      }
      cashbook_entries_needing_repost: {
        Args: { p_organization_id: string }
        Returns: {
          id: string
        }[]
      }
      delete_organization_data: { Args: { org_id: string }; Returns: undefined }
      generate_sequential_reference: {
        Args: { p_entity_type: string; p_org_id: string; p_prefix: string }
        Returns: string
      }
      increment_daily_metric: {
        Args: { metric_column: string; target_date: string }
        Returns: undefined
      }
      increment_memory_usage: {
        Args: {
          acc_id: string
          conf: number
          intent_data: Json
          signature: string
        }
        Returns: undefined
      }
      match_ai_memory: {
        Args: {
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          confidence: number
          id: string
          similarity: number
          system_account_id: string
        }[]
      }
      recalculate_cashbook_balances: {
        Args: {
          p_account_type: string
          p_organization_id: string
          p_target_created_at: string
          p_target_date: string
          p_wallet_id?: string
        }
        Returns: undefined
      }
      report_account_balances: {
        Args: { p_end: string; p_org: string; p_start: string }
        Returns: {
          account_id: string
          account_name: string
          code: string
          cumulative_credit: number
          cumulative_debit: number
          cumulative_n: number
          period_credit: number
          period_debit: number
          period_n: number
          type: string
        }[]
      }
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
