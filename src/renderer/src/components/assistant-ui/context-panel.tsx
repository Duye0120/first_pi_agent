import { useMemo, useState } from "react";
import { ClockIcon, DocumentTextIcon, RectangleGroupIcon } from "@heroicons/react/24/outline";
import { motion } from "framer-motion";
import type { AgentStep, ChatSession, SelectedFile } from "@shared/contracts";
import { formatRelativeTime } from "@renderer/lib/session";
import { cn } from "@renderer/lib/utils";

type ContextPanelProps = {
  open: boolean;
  session: ChatSession | null;
};

type ContextTabId = "attachments" | "session" | "steps";

const CONTEXT_TABS: {
  id: ContextTabId;
  label: string;
  icon: typeof DocumentTextIcon;
}[] = [
  { id: "attachments", label: "附件", icon: DocumentTextIcon },
  { id: "session", label: "会话", icon: ClockIcon },
  { id: "steps", label: "步骤", icon: RectangleGroupIcon },
];

function EmptyPanelState({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid min-h-[220px] place-items-center rounded-[18px] bg-shell-panel-elevated px-5 py-6 text-center shadow-[0_10px_28px_rgba(0,0,0,0.20)]">
      <div className="max-w-[240px]">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function SectionCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[18px] bg-shell-panel-elevated p-4 shadow-[0_10px_28px_rgba(0,0,0,0.20)] backdrop-blur-sm",
        className,
      )}
    >
      {children}
    </section>
  );
}

function AttachmentCard({ attachment }: { attachment: SelectedFile }) {
  return (
    <SectionCard>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{attachment.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {attachment.kind} · {(attachment.size / 1024).toFixed(1)} KB
          </p>
        </div>
        <div className="rounded-full bg-background px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          {attachment.extension || "file"}
        </div>
      </div>
      <div className="mt-3 rounded-[14px] bg-background px-3 py-2.5 text-xs leading-6 text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        {attachment.previewText ? (
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap font-sans">{attachment.previewText}</pre>
        ) : (
          <p>{attachment.error ?? "当前文件暂时没有可展示的文本预览。"}</p>
        )}
      </div>
    </SectionCard>
  );
}

function flattenSteps(steps: AgentStep[]): AgentStep[] {
  return steps.flatMap((step) => [step, ...(step.children ? flattenSteps(step.children) : [])]);
}

function getStepTitle(step: AgentStep) {
  if (step.kind === "thinking") {
    return "思考";
  }

  return step.toolName || "工具调用";
}

function getStepSummary(step: AgentStep) {
  if (step.kind === "thinking") {
    return step.thinkingText?.trim() || "正在组织推理内容。";
  }

  if (step.toolError) {
    return step.toolError;
  }

  if (typeof step.streamOutput === "string" && step.streamOutput.trim()) {
    return step.streamOutput.trim();
  }

  if (typeof step.toolResult === "string" && step.toolResult.trim()) {
    return step.toolResult.trim();
  }

  return "已记录本次工具调用。";
}

function getStepStatusLabel(status: AgentStep["status"]) {
  switch (status) {
    case "success":
      return "完成";
    case "error":
      return "失败";
    case "cancelled":
      return "已取消";
    default:
      return "进行中";
  }
}

function getStepStatusClass(status: AgentStep["status"]) {
  switch (status) {
    case "success":
      return "bg-emerald-500/14 text-emerald-300";
    case "error":
      return "bg-rose-500/14 text-rose-300";
    case "cancelled":
      return "bg-background text-muted-foreground";
    default:
      return "bg-primary/12 text-primary";
  }
}

