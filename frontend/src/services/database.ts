/**
 * API service for Natural-Language Database Assistant, schema explorer, and safe CRUD execution.
 */

import { request } from "./api";

export interface TableColumnInfo {
  name: string;
  type: string;
  primary_key: boolean;
  nullable: boolean;
}

export interface TableSchemaInfo {
  table_name: string;
  columns: TableColumnInfo[];
  row_count: number;
  sample_records: Record<string, any>[];
}

export interface DatabaseSchemaResponse {
  database_name: string;
  tables: TableSchemaInfo[];
}

export interface CRUDOperationProposal {
  operation_type: "SELECT" | "INSERT" | "UPDATE" | "DELETE";
  target_entity: "customers" | "products" | "orders";
  filters: Record<string, any>;
  fields?: string[];
  data?: Record<string, any>;
  order_by?: string;
  limit?: number;
  explanation: string;
}

export interface InterpretationResponse {
  user_prompt: string;
  model_tag: string;
  proposal?: CRUDOperationProposal;
  is_valid: boolean;
  safety_check_passed: boolean;
  requires_confirmation: boolean;
  confirmation_id?: string;
  affected_records_preview: Record<string, any>[];
  risk_assessment: string;
  error_message?: string;
  raw_model_output?: string;
  latency_ms?: number;
}

export interface ExecutionResult {
  operation_type: string;
  target_entity: string;
  affected_rows: number;
  data: Record<string, any>[];
  natural_language_summary: string;
  executed_sql_parameterized: string;
  latency_ms: number;
  is_success: boolean;
}

export interface DatabaseAuditLog {
  id: string;
  created_at: string;
  user_prompt: string;
  model_tag: string;
  operation_type: string;
  target_entity: string;
  parsed_operation: string;
  is_valid: boolean;
  safety_check_passed: boolean;
  is_confirmed: boolean;
  executed_success: boolean;
  latency_ms: number;
}

export const databaseApi = {
  getSchema: async (): Promise<DatabaseSchemaResponse> => {
    return request<DatabaseSchemaResponse>("/database/schema");
  },

  interpretPrompt: async (prompt: string, modelTag: string): Promise<InterpretationResponse> => {
    return request<InterpretationResponse>("/database/interpret", {
      method: "POST",
      body: JSON.stringify({
        prompt,
        model_tag: modelTag,
      }),
    });
  },

  executeSafeOperation: async (
    proposal: CRUDOperationProposal,
    userPrompt: string,
    modelTag: string
  ): Promise<ExecutionResult> => {
    return request<ExecutionResult>("/database/execute", {
      method: "POST",
      body: JSON.stringify({
        proposal,
        user_prompt: userPrompt,
        model_tag: modelTag,
      }),
    });
  },

  confirmOperation: async (confirmationId: string): Promise<ExecutionResult> => {
    return request<ExecutionResult>("/database/confirm", {
      method: "POST",
      body: JSON.stringify({
        confirmation_id: confirmationId,
      }),
    });
  },

  resetDemoDatabase: async (): Promise<{ status: string; message: string }> => {
    return request<{ status: string; message: string }>("/database/reset-demo", {
      method: "POST",
    });
  },

  getAuditLogs: async (limit = 25): Promise<DatabaseAuditLog[]> => {
    return request<DatabaseAuditLog[]>(`/database/logs?limit=${limit}`);
  },
};
