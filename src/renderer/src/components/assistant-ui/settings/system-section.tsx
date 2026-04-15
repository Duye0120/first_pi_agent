import type { ChatSessionSummary } from "@shared/contracts";
import { LogsSection } from "./logs-section";
import { ArchivedSection } from "./archived-section";
import { AboutSection } from "./about-section";

type SystemSectionProps = {
  timeZone: string;
  archivedSummaries: ChatSessionSummary[];
  onOpenArchivedSession: (sessionId: string) => void;
  onUnarchiveSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
};

export function SystemSection({
  timeZone,
  archivedSummaries,
  onOpenArchivedSession,
  onUnarchiveSession,
  onDeleteSession,
}: SystemSectionProps) {
  return (
    <div className="space-y-4">
      <ArchivedSection
        archivedSummaries={archivedSummaries}
        timeZone={timeZone}
        onOpenArchivedSession={onOpenArchivedSession}
        onUnarchiveSession={onUnarchiveSession}
        onDeleteSession={onDeleteSession}
      />
      <LogsSection timeZone={timeZone} />
      <AboutSection />
    </div>
  );
}
