import { getActiveServers, loadMcpConfig } from "../mcp/config.js";
import { getMemdirStore } from "./memory/service.js";
import type { ProviderType } from "../shared/contracts.js";

export type PromptLayer =
  | "constitution"
  | "workspace"
  | "runtime"
  | "semantic-memory"
  | "learnings"
  | "session"
  | "turn";

export type PromptRole = "instruction" | "fact" | "memory" | "intent";
export type PromptAuthority = "hard" | "soft" | "reference";
export type PromptCacheScope = "stable" | "session" | "turn";
export type PromptWritableBack = false | "session" | "semantic";

export type PromptSection = {
  id: string;
  layer: PromptLayer;
  role: PromptRole;
  authority: PromptAuthority;
  priority: number;
  cacheScope: PromptCacheScope;
  trimPriority: number;
  writableBack: PromptWritableBack;
  content: string;
};

export type RuntimeCapabilitySectionInput = {
  workspacePath: string;
  shell: string;
  sourceName: string;
  providerType: ProviderType;
  modelName: string;
  modelId: string;
  contextWindow: number | null;
  supportsVision: boolean;
  supportsToolCalling: boolean;
  thinkingLevel: string;
  toolNames: string[];
};

const LAYER_ORDER: Record<PromptLayer, number> = {
  constitution: 10,
  workspace: 20,
  runtime: 30,
  "semantic-memory": 40,
  learnings: 45,
  session: 50,
  turn: 60,
};

function normalizeContent(content: string): string {
  return content
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function createSection(
  input: Omit<PromptSection, "content"> & { content: string | null | undefined },
): PromptSection | null {
  const content = normalizeContent(input.content ?? "");
  if (!content) {
    return null;
  }

  return {
    ...input,
    content,
  };
}

function sortSections(a: PromptSection, b: PromptSection): number {
  if (a.priority !== b.priority) {
    return a.priority - b.priority;
  }

  return LAYER_ORDER[a.layer] - LAYER_ORDER[b.layer];
}

function resolveShellLabel(shell: string): string {
  const normalized = shell.trim().toLowerCase();
  if (!normalized || normalized === "default") {
    return "系统默认 shell（Windows 下通常是 PowerShell）";
  }
  if (normalized.includes("pwsh") || normalized.includes("powershell")) {
    return "PowerShell";
  }
  if (normalized.includes("cmd")) {
    return "cmd";
  }
  return shell;
}

function truncateText(text: string, maxLength = 120): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  return normalized.length <= maxLength
    ? normalized
    : normalized.slice(0, Math.max(16, maxLength - 1)).trimEnd() + "…";
}

function inferTurnMode(text: string): string | null {
  const normalized = text.replace(/\s+/g, "");
  if (/^\/btw(?:\s|$)/i.test(text.trim())) {
    return "旁路补充 / btw";
  }
  if (/(讨论|方案|架构|设计|怎么做|思路)/.test(normalized)) {
    return "讨论 / 方案收敛";
  }
  if (/(review|审查|检查|过一遍|代码审阅)/i.test(text)) {
    return "review / 审查";
  }
  if (/(排查|排障|定位|报错|错误|异常|失败|bug)/i.test(text)) {
    return "排障 / 根因定位";
  }
  if (/(实现|修改|调整|重构|修复|改一下|动代码)/.test(normalized)) {
    return "实现 / 修改";
  }
  return null;
}