function SessionOverview({ session }: { session: ChatSession }) {
  return (
    <div className="space-y-3">
      <SectionCard>
        <p className="truncate text-sm font-medium text-foreground">{session.title}</p>
        <div className="mt-4 grid grid-cols-2 gap-2.5 text-sm">
          <div className="rounded-[14px] bg-background px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">消息</p>
            <p className="mt-2 text-lg font-semibold text-foreground">{session.messages.length}</p>
          </div>
          <div className="rounded-[14px] bg-background px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">附件</p>
            <p className="mt-2 text-lg font-semibold text-foreground">{session.attachments.length}</p>
          </div>
        </div>
        <div className="mt-3 rounded-[14px] bg-background px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">最后更新</p>
          <p className="mt-2 text-sm text-foreground">{formatRelativeTime(session.updatedAt)}</p>
        </div>
      </SectionCard>

      <SectionCard className="bg-shell-panel/80">
        <p className="text-sm font-medium text-foreground">本地状态</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          会话、草稿和附件元信息都保存在本地，后面 agent 运行记录也会继续挂在这一侧。
        </p>
      </SectionCard>
    </div>
  );
}

function StepTimeline({ steps }: { steps: AgentStep[] }) {
  if (steps.length === 0) {
    return (
      <EmptyPanelState
        title="还没有步骤"
        description="先发起一次对话，线程里的思考和工具调用会同步展示到这里。"
      />
    );
  }

  return (
    <div className="space-y-3">
      {steps.map((step) => (
        <SectionCard key={step.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{getStepTitle(step)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(step.startedAt).toLocaleString("zh-CN")}
              </p>
            </div>
            <div className={cn("rounded-full px-2.5 py-1 text-[11px]", getStepStatusClass(step.status))}>
              {getStepStatusLabel(step.status)}
            </div>
          </div>

          <div className="mt-3 rounded-[14px] bg-background px-3 py-2.5 text-xs leading-6 text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap font-sans">
              {getStepSummary(step)}
            </pre>
          </div>
        </SectionCard>
      ))}
    </div>
  );
}

export function ContextPanel({ open, session }: ContextPanelProps) {
  const [selectedTab, setSelectedTab] = useState<ContextTabId>("attachments");

  const recentSteps = useMemo(() => {
    if (!session) {
      return [];
    }

    return session.messages
      .flatMap((message) => flattenSteps(message.steps ?? []))
      .sort((left, right) => right.startedAt - left.startedAt);
  }, [session]);

  const content = useMemo(() => {
    switch (selectedTab) {
      case "attachments":
        if (!session?.attachments.length) {
          return (
            <EmptyPanelState
              title="还没有附件"
              description="先从输入区选择本地文件，这里会显示文本预览和基础元信息。"
            />
          );
        }
        return (
          <div className="space-y-3">
            {session.attachments.map((attachment) => (
              <AttachmentCard key={attachment.id} attachment={attachment} />
            ))}
          </div>
        );
      case "session":
        if (!session) {
          return (
            <EmptyPanelState
              title="暂无会话"
              description="创建一个新线程后，这里会展示当前会话的状态摘要。"
            />
          );
        }
        return <SessionOverview session={session} />;
      case "steps":
        return <StepTimeline steps={recentSteps} />;
      default:
        return null;
    }
  }, [recentSteps, selectedTab, session]);

  return (
    <motion.aside
      initial={false}
      animate={{
        opacity: open ? 1 : 0,
        x: open ? 0 : 16,
      }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(
        "flex h-full min-h-0 flex-col bg-shell-panel-muted px-4 py-4 shadow-[inset_1px_0_0_rgba(255,255,255,0.03)]",
        !open && "pointer-events-none",
      )}
      aria-hidden={!open}
    >
      <div className="pb-3">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Context</p>
        <div className="mt-2 flex items-end justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-foreground">上下文</h3>
            <p className="mt-1 text-xs text-muted-foreground">把当前线程的附件、摘要和步骤收在这里。</p>
          </div>
        </div>

        <div className="mt-4 rounded-[16px] bg-shell-panel-elevated p-1 shadow-[0_10px_24px_rgba(0,0,0,0.24)] backdrop-blur-sm">
          <div className="grid grid-cols-3 gap-1">
            {CONTEXT_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = tab.id === selectedTab;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedTab(tab.id)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-[12px] px-3 py-2 text-xs font-medium transition",
                    isActive
                      ? "bg-foreground text-background shadow-sm"
                      : "text-muted-foreground hover:bg-background hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-1 pt-4 pr-1">
        {content}
      </div>
    </motion.aside>
  );
}
