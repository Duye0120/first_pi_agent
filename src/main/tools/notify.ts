import { Notification } from "electron";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { bus } from "../event-bus.js";

const parameters = Type.Object({
  title: Type.String({ description: "通知标题" }),
  body: Type.String({ description: "通知正文" }),
});

type NotifyDetails = {
  shown: boolean;
};

export const notifyUserTool: AgentTool<typeof parameters, NotifyDetails> = {
  name: "notify_user",
  label: "Notify User",
  description:
    "Send a desktop notification to the user. Use when you need to proactively inform the user about something (task completed, reminder, alert).",
  parameters,
  async execute(_toolCallId, params) {
    const { title, body } = params as { title: string; body: string };
    const supported = Notification.isSupported();

    if (supported) {
      const notification = new Notification({ title, body });
      notification.show();
    }

    bus.emit("notification:sent", { title, body });

    return {
      content: [
        {
          type: "text",
          text: supported
            ? `已发送桌面通知：「${title}」`
            : "当前系统不支持桌面通知，但消息已记录。",
        },
      ],
      details: { shown: supported },
    };
  },
};
