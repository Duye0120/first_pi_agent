import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { getSettings } from "../settings.js";
import {
  formatDateTimeInTimeZone,
  resolveConfiguredTimeZone,
} from "../../shared/timezone.js";

const parameters = Type.Object({});

type GetTimeDetails = {
  isoTime: string;
  localTime: string;
  timeZone: string;
};

export const getTimeTool: AgentTool<typeof parameters, GetTimeDetails> = {
  name: "get_time",
  label: "Get Time",
  description: "Get the current local time for the running environment.",
  parameters,
  async execute(_toolCallId, _params) {
    const now = new Date();
    const timeZone = resolveConfiguredTimeZone(getSettings().timeZone);
    const localTime = formatDateTimeInTimeZone(now, timeZone);

    return {
      content: [
        {
          type: "text",
          text: `当前本地时间是 ${localTime}，时区是 ${timeZone}。`,
        },
      ],
      details: {
        isoTime: now.toISOString(),
        localTime,
        timeZone,
      },
    };
  },
};
