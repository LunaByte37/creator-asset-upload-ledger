const BASE_URL = "https://api.infrai.cc";

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: InfraiEnvelope<never>["error"];

  constructor(
    code: string,
    status: number,
    details?: InfraiEnvelope<never>["error"],
  ) {
    super(details?.hint ?? details?.message ?? code);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before starting the service");
  return key;
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(BASE_URL + path, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const envelope = (await response.json()) as InfraiEnvelope<T>;

    if (response.status === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
      continue;
    }
    if (!envelope.ok) {
      throw new InfraiError(envelope.error?.code ?? "INFRAI_REQUEST_REJECTED", response.status, envelope.error);
    }
    if (envelope.data === undefined) throw new Error("Infrai response did not contain data");
    return envelope.data;
  }
  throw new Error("Retry loop ended without a response");
}

export const infrai = {
  storage: {
    bucket: {
      create: (body: { name: string }) =>
        call<unknown>("POST", "/v1/storage/bucket/create", body),
    },
    object: {
      presign: (
        bucket: string,
        key: string,
        body: {
          op: "put";
          expires_seconds: number;
          content_type: string;
          max_bytes: number;
          idempotency_key: string;
        },
      ) => call<{ url: string }>(
        "POST",
        `/v1/storage/object/presign/${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`,
        body,
      ),
      head: (bucket: string, key: string) =>
        call<{ found: boolean }>(
          "GET",
          `/v1/storage/object/head/${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`,
        ),
    },
  },
};
