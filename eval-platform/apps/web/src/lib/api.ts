export type Envelope<T> = {
  data: T | null;
  meta?: Record<string, unknown> | null;
  error?: { code: string; message: string } | null;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export function joinApiUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

async function readEnvelope<T>(response: Response): Promise<Envelope<T>> {
  try {
    return (await response.json()) as Envelope<T>;
  } catch {
    return {
      data: null,
      error: { code: String(response.status), message: response.statusText || "API request failed" }
    };
  }
}

export async function apiGet<T>(path: string): Promise<Envelope<T>> {
  const response = await fetch(joinApiUrl(API_BASE_URL, path));
  const envelope = await readEnvelope<T>(response);
  if (!response.ok && !envelope.error) {
    return { data: null, error: { code: String(response.status), message: response.statusText } };
  }
  return envelope;
}

export async function apiPost<T>(path: string, body: unknown): Promise<Envelope<T>> {
  const response = await fetch(joinApiUrl(API_BASE_URL, path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const envelope = await readEnvelope<T>(response);
  if (!response.ok && !envelope.error) {
    return { data: null, error: { code: String(response.status), message: response.statusText } };
  }
  return envelope;
}