function collectTurnConstraints(text: string): string[] {
  const normalized = text.replace(/\s+/g, "");
  const constraints: string[] = [];

  if (/(先讨论|只讨论|讨论方案|先聊|别急着改|先别改|不要改代码|暂不改代码)/.test(normalized)) {
    constraints.push("本轮先以讨论和收敛方案为主，不直接改代码。");
  }
  if (/(只改文档|文档为主|更新文档|改文档)/.test(normalized)) {
    constraints.push("本轮以文档调整为主，不扩散到无关代码。");
  }
  if (/(不要build|别build|先别build|不需要build|不要check|别check|先别check|不需要check)/i.test(normalized)) {
    constraints.push("本轮避免无必要的 build / check。");
  }
  if (/(只看|只review|只检查|别动别的|限制范围)/.test(normalized)) {
    constraints.push("本轮只处理用户点名的范围，不主动扩散修改。");
  }
  if (/^\/btw(?:\s|$)/i.test(text.trim())) {
    constraints.push("本轮是 /btw 旁路补充：短答优先，尽量不改变主线任务状态，不主动扩大工具调用范围。");
  }

  return constraints;
}

export function assemblePromptSections(
  sections: Array<PromptSection | null | undefined>,
): string {
  return sections
    .filter((section): section is PromptSection => !!section)
    .sort(sortSections)
    .map((section) => section.content)
    .join("\n\n");
}

export function buildPlatformConstitutionSection(): PromptSection {
  return {
    id: "platform-constitution",
    layer: "constitution",
    role: "instruction",
    authority: "hard",
    priority: 10,
    cacheScope: "stable",
    trimPriority: 100,
    writableBack: false,
    content: [
      "## Platform Constitution",
      "你是 Pi，一个运行在用户桌面上的 AI 助手。",
      "默认用中文回复，优先说人话、保持简洁。",
      "你可以帮助用户完成软件开发和日常任务。",
      "需要使用工具时，先遵守 Harness Runtime 的边界，不能把 prompt 当成权限系统。",
    ].join("\n"),
  };
}

export function buildTalkNormalSection(): PromptSection {
  return {
    id: "talk-normal",
    layer: "constitution",
    role: "instruction",
    authority: "hard",
    priority: 12,
    cacheScope: "stable",
    trimPriority: 95,
    writableBack: false,
    content: [
      "## Response Style",
      "回答要直接、資訊完整、但不要拖泥帶水。",
      "先回答，再补充必要上下文；不要先寒暄、不要重复题目。",
      "避免用否定式对比来立论，例如“不是 X，而是 Y”或“X，而不是 Y”；优先直接陈述你真正要表达的正向结论。",
      "简单问题短答，复杂问题可以分点，但只保留最重要的结构。",
      "不要写总结标签式收尾，不要用“总结一下 / 一句话说 / hope this helps / 如果你愿意我还可以”这类尾句。",
      "不要为了显得自然而重复改写同一个意思；说清楚一次就停。",
    ].join("\n"),
  };
}

export function buildWorkspacePolicySection(
  content: string,
): PromptSection | null {
  return createSection({
    id: "workspace-policy",
    layer: "workspace",
    role: "instruction",
    authority: "hard",
    priority: 20,
    cacheScope: "stable",
    trimPriority: 90,
    writableBack: false,
    content: [
      "## Workspace Policy",
      "以下是当前仓库的长期规则：",
      content,
    ].join("\n\n"),
  });
}

