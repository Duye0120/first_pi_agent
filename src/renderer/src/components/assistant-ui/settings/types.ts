import type {
  ChatSessionSummary,
  ModelRoutingRole,
  Settings,
  SessionGroup,
  ThinkingLevel,
} from "@shared/contracts";
import type { SettingsSection } from "@shared/settings-sections";

export type { SettingsSection };

export type SettingsViewProps = {
  activeSection: SettingsSection;
  settings: Settings | null;
  currentModelId: string;
  thinkingLevel: ThinkingLevel;
  onModelChange: (modelEntryId: string) => void;
  onRoleModelChange: (
    role: Exclude<ModelRoutingRole, "chat">,
    modelId: string | null,
  ) => void;
  onThinkingLevelChange: (level: ThinkingLevel) => void;
  onSettingsChange: (partial: Partial<Settings>) => void;
  groups: SessionGroup[];
  liveSummaries: ChatSessionSummary[];
  archivedSummaries: ChatSessionSummary[];
  onCreateProject: () => void;
  onOpenArchivedSession: (sessionId: string) => void;
  onUnarchiveSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
};
