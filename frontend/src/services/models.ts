import { request } from "./api";
import { ModelsResponse, ModelInfo, HealthResponse } from "../types";

export async function fetchHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health");
}

export async function fetchModels(): Promise<ModelsResponse> {
  return request<ModelsResponse>("/models");
}

export async function fetchModelDetails(tag: string): Promise<ModelInfo> {
  return request<ModelInfo>(`/models/${encodeURIComponent(tag)}`);
}