export function buildRuntimeCapabilitySection(
  input: RuntimeCapabilitySectionInput,
): PromptSection {
  const activeServers = getActiveServers(loadMcpConfig(input.workspacePath)).map(
    ([name]) => name,
  );
  const builtinToolNames = input.toolNames.filter((name) => !name.startsWith("mcp_"));
  const mcpToolCount = input.toolNames.filter((name) => name.startsWith("mcp_")).length;

  return {
    id: "runtime-capability-manifest",
    layer: "runtime",
    role: "fact",
    authority: "hard",
    priority: 30,
    cacheScope: "session",
    trimPriority: 60,
    writableBack: false,
    content: [
      "## Runtime Capability Manifest",
      "以下是当前运行时的真实能力与边界，以此为准：",
      `当前模型：${input.modelName}（${input.modelId}）`,
      `当前 source：${input.sourceName} / ${input.providerType}`,
      `视觉输入：${input.supportsVision ? "支持" : "不支持"}`,
      `工具调用：${input.supportsToolCalling ? "支持" : "不支持"}`,
      input.contextWindow ? `上下文窗口：约 ${input.contextWindow} tokens` : "",
      `thinking level：${input.thinkingLevel}`,
      `shell：${resolveShellLabel(input.shell)}`,
      `内置工具：${builtinToolNames.join("、")}`,
      activeServers.length > 0
        ? `已启用 MCP Server：${activeServers.join("、")}`
        : "已启用 MCP Server：无",
      mcpToolCount > 0 ? `动态 MCP 工具数：${mcpToolCount}` : "",
      input.toolNames.includes("mcp")
        ? "MCP 代理：可用 mcp(action=list) 发现工具，再用 mcp(action=call, server, tool, args) 调用工具；MCP 工具很多时优先使用代理。"
        : "",
      input.toolNames.includes("web_search") && input.toolNames.includes("web_fetch")
        ? "网页访问：web_search 用于搜索，web_fetch 用于抓取 URL 内容。"
        : "",
      input.toolNames.includes("command_history")
        ? "命令历史：command_history 可读取当前线程最近 shell_exec 命令、退出码和耗时。"
        : "",
      "文件路径默认相对于当前 workspace。",
      `shell_exec 使用 ${resolveShellLabel(input.shell)} 语法，不要默认写 bash 专属语法。`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function buildSemanticMemorySection(content: string): PromptSection | null {
  return createSection({
    id: "semantic-memory",
    layer: "semantic-memory",
    role: "memory",
    authority: "reference",
    priority: 40,
    cacheScope: "turn",
    trimPriority: 10,
    writableBack: "semantic",
    content,
  });
}

export function buildLearningsSection(): PromptSection | null {
  const store = getMemdirStore();
  const topicContent = store.readTopic("learnings").trim();

  if (!topicContent) {
    return null;
  }

  const blocks = topicContent
    .split(/^###\s+/m)
    .map((block) => block.trim())
    .filter(Boolean)
    .filter((block) => !block.startsWith("# "))
    .slice(-4)
    .map((block) => {
      const [headingLine, ...detailLines] = block.split("\n");
      const heading = headingLine.trim();
      const detail = detailLines
        .filter((line) => !line.trim().startsWith("_source:"))
        .join("\n")
        .trim();
      const detailPreview =
        detail.length > 260 ? `${detail.slice(0, 260).trimEnd()}…` : detail;

      return [
        `- ${heading}`,
        detailPreview ? `  > ${detailPreview.replace(/\n/g, "\n  > ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    });

  if (blocks.length === 0) {
    return null;
  }

  return createSection({
    id: "learnings",
    layer: "learnings",
    role: "memory",
    authority: "reference",
    priority: 45,
    cacheScope: "turn",
    trimPriority: 12,
    writableBack: false,
    content: ["## Recent Learnings", ...blocks].join("\n"),
  });
}

export function buildSessionSnapshotSection(content: string): PromptSection | null {
  return createSection({
    id: "session-continuity",
    layer: "session",
    role: "memory",
    authority: "reference",
    priority: 50,
    cacheScope: "session",
    trimPriority: 20,
    writableBack: "session",
    content,
  });
}

export function buildTurnIntentPatchSection(
  latestUserText?: string | null,
): PromptSection | null {
  const text = latestUserText?.trim();
  if (!text) {
    return null;
  }

  const mode = inferTurnMode(text);
  const constraints = collectTurnConstraints(text);

  return createSection({
    id: "turn-intent-patch",
    layer: "turn",
    role: "intent",
    authority: "soft",
    priority: 60,
    cacheScope: "turn",
    trimPriority: 100,
    writableBack: false,
    content: [
      "## Turn Intent Patch",
      "以下仅对当前轮生效：",
      mode ? `本轮模式：${mode}` : "",
      `用户最新诉求：${truncateText(text)}`,
      ...constraints,
    ]
      .filter(Boolean)
      .join("\n"),
  });
}
