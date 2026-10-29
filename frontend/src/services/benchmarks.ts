/**
 * API service for Unified Benchmark Engine, runs management, telemetry summaries, and export.
 */

import { request } from "./api";

export interface BenchmarkModelSummary {
  overall_score: number;
  chat_score: number;
  rag_score: number;
  database_score: number;
  average_latency_ms: number;
  average_tokens_per_sec: number;
  success_rate: number;
  total_evaluated_tasks: number;
  latest_run_id?: string;
  latest_run_name?: string;
  evaluated_at?: string;
}

export interface BenchmarkRunItem {
  id: string;
  run_name: string;
  suite_name: string;
  model_tags: string[];
  status: "running" | "completed" | "failed" | "cancelled";
  total_cases: number;
  completed_cases: number;
  failed_cases: number;
  started_at: string;
  completed_at: string | null;
  summary: Record<string, BenchmarkModelSummary> | null;
}

export interface BenchmarkTaskResult {
  id: string;
  model_tag: string;
  application_type: "chat" | "rag" | "database";
  task_id: string;
  prompt: string;
  latency_ms: number | null;
  tokens_per_second: number | null;
  is_success: boolean;
  score: number;
  metrics: Record<string, any>;
  error_message: string | null;
  raw_response: string | null;
}

export interface BenchmarkRunDetails extends BenchmarkRunItem {
  results: BenchmarkTaskResult[];
}

export interface ComparisonSummaryResponse {
  models: Record<string, BenchmarkModelSummary>;
  has_data: boolean;
}

export const benchmarksApi = {
  startRun: async (
    modelTags: string[],
    suiteName: string = "all",
    runName?: string
  ): Promise<{ run_id: string; status: string; message: string }> => {
    return request<{ run_id: string; status: string; message: string }>("/benchmarks/run", {
      method: "POST",
      body: JSON.stringify({
        model_tags: modelTags,
        suite_name: suiteName,
        run_name: runName,
      }),
    });
  },

  getRuns: async (limit: number = 25): Promise<BenchmarkRunItem[]> => {
    return request<BenchmarkRunItem[]>(`/benchmarks/runs?limit=${limit}`);
  },

  getRunDetails: async (runId: string): Promise<BenchmarkRunDetails> => {
    return request<BenchmarkRunDetails>(`/benchmarks/runs/${runId}`);
  },

  getComparisonSummary: async (): Promise<ComparisonSummaryResponse> => {
    return request<ComparisonSummaryResponse>("/benchmarks/summary");
  },

  getExportUrl: (runId: string, format: "json" | "csv" | "pdf" = "json"): string => {
    return `/api/benchmarks/export/${runId}?format=${format}`;
  },

  deleteRun: async (runId: string): Promise<{ status: string }> => {
    return request<{ status: string }>(`/benchmarks/runs/${runId}`, {
      method: "DELETE",
    });
  },
};
