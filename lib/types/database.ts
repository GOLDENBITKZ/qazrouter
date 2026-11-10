export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      vast_deployments: {
        Row: {
          id: string;
          user_id: string | null;
          model: string;
          instance_id: number | null;
          state: string;
          hourly_usd: number;
          gpu_name: string;
          tls_cert: string;
          last_checked_at: string;
          host: string | null;
          port: number | null;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id: string;
          user_id: string | null;
          model: string;
          instance_id?: number | null;
          state: string;
          hourly_usd: number;
          gpu_name: string;
          tls_cert: string;
          last_checked_at?: string;
          host?: string | null;
          port?: number | null;
          expires_at: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["vast_deployments"]["Insert"]>;
        Relationships: [];
      };
      users: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          avatar_url: string | null;
          balance_kzt: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          balance_kzt?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          balance_kzt?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      api_keys: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          key_prefix: string;
          key_last_four: string;
          key_hash: string;
          is_active: boolean;
          created_at: string;
          last_used_at: string | null;
          revoked_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          key_prefix: string;
          key_last_four: string;
          key_hash: string;
          is_active?: boolean;
          created_at?: string;
          last_used_at?: string | null;
          revoked_at?: string | null;
        };
        Update: {
          name?: string;
          is_active?: boolean;
          last_used_at?: string | null;
          revoked_at?: string | null;
        };
        Relationships: [];
      };
      usage_logs: {
        Row: {
          id: string;
          user_id: string;
          api_key_id: string | null;
          request_id: string;
          model: string;
          provider: string;
          input_tokens: number;
          output_tokens: number;
          total_tokens: number;
          cached_input_tokens: number;
          provider_cost_usd: number | null;
          input_price_per_million: number;
          output_price_per_million: number;
          cost_kzt: number;
          latency_ms: number;
          masked_entities: Json;
          masked_total: number;
          pii_engine: string;
          pii_policy_version: string;
          pii_risk: number;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          api_key_id?: string | null;
          request_id: string;
          model: string;
          provider: string;
          input_tokens: number;
          output_tokens: number;
          total_tokens: number;
          cached_input_tokens?: number;
          provider_cost_usd?: number | null;
          input_price_per_million: number;
          output_price_per_million: number;
          cost_kzt: number;
          latency_ms: number;
          masked_entities?: Json;
          masked_total?: number;
          pii_engine?: string;
          pii_policy_version?: string;
          pii_risk?: number;
          status?: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      topup_requests: {
        Row: {
          id: string;
          user_id: string;
          amount_kzt: number;
          kaspi_transaction_id: string;
          status: "pending" | "approved" | "rejected";
          admin_note: string | null;
          created_at: string;
          reviewed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          amount_kzt: number;
          kaspi_transaction_id: string;
          status?: "pending" | "approved" | "rejected";
          admin_note?: string | null;
          created_at?: string;
          reviewed_at?: string | null;
        };
        Update: {
          status?: "pending" | "approved" | "rejected";
          admin_note?: string | null;
          reviewed_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      charge_usage: {
        Args: {
          p_user_id: string;
          p_api_key_id: string;
          p_request_id: string;
          p_model: string;
          p_provider: string;
          p_input_tokens: number;
          p_output_tokens: number;
          p_total_tokens: number;
          p_cached_input_tokens: number;
          p_provider_cost_usd: number | null;
          p_input_price_per_million: number;
          p_output_price_per_million: number;
          p_cost_kzt: number;
          p_latency_ms: number;
          p_masked_entities: Json;
          p_masked_total: number;
          p_pii_engine: string;
          p_pii_policy_version: string;
          p_pii_risk: number;
        };
        Returns: {
          success: boolean;
          balance_kzt?: number;
          reason?: string;
        };
      };
      get_my_dashboard_metrics: {
        Args: Record<string, never>;
        Returns: {
          total_spent_kzt: number;
          month_spent_kzt: number;
          total_requests: number;
          total_tokens: number;
          masked_iin: number;
          masked_phone: number;
          masked_card: number;
          masked_total: number;
          pending_topups: number;
        };
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
