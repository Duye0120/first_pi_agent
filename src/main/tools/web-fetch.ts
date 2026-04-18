import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { checkFetchUrl } from "../security.js";
import { FETCH_POLICY } from "../../shared/security.js";
import { resolveNetworkTimeoutMs } from "../network/proxy.js";

const parameters = Type.Object({
  url: Type.String({ description: "网页 URL（必须是 http/https）" }),
  maxLength: Type.Optional(Type.Number({ description: "返回内容最大字符数（默认 10000）" })),
});

type WebFetchDetails = {
  url: string;
  statusCode: number;
  contentLength: number;
  truncated: boolean;
};

/** Strip HTML tags and extract text content (basic) */
function htmlToText(html: string): string {
  return html
    // Remove script/style blocks
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    // Remove nav/header/footer
    .replace(/<(nav|header|footer)[^>]*>[\s\S]*?<\/\1>/gi, "")
    // Convert br/p/div to newlines
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    // Remove remaining tags
    .replace(/<[^>]+>/g, "")
    // Decode common entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    // Collapse whitespace
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function createWebFetchTool(): AgentTool<typeof parameters, WebFetchDetails> {
  return {
    name: "web_fetch",
    label: "获取网页",
    description: "获取网页内容并转换为纯文本。用于查看文档、API 参考等在线资源。",
    parameters,
    async execute(_toolCallId, params, signal?) {
      const urlCheck = checkFetchUrl(params.url);
      if (!urlCheck.allowed) {
        return {
          content: [{ type: "text", text: `无法访问: ${urlCheck.reason}` }],
          details: { url: params.url, statusCode: 0, contentLength: 0, truncated: false },
        };
      }

      const maxLength = params.maxLength ?? 10000;

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        resolveNetworkTimeoutMs(),
      );

      try {
        // Chain with external abort signal
        if (signal) {
          signal.addEventListener("abort", () => controller.abort(), { once: true });
        }

        const response = await fetch(params.url, {
          signal: controller.signal,
          headers: { "User-Agent": "PiDesktopAgent/1.0" },
        });

        if (!response.ok) {
          return {
            content: [{ type: "text", text: `HTTP ${response.status}: ${response.statusText}` }],
            details: { url: params.url, statusCode: response.status, contentLength: 0, truncated: false },
          };
        }

        const contentType = response.headers.get("content-type") ?? "";
        const raw = await response.text();

        // Size check
        if (raw.length > FETCH_POLICY.maxResponseSizeBytes) {
          return {
            content: [{ type: "text", text: `响应体过大（${(raw.length / 1024 / 1024).toFixed(1)}MB），已拒绝` }],
            details: { url: params.url, statusCode: response.status, contentLength: raw.length, truncated: true },
          };
        }

        let text: string;
        if (contentType.includes("html")) {
          text = htmlToText(raw);
        } else {
          text = raw;
        }

        const truncated = text.length > maxLength;
        if (truncated) {
          text = text.slice(0, maxLength) + `\n\n[内容已截断，原始长度 ${raw.length} 字符]`;
        }

        return {
          content: [{ type: "text", text: `网页内容（${params.url}）:\n\n${text}` }],
          details: {
            url: params.url,
            statusCode: response.status,
            contentLength: raw.length,
            truncated,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "请求失败";
        return {
          content: [{ type: "text", text: `获取失败: ${message}` }],
          details: { url: params.url, statusCode: 0, contentLength: 0, truncated: false },
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
