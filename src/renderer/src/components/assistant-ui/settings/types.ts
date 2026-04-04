import type {
  ChatSessionSummary,
  ModelSelection,
  Settings,
  ThinkingLevel,
} from "@shared/contracts";

export type SettingsSection =
  | "general"
  | "keys"
  | "appearance"
  | "terminal"
  | "workspace"
  | "archived"
  | "about";

export type SettingsViewProps = {
  activeSection: SettingsSection;
  settings: Settings | null;
  currentModel: ModelSelection;
  thinkingLevel: ThinkingLevel;
  onModelChange: (model: ModelSelection) => void;
  onThinkingLevelChange: (level: ThinkingLevel) => void;
  onSettingsChange: (partial: Partial<Settings>) => void;
  archivedSummaries: ChatSessionSummary[];
  onOpenArchivedSession: (sessionId: string) => void;
  onUnarchiveSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
};
