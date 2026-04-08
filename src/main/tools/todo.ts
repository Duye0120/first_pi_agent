import { randomUUID } from "node:crypto";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import {
  listSessionTodos,
  writeSessionTodos,
  type SessionTodoItem,
} from "../session/service.js";

const todoStatusSchema = Type.Union([
  Type.Literal("pending"),
  Type.Literal("in_progress"),
  Type.Literal("completed"),
]);

const todoItemSchema = Type.Object({
  id: Type.Optional(Type.String({ description: "已有任务 id；新任务可不填" })),
  content: Type.String({ description: "任务内容" }),
  activeForm: Type.Optional(Type.String({ description: "正在做时的进行式描述" })),
  status: todoStatusSchema,
});

const todoWriteParameters = Type.Object({
  todos: Type.Optional(Type.Array(todoItemSchema, { description: "外部语义：完整任务列表" })),
  items: Type.Optional(Type.Array(Type.Object({
    id: Type.Optional(Type.String({ description: "兼容参数：已有任务 id" })),
    content: Type.String({ description: "兼容参数：任务内容" }),
    status: Type.Optional(todoStatusSchema),
  }), { description: "兼容参数：旧版 items" })),
});

const todoReadParameters = Type.Object({});

type TodoWriteDetails = {
  oldTodos: SessionTodoItem[];
  newTodos: SessionTodoItem[];
  verificationNudgeNeeded: boolean | null;
};

type TodoReadDetails = {
  count: number;
  items: SessionTodoItem[];
};

function normalizeInputItems(params: {
  todos?: Array<{
    id?: string;
    content: string;
    activeForm?: string;
    status: "pending" | "in_progress" | "completed";
  }>;
  items?: Array<{
    id?: string;
    content: string;
    status?: "pending" | "in_progress" | "completed";
  }>;
}): SessionTodoItem[] {
  if (params.todos?.length) {
    return params.todos.map((item) => ({
      id: item.id?.trim() || `todo-${randomUUID()}`,
      content: item.content,
      activeForm: item.activeForm?.trim() || item.content,
      status: item.status,
    }));
  }

  return (params.items ?? []).map((item) => ({
    id: item.id?.trim() || `todo-${randomUUID()}`,
    content: item.content,
    activeForm: item.content,
    status: item.status ?? "pending",
  }));
}

function formatTodos(items: SessionTodoItem[]): string {
  if (items.length === 0) {
    return "[]";
  }

  return JSON.stringify(items, null, 2);
}

export function createTodoReadTool(sessionId: string): AgentTool<typeof todoReadParameters, TodoReadDetails> {
  return {
    name: "todo_read",
    label: "读取待办",
    description: "读取当前线程的待办列表。",
    parameters: todoReadParameters,
    async execute() {
      const items = listSessionTodos(sessionId);
      return {
        content: [{ type: "text", text: formatTodos(items) }],
        details: { count: items.length, items },
      };
    },
  };
}

export function createTodoWriteTool(sessionId: string): AgentTool<typeof todoWriteParameters, TodoWriteDetails> {
  return {
    name: "todo_write",
    label: "写入待办",
    description: "覆盖当前线程的待办列表。支持外部 TodoWrite 语义。",
    parameters: todoWriteParameters,
    async execute(_toolCallId, params) {
      const nextItems = normalizeInputItems(params);
      if (nextItems.length === 0) {
        const oldTodos = listSessionTodos(sessionId);
        const details: TodoWriteDetails = {
          oldTodos,
          newTodos: oldTodos,
          verificationNudgeNeeded: null,
        };

        return {
          content: [{ type: "text", text: JSON.stringify({ error: "todos 不能为空。" }, null, 2) }],
          details,
        };
      }

      const oldTodos = listSessionTodos(sessionId);
      const newTodos = writeSessionTodos(sessionId, nextItems);
      const allDone = newTodos.every((item) => item.status === "completed");
      const verificationNudgeNeeded =
        allDone &&
        newTodos.length >= 3 &&
        !newTodos.some((item) => item.content.toLowerCase().includes("verif"))
          ? true
          : null;

      const details: TodoWriteDetails = {
        oldTodos,
        newTodos,
        verificationNudgeNeeded,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
        details,
      };
    },
  };
}
