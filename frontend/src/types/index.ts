/**
 * Shared TypeScript type definitions for Local SLM Laboratory.
 */

export interface ModelInfo {
  tag: string;
  display_name: string;
  parameter_count: string;
  published_parameters: string;
  architecture_note: string;
  context_window: number;
  recommended_temperature: float;
  capabilities: string[];
  install_command: string;
  is_available_locally: boolean;
  size_on_disk_bytes: number | null;
  quantization_level: string | null;
}

export type float = number;

export interface ModelsResponse {
  models: ModelInfo[];
  default_model: string;
  ollama_running: boolean;
  ollama_version: string | null;
}

export interface SystemTelemetry {
  ram_total_mb: number | null;
  ram_used_mb: number | null;
  ram_available_mb: number | null;
  ram_percent: number | null;
  cpu_percent: number | null;
}

export interface GpuTelemetry {
  gpu_available: boolean;
  device_name: string | null;
  vram_total_mb: number | null;
  vram_used_mb: number | null;
  vram_free_mb: number | null;
  vram_percent: number | null;
  gpu_utilization_percent: number | null;
  status: string;
}

export interface HealthResponse {
  status: "healthy" | "degraded" | "offline";
  version: string;
  environment: string;
  ollama: {
    is_running: boolean;
    version: string | null;
    latency_ms: number | null;
    base_url: string;
    error?: string;
  };
  resources: {
    system: SystemTelemetry;
    gpu: GpuTelemetry;
  };
  models: {
    candidate_count: number;
    available_count: number;
    installed_tags: string[];
    missing_tags: string[];
  };
  storage: {
    chroma_dir: boolean;
    upload_dir: boolean;
    writable: boolean;
  };
}

export interface Conversation {
  id: string;
  title: string;
  model_tag: string;
  created_at: string;
  updated_at: string;
  messages_count?: number;
  messages: Message[];
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  model_tag?: string;
  latency_ms?: number;
  ttft_ms?: number;
  tokens_per_second?: number;
  input_tokens?: number;
  output_tokens?: number;
  created_at: string;
}
