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
      accounts: {
        Row: {
          category: string | null
          code: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          qb_account_id: string | null
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
          qb_account_id?: string | null
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
          qb_account_id?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: []
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
      ai_transaction_memory: {
        Row: {
          accuracy_score: number | null
          confidence: number | null
          description_signature: string
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
          balance_after: number
          created_at: string | null
          created_by: string | null
          credit: number | null
          date: string
          debit: number | null
          description: string
          entry_type: string | null
          id: string
          requisition_id: string | null
          status: string | null
          voucher_id: string | null
        }
        Insert: {
          balance_after: number
          created_at?: string | null
          created_by?: string | null
          credit?: number | null
          date: string
          debit?: number | null
          description: string
          entry_type?: string | null
          id?: string
          requisition_id?: string | null
          status?: string | null
          voucher_id?: string | null
        }
        Update: {
          balance_after?: number
          created_at?: string | null
          created_by?: string | null
          credit?: number | null
          date?: string
          debit?: number | null
          description?: string
          entry_type?: string | null
          id?: string
          requisition_id?: string | null
          status?: string | null
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cashbook_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
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
          confirmed_at: string | null
          confirmed_by: string | null
          confirmed_change_amount: number | null
          confirmed_denominations: Json | null
          denominations: Json | null
          discrepancy_amount: number | null
          id: string
          issued_at: string | null
          requestor_signature: string | null
          requisition_id: string
          returned_denominations: Json | null
          total_prepared: number
        }
        Insert: {
          actual_change_amount?: number | null
          cashier_id: string
          cashier_signature?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_change_amount?: number | null
          confirmed_denominations?: Json | null
          denominations?: Json | null
          discrepancy_amount?: number | null
          id?: string
          issued_at?: string | null
          requestor_signature?: string | null
          requisition_id: string
          returned_denominations?: Json | null
          total_prepared: number
        }
        Update: {
          actual_change_amount?: number | null
          cashier_id?: string
          cashier_signature?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_change_amount?: number | null
          confirmed_denominations?: Json | null
          denominations?: Json | null
          discrepancy_amount?: number | null
          id?: string
          issued_at?: string | null
          requestor_signature?: string | null
          requisition_id?: string
          returned_denominations?: Json | null
          total_prepared?: number
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
          provider?: string
          realm_id?: string | null
          refresh_token?: string | null
          refresh_token_expires_at?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      line_items: {
        Row: {
          account_id: string | null
          actual_amount: number | null
          ai_confidence: number | null
          ai_suggested_account_id: string | null
          created_at: string | null
          description: string
          estimated_amount: number
          id: string
          quantity: number | null
          receipt_url: string | null
          requisition_id: string
          unit_price: number | null
          updated_at: string | null
        }
        Insert: {
          account_id?: string | null
          actual_amount?: number | null
          ai_confidence?: number | null
          ai_suggested_account_id?: string | null
          created_at?: string | null
          description: string
          estimated_amount: number
          id?: string
          quantity?: number | null
          receipt_url?: string | null
          requisition_id: string
          unit_price?: number | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string | null
          actual_amount?: number | null
          ai_confidence?: number | null
          ai_suggested_account_id?: string | null
          created_at?: string | null
          description?: string
          estimated_amount?: number
          id?: string
          quantity?: number | null
          receipt_url?: string | null
          requisition_id?: string
          unit_price?: number | null
          updated_at?: string | null
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
            foreignKeyName: "line_items_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "requisitions"
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
      requisitions: {
        Row: {
          actual_total: number | null
          created_at: string | null
          department: string | null
          description: string | null
          employee_id: string | null
          estimated_total: number
          id: string
          interest_rate: number | null
          loan_amount: number | null
          monthly_deduction: number | null
          qb_expense_id: string | null
          qb_sync_at: string | null
          qb_sync_error: string | null
          qb_sync_status: string | null
          reference_number: string | null
          repayment_period: number | null
          requestor_id: string
          staff_name: string | null
          status: string
          type: string | null
          updated_at: string | null
        }
        Insert: {
          actual_total?: number | null
          created_at?: string | null
          department?: string | null
          description?: string | null
          employee_id?: string | null
          estimated_total?: number
          id?: string
          interest_rate?: number | null
          loan_amount?: number | null
          monthly_deduction?: number | null
          qb_expense_id?: string | null
          qb_sync_at?: string | null
          qb_sync_error?: string | null
          qb_sync_status?: string | null
          reference_number?: string | null
          repayment_period?: number | null
          requestor_id: string
          staff_name?: string | null
          status: string
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          actual_total?: number | null
          created_at?: string | null
          department?: string | null
          description?: string | null
          employee_id?: string | null
          estimated_total?: number
          id?: string
          interest_rate?: number | null
          loan_amount?: number | null
          monthly_deduction?: number | null
          qb_expense_id?: string | null
          qb_sync_at?: string | null
          qb_sync_error?: string | null
          qb_sync_status?: string | null
          reference_number?: string | null
          repayment_period?: number | null
          requestor_id?: string
          staff_name?: string | null
          status?: string
          type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "requisitions_requestor_id_fkey"
            columns: ["requestor_id"]
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
          role: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          employee_id?: string | null
          id: string
          name: string
          role: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          employee_id?: string | null
          id?: string
          name?: string
          role?: string
          updated_at?: string | null
        }
        Relationships: []
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
          posted_at: string | null
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
          posted_at?: string | null
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
          posted_at?: string | null
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
