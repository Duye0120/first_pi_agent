import { completeSimple, type TextContent } from "@mariozechner/pi-ai";
import { getSettings } from "./settings.js";
import { resolveModelEntry } from "./providers.js";

function extractText(content: Array<{ type: string }>): string {
  return content
    .filter((block): block is TextContent => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

export class WorkerService {
  /**
   * Generate text using the configured worker model.
   * Falls back to the default model if no worker model is configured.
   */
  static async generateText(prompt: string): Promise<string> {
    const settings = getSettings();
    const modelId = settings.workerModelId || settings.defaultModelId;

    const resolved = resolveModelEntry(modelId);

    const response = await completeSimple(
      resolved.model,
      {
        systemPrompt: "",
        messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
        tools: [],
      },
      { apiKey: resolved.apiKey },
    );

    return extractText(response.content);
  }
}
