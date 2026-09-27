import { HealthResponse, ApiError } from '../types';

export type { HealthResponse, ApiError };

const API_BASE = '/api/v1';

async function handleResponse<T>(response: Response): Promise<T> {
  const data = await response.json();

  if (!response.ok) {
    const error = data as ApiError;
    throw new Error(error.error.message);
  }

  return data as T;
}

export async function checkHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE}/health`);
  return handleResponse<HealthResponse>(response);
}

export async function checkReady(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE}/ready`);
  return handleResponse<HealthResponse>(response);
}