import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { checkFetchUrl } from "../security.js";
import { resolveNetworkTimeoutMs } from "../network/proxy.js";

const parameters = Type.Object({
  query: Type.String({ description: "搜索关键词" }),
  allowed_domains: Type.Optional(Type.Array(Type.String(), { description: "允许域名白名单" })),
  blocked_domains: Type.Optional(Type.Array(Type.String(), { description: "屏蔽域名黑名单" })),
  maxResults: Type.Optional(Type.Number({ description: "兼容参数：最多返回多少条，默认 8" })),
});

type SearchHit = {
  title: string;
  url: string;
};

type WebSearchResultItem =
  | string
  | {
    tool_use_id: string;
    content: SearchHit[];
  };

type WebSearchDetails = {
  query: string;
  results: WebSearchResultItem[];
  durationSeconds: number;
};

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlToText(input: string): string {
  return decodeHtml(input.replace(/<[^>]+>/g, " "));
}

function normalizeDomain(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

function hostMatchesList(urlValue: string, domains: string[]): boolean {
  try {
    const url = new URL(urlValue);
    const host = normalizeDomain(url.hostname);
    return domains
      .map(normalizeDomain)
      .some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function decodeDuckDuckGoRedirect(urlValue: string): string | null {
  const trimmed = urlValue.trim();
  if (!trimmed) {
    return null;
  }

  const joined = trimmed.startsWith("//")
    ? `https:${trimmed}`
    : trimmed.startsWith("/")
      ? `https://duckduckgo.com${trimmed}`
      : trimmed;

  try {
    const parsed = new URL(joined);
    if (parsed.hostname.includes("duckduckgo.com")) {
      const redirectTarget = parsed.searchParams.get("uddg");
      if (redirectTarget) {
        return decodeURIComponent(redirectTarget);
      }
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function extractQuotedValue(input: string): { value: string; rest: string } | null {
  const quote = input[0];
  if (!quote || (quote !== '"' && quote !== "'")) {
    return null;
  }

  const endIndex = input.indexOf(quote, 1);
  if (endIndex === -1) {
    return null;
  }

  return {
    value: input.slice(1, endIndex),
    rest: input.slice(endIndex + 1),
  };
}

function extractSearchHits(html: string): SearchHit[] {
  const hits: SearchHit[] = [];
  let remaining = html;

  while (true) {
    const anchorStart = remaining.indexOf("result__a");
    if (anchorStart === -1) {
      break;
    }

    const afterClass = remaining.slice(anchorStart);
    const hrefIndex = afterClass.indexOf("href=");
    if (hrefIndex === -1) {
      remaining = afterClass.slice(1);
      continue;
    }

    const hrefValue = extractQuotedValue(afterClass.slice(hrefIndex + 5));
    if (!hrefValue) {
      remaining = afterClass.slice(1);
      continue;
    }

    const tagClose = hrefValue.rest.indexOf(">");
    if (tagClose === -1) {
      remaining = hrefValue.rest;
      continue;
    }

    const afterTag = hrefValue.rest.slice(tagClose + 1);
    const endAnchor = afterTag.indexOf("</a>");
    if (endAnchor === -1) {
      remaining = afterTag;
      continue;
    }

    const url = decodeDuckDuckGoRedirect(hrefValue.value);
    const title = htmlToText(afterTag.slice(0, endAnchor));
    if (url && title) {
      hits.push({ title, url });
    }

    remaining = afterTag.slice(endAnchor + 4);
  }

  return hits;
}

function extractGenericLinkHits(html: string): SearchHit[] {
  const hits: SearchHit[] = [];
  let remaining = html;

  while (true) {
    const anchorStart = remaining.indexOf("<a");
    if (anchorStart === -1) {
      break;
    }

    const afterAnchor = remaining.slice(anchorStart);
    const hrefIndex = afterAnchor.indexOf("href=");
    if (hrefIndex === -1) {
      remaining = afterAnchor.slice(2);
      continue;
    }

    const hrefValue = extractQuotedValue(afterAnchor.slice(hrefIndex + 5));
    if (!hrefValue) {
      remaining = afterAnchor.slice(2);
      continue;
    }

    const tagClose = hrefValue.rest.indexOf(">");
    if (tagClose === -1) {
      remaining = hrefValue.rest;
      continue;
    }

    const afterTag = hrefValue.rest.slice(tagClose + 1);
    const endAnchor = afterTag.indexOf("</a>");
    if (endAnchor === -1) {
      remaining = afterTag;
      continue;
    }

    const title = htmlToText(afterTag.slice(0, endAnchor));
    const url = decodeDuckDuckGoRedirect(hrefValue.value) ?? hrefValue.value;
    if (title && /^https?:\/\//i.test(url)) {
      hits.push({ title, url });
    }

    remaining = afterTag.slice(endAnchor + 4);
  }

  return hits;
}

function dedupeHits(hits: SearchHit[]): SearchHit[] {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    if (seen.has(hit.url)) {
      return false;
    }

    seen.add(hit.url);
    return true;
  });
}

export function createWebSearchTool(): AgentTool<typeof parameters, WebSearchDetails> {
  return {
    name: "web_search",
    label: "网页搜索",
    description: "搜索网页结果并返回可引用链接。支持 allowed_domains / blocked_domains。",
    parameters,
    async execute(_toolCallId, params, signal) {
      const startedAt = Date.now();

      if (!params.query.trim()) {
        const details: WebSearchDetails = {
          query: params.query,
          results: [],
          durationSeconds: 0,
        };

        return {
          content: [{ type: "text", text: JSON.stringify({ error: "query 不能为空。" }, null, 2) }],
          details,
        };
      }

      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(params.query)}`;
      const urlCheck = checkFetchUrl(searchUrl);
      if (!urlCheck.allowed) {
        const details: WebSearchDetails = {
          query: params.query,
          results: [],
          durationSeconds: 0,
        };

        return {
          content: [{ type: "text", text: JSON.stringify({ error: urlCheck.reason ?? "搜索被拦截。" }, null, 2) }],
          details,
        };
      }

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        resolveNetworkTimeoutMs(),
      );
      if (signal) {
        signal.addEventListener("abort", () => controller.abort(), { once: true });
      }

      try {
        const response = await fetch(searchUrl, {
          signal: controller.signal,
          headers: {
            "User-Agent": "PiDesktopAgent/1.0",
            Accept: "text/html",
          },
        });

        const html = await response.text();
        let hits = extractSearchHits(html);
        if (hits.length === 0) {
          hits = extractGenericLinkHits(html);
        }

        if (params.allowed_domains?.length) {
          hits = hits.filter((hit) => hostMatchesList(hit.url, params.allowed_domains!));
        }
        if (params.blocked_domains?.length) {
          hits = hits.filter((hit) => !hostMatchesList(hit.url, params.blocked_domains!));
        }

        const dedupedHits = dedupeHits(hits).slice(0, Math.max(1, Math.min(params.maxResults ?? 8, 8)));
        const commentary =
          dedupedHits.length === 0
            ? `No web search results matched the query "${params.query}".`
            : `Search results for "${params.query}". Include a Sources section in the final answer.\n${dedupedHits.map((hit) => `- [${hit.title}](${hit.url})`).join("\n")}`;

        const details: WebSearchDetails = {
          query: params.query,
          results: [
            commentary,
            {
              tool_use_id: "web_search_1",
              content: dedupedHits,
            },
          ],
          durationSeconds: (Date.now() - startedAt) / 1000,
        };

        return {
          content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
          details,
        };
      } catch (error) {
        const details: WebSearchDetails = {
          query: params.query,
          results: [],
          durationSeconds: (Date.now() - startedAt) / 1000,
        };

        return {
          content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : "搜索失败" }, null, 2) }],
          details,
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
