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
            cashbook_entries: {
                Row: {
                    balance_after: number
                    created_at: string | null
                    credit: number | null
                    date: string
                    debit: number | null
                    description: string
                    id: string
                    voucher_id: string | null
                }
                Insert: {
                    balance_after: number
                    created_at?: string | null
                    credit?: number | null
                    date: string
                    debit?: number | null
                    description: string
                    id?: string
                    voucher_id?: string | null
                }
                Update: {
                    balance_after?: number
                    created_at?: string | null
                    credit?: number | null
                    date?: string
                    debit?: number | null
                    description?: string
                    id?: string
                    voucher_id?: string | null
                }
                Relationships: [
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
                    type: string
                }
                Insert: {
                    code: string
                    id?: string
                    is_active?: boolean | null
                    name: string
                    type: string
                }
                Update: {
                    code?: string
                    id?: string
                    is_active?: boolean | null
                    name?: string
                    type?: string
                }
                Relationships: []
            }
            disbursements: {
                Row: {
                    cashier_id: string
                    cashier_signature: string | null
                    denominations: Json | null
                    id: string
                    issued_at: string | null
                    requestor_signature: string | null
                    requisition_id: string
                    total_prepared: number
                }
                Insert: {
                    cashier_id: string
                    cashier_signature?: string | null
                    denominations?: Json | null
                    id?: string
                    issued_at?: string | null
                    requestor_signature?: string | null
                    requisition_id: string
                    total_prepared: number
                }
                Update: {
                    cashier_id?: string
                    cashier_signature?: string | null
                    denominations?: Json | null
                    id?: string
                    issued_at?: string | null
                    requestor_signature?: string | null
                    requisition_id?: string
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
                        foreignKeyName: "disbursements_requisition_id_fkey"
                        columns: ["requisition_id"]
                        isOneToOne: false
                        referencedRelation: "requisitions"
                        referencedColumns: ["id"]
                    },
                ]
            }
            line_items: {
                Row: {
                    actual_amount: number | null
                    ai_confidence: number | null
                    ai_suggested_account_id: string | null
                    created_at: string | null
                    description: string
                    estimated_amount: number
                    id: string
                    quantity: number | null
                    requisition_id: string
                    unit_price: number | null
                    updated_at: string | null
                }
                Insert: {
                    actual_amount?: number | null
                    ai_confidence?: number | null
                    ai_suggested_account_id?: string | null
                    created_at?: string | null
                    description: string
                    estimated_amount: number
                    id?: string
                    quantity?: number | null
                    requisition_id: string
                    unit_price?: number | null
                    updated_at?: string | null
                }
                Update: {
                    actual_amount?: number | null
                    ai_confidence?: number | null
                    ai_suggested_account_id?: string | null
                    created_at?: string | null
                    description?: string
                    estimated_amount?: number
                    id?: string
                    quantity?: number | null
                    requisition_id?: string
                    unit_price?: number | null
                    updated_at?: string | null
                }
                Relationships: [
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
                    description: string | null
                    estimated_total: number
                    id: string
                    reference_number: string | null
                    requestor_id: string
                    status: string
                    updated_at: string | null
                }
                Insert: {
                    actual_total?: number | null
                    created_at?: string | null
                    description?: string | null
                    estimated_total?: number
                    id?: string
                    reference_number?: string | null
                    requestor_id: string
                    status: string
                    updated_at?: string | null
                }
                Update: {
                    actual_total?: number | null
                    created_at?: string | null
                    description?: string | null
                    estimated_total?: number
                    id?: string
                    reference_number?: string | null
                    requestor_id?: string
                    status?: string
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
                    employee_id: string
                    id: string
                    name: string
                    role: string
                    updated_at: string | null
                }
                Insert: {
                    created_at?: string | null
                    employee_id: string
                    id: string
                    name: string
                    role: string
                    updated_at?: string | null
                }
                Update: {
                    created_at?: string | null
                    employee_id?: string
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

export type SchemaName = keyof Omit<Database, "__InternalSupabase">

export type Tables<
    PublicTableNameOrOptions extends
    | keyof (Database["public"]["Tables"] & Database["public"]["Views"])
    | { schema: SchemaName },
    TableName extends PublicTableNameOrOptions extends { schema: SchemaName }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: SchemaName }
    ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
            Row: infer R
        }
    ? R
    : never
    : PublicTableNameOrOptions extends keyof (Database["public"]["Tables"] &
        Database["public"]["Views"])
    ? (Database["public"]["Tables"] &
        Database["public"]["Views"])[PublicTableNameOrOptions] extends {
            Row: infer R
        }
    ? R
    : never
    : never

export type TablesInsert<
    PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: SchemaName },
    TableName extends PublicTableNameOrOptions extends { schema: SchemaName }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: SchemaName }
    ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
        Insert: infer I
    }
    ? I
    : never
    : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
    ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
    }
    ? I
    : never
    : never

export type TablesUpdate<
    PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: SchemaName },
    TableName extends PublicTableNameOrOptions extends { schema: SchemaName }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: SchemaName }
    ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
        Update: infer U
    }
    ? U
    : never
    : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
    ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
    }
    ? U
    : never
    : never

export type Enums<
    PublicEnumNameOrOptions extends
    | keyof Database["public"]["Enums"]
    | { schema: SchemaName },
    EnumName extends PublicEnumNameOrOptions extends { schema: SchemaName }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: SchemaName }
    ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
    : PublicEnumNameOrOptions extends keyof Database["public"]["Enums"]
    ? Database["public"]["Enums"][PublicEnumNameOrOptions]
    : never
