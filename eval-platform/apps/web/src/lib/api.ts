export type Envelope<T> = {
  data: T | null;
  meta?: Record<string, unknown> | null;
  error?: { code: string; message: string } | null;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export async function apiGet<T>(path: string): Promise<Envelope<T>> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    return { data: null, error: { code: String(response.status), message: response.statusText } };
  }
  return response.json() as Promise<Envelope<T>>;
}
