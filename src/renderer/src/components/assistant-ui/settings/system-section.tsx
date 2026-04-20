import { LogsSection } from "./logs-section";
import { AboutSection } from "./about-section";

type SystemSectionProps = {
  timeZone: string;
};

export function SystemSection({
  timeZone,
}: SystemSectionProps) {
  return (
    <div className="space-y-4">
      <LogsSection timeZone={timeZone} />
      <AboutSection />
    </div>
  );
}
