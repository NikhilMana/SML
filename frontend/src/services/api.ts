/**
 * Centralized HTTP API client for backend communication.
 */

export class ApiError extends Error {
  public statusCode: number;
  public details: Record<string, unknown>;

  constructor(message: string, statusCode: number, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

export async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = endpoint.startsWith("http") ? endpoint : `/api${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  const defaultHeaders: Record<string, string> = {
    "Accept": "application/json",
  };

  // Only set Content-Type if body is not FormData
  if (!(options.body instanceof FormData)) {
    defaultHeaders["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  });

  if (!response.ok) {
    let errorDetails: Record<string, unknown> = {};
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

    try {
      const errorJson = await response.json();
      errorMessage = errorJson.message || errorJson.detail || errorMessage;
      errorDetails = errorJson.details || errorJson;
    } catch {
      // Body not JSON
    }

    throw new ApiError(errorMessage, response.status, errorDetails);
  }

  return response.json() as Promise<T>;
}
