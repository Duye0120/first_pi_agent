type FetchLike = typeof fetch;

export type ExternalApiAdapterConfig = {
  id: string;
  baseUrl: string;
  headers?: Record<string, string>;
  fetchImpl?: FetchLike;
};

export type ExternalApiRequest = {
  path: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
};

export type ExternalApiAdapter = {
  id: string;
  request: (request: ExternalApiRequest) => Promise<unknown>;
};

function joinUrl(baseUrl: string, requestPath: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/u, "");
  const normalizedPath = requestPath.startsWith("/") ? requestPath : `/${requestPath}`;
  return `${normalizedBase}${normalizedPath}`;
}

export function createExternalApiAdapter(
  config: ExternalApiAdapterConfig,
): ExternalApiAdapter {
  const fetchImpl = config.fetchImpl ?? fetch;
  return {
    id: config.id,
    async request(request) {
      const response = await fetchImpl(joinUrl(config.baseUrl, request.path), {
        method: request.method ?? "GET",
        headers: {
          ...config.headers,
          ...request.headers,
          ...(request.body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(text.trim() || `External API request failed: ${response.status}`);
      }
      if (!text.trim()) {
        return null;
      }
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return text;
      }
    },
  };
}
