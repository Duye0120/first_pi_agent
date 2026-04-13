import type { SendMessageInput } from "../../shared/contracts.js";
import type { AgentHandle } from "../agent.js";
import type { ElectronAdapter } from "../adapter.js";
import type { HarnessRunScope } from "../harness/types.js";
import { getSettings } from "../settings.js";
import type { ResolvedRuntimeModel } from "../model-resolution.js";
import { loadSession } from "../session/facade.js";

export type ChatRuntimeSettings = ReturnType<typeof getSettings>;
export type ExistingChatSession = NonNullable<ReturnType<typeof loadSession>>;

export type ChatRunContext = {
  input: SendMessageInput;
  runScope: HarnessRunScope;
  settings: ChatRuntimeSettings;
  existingSession: ExistingChatSession;
  resolvedModel: ResolvedRuntimeModel;
  adapter: ElectronAdapter;
  createdHandle: boolean;
  handle: AgentHandle | null;
  runCreated: boolean;
  transcriptStarted: boolean;
};
