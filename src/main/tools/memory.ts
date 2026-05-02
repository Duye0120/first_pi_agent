import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { getMemdirStore, getMemoryPipeline, type MemdirEntry } from "../memory/service.js";
import { formatMemorySaveResultText } from "./memory-result.js";
import type { MemoryVectorPersistResult } from "./memory-vector.js";

const memorySaveParameters = Type.Object({
  summary: Type.String({
    description:
      "记忆内容的一句话摘要，要清晰、具体、可独立理解。例如：'用户偏好使用 pnpm 而非 npm'",
  }),
  topic: Type.String({
    description:
      "记忆所属分类。常用：preferences、architecture、conventions、workflow、project-structure、errors",
  }),
  detail: Type.Optional(
    Type.String({
      description:
        "详细补充内容（可选）。会写入 topic 文件供后续深度检索。适合放一段解释、原因或示例。",
    }),
  ),
  source: Type.Optional(
    Type.String({
      description: "记忆来源，默认 'agent'。可选 'user' / 'system'。",
    }),
  ),
});

const memoryListParameters = Type.Object({
  topic: Type.Optional(
    Type.String({
      description: "只列出指定 topic 的记忆。不填则显示索引概览。",
    }),
  ),
});

type MemorySaveDetails = {
  saved: MemdirEntry;
  vector: MemoryVectorPersistResult;
};
type MemoryListDetails = { count: number; topics: string[] };

export function createMemorySaveTool(
  sessionId: string,
): AgentTool<typeof memorySaveParameters, MemorySaveDetails> {
  return {
    name: "memory_save",
    label: "保存记忆",
    description:
      "将重要的事实、用户偏好、项目约定等信息保存到长期记忆系统。" +
      "需要指定 topic 分类和一句话摘要。只保存跨会话有价值的信息。",
    parameters: memorySaveParameters,
    async execute(_toolCallId, params) {
      const result = await getMemoryPipeline().saveCandidate(
        {
          content: params.summary,
          topic: params.topic,
          detail: params.detail,
          source: params.source ?? "agent",
          sessionId,
        },
        "memory_save",
      );

      return {
        content: [
          {
            type: "text",
            text: formatMemorySaveResultText({
              ...result.entry,
              vector: result.vector,
            }),
          },
        ],
        details: { saved: result.entry, vector: result.vector },
      };
    },
  };
}

export function createMemoryListTool(): AgentTool<
  typeof memoryListParameters,
  MemoryListDetails
> {
  return {
    name: "memory_list",
    label: "查看记忆",
    description:
      "列出长期记忆。不带 topic 参数时显示索引概览；带 topic 时显示该分类的详细内容。",
    parameters: memoryListParameters,
    async execute(_toolCallId, params) {
      const store = getMemdirStore();
      const topics = store.listTopics();

      if (params.topic) {
        const content = store.readTopic(params.topic);
        if (!content) {
          return {
            content: [
              {
                type: "text",
                text: `Topic '${params.topic}' 不存在。已有 topics：${topics.join(", ") || "无"}`,
              },
            ],
            details: { count: 0, topics },
          };
        }
        return {
          content: [{ type: "text", text: content }],
          details: { count: 1, topics },
        };
      }

      // 返回索引概览
      const indexEntries = store.listIndex();
      if (indexEntries.length === 0) {
        return {
          content: [{ type: "text", text: "当前没有已保存的记忆。" }],
          details: { count: 0, topics: [] },
        };
      }

      const indexContent = store.getIndexContent();
      return {
        content: [
          {
            type: "text",
            text: `共 ${indexEntries.length} 条记忆，${topics.length} 个 topic：\n\n${indexContent}`,
          },
        ],
        details: { count: indexEntries.length, topics },
      };
    },
  };
}
