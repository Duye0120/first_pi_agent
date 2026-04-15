import type {
  ChatSessionSummary,
  Settings,
  ThinkingLevel,
} from "@shared/contracts";

export type SettingsSection =
  | "general"
  | "ai_model"
  | "workspace"
  | "interface"
  | "system";

export type SettingsViewProps = {
  activeSection: SettingsSection;
  settings: Settings | null;
  currentModelId: string;
  thinkingLevel: ThinkingLevel;
  onModelChange: (modelEntryId: string) => void;
  onThinkingLevelChange: (level: ThinkingLevel) => void;
  onSettingsChange: (partial: Partial<Settings>) => void;
  archivedSummaries: ChatSessionSummary[];
  onOpenArchivedSession: (sessionId: string) => void;
  onUnarchiveSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
};
