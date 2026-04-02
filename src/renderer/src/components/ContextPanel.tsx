import { Card, CardContent, CardHeader, Tabs } from "@heroui/react";
import { ClockIcon, DocumentTextIcon, RectangleGroupIcon } from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import type { AgentStep, ChatSession, SelectedFile } from "@shared/contracts";
import { formatRelativeTime } from "@renderer/lib/session";
import { useMemo, useState } from "react";

type ContextPanelProps = {
  open: boolean;
  session: ChatSession | null;
};

function EmptyPanelState({ title, description }: { title: string; description: string }) {
  return (
    <Card className="rounded-2xl border border-dashed border-border bg-card px-4 py-5 shadow-none">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </Card>
  );
}

function AttachmentCard({ attachment }: { attachment: SelectedFile }) {
  return (
    <Card className="rounded-2xl border border-border bg-card p-4 shadow-none">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{attachment.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {attachment.kind} · {(attachment.size / 1024).toFixed(1)} KB
          </p>
        </div>
        <div className="rounded-xl border border-border bg-muted px-2 py-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          {attachment.extension || "file"}
        </div>
      </div>
      <div className="mt-3 rounded-xl border border-border bg-muted/50 p-3 text-xs leading-6 text-muted-foreground">
        {attachment.previewText ? (
          <pre className="max-h-52 overflow-auto whitespace-pre-wrap font-sans">{attachment.previewText}</pre>
        ) : (
          <p>{attachment.error ?? "当前文件暂时没有可展示的文本预览。"}</p>
        )}
      </div>
    </Card>
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
      return "border-emerald-400/20 bg-emerald-400/10 text-emerald-600";
    case "error":
      return "border-rose-400/20 bg-rose-400/10 text-rose-500";
    case "cancelled":
      return "border-border bg-muted text-muted-foreground";
    default:
      return "border-primary/15 bg-primary/10 text-primary";
  }
}

export function ContextPanel({ open, session }: ContextPanelProps) {
  const [selectedTab, setSelectedTab] = useState("attachments");
  const recentSteps = useMemo(() => {
    if (!session) {
      return [];
    }

    return session.messages
      .flatMap((message) => flattenSteps(message.steps ?? []))
      .sort((left, right) => right.startedAt - left.startedAt);
  }, [session]);

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.aside
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 16 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="h-full border-l border-shell-border bg-shell-panel-muted px-4 py-4"
        >
        <div className="mb-4">
          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Context</p>
          <h3 className="mt-2 text-lg font-semibold text-foreground">上下文</h3>
        </div>

        <div className="flex h-[calc(100%-2rem)] flex-col">
          <Tabs.Root
            selectedKey={selectedTab}
            onSelectionChange={(key) => setSelectedTab(String(key))}
            variant="secondary"
            className="flex h-full flex-col"
          >
            <Tabs.List>
              <Tabs.Tab id="attachments" className="rounded-2xl border border-border bg-shell-panel px-3 py-2 text-muted-foreground">
                <span className="flex items-center justify-center gap-2">
                  <DocumentTextIcon className="h-4 w-4" />
                  附件
                </span>
              </Tabs.Tab>
              <Tabs.Tab id="session" className="rounded-2xl border border-border bg-shell-panel px-3 py-2 text-muted-foreground">
                <span className="flex items-center justify-center gap-2">
                  <ClockIcon className="h-4 w-4" />
                  会话
                </span>
              </Tabs.Tab>
              <Tabs.Tab id="steps" className="rounded-2xl border border-border bg-shell-panel px-3 py-2 text-muted-foreground">
                <span className="flex items-center justify-center gap-2">
                  <RectangleGroupIcon className="h-4 w-4" />
                  步骤
                </span>
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel id="attachments" className="mt-4 flex-1 overflow-y-auto px-0">
              <div className="space-y-3 outline-none">
                {session?.attachments.length ? (
                  session.attachments.map((attachment) => <AttachmentCard key={attachment.id} attachment={attachment} />)
                ) : (
                  <EmptyPanelState title="还没有附件" description="先从输入区选择本地文件，这里会显示文本预览和基础元信息。" />
                )}
              </div>
            </Tabs.Panel>

            <Tabs.Panel id="session" className="mt-4 flex-1 overflow-y-auto px-0">
              <div className="space-y-3 outline-none">
                {session ? (
                  <>
                    <Card className="rounded-2xl border border-border bg-card p-4 shadow-none">
                      <CardHeader className="p-0 text-sm font-medium text-foreground">{session.title}</CardHeader>
                      <CardContent className="mt-3 space-y-2 p-0 text-sm text-muted-foreground">
                        <p>消息数：{session.messages.length}</p>
                        <p>附件数：{session.attachments.length}</p>
                        <p>最后更新：{formatRelativeTime(session.updatedAt)}</p>
                      </CardContent>
                    </Card>
                    <EmptyPanelState
                      title="持久化已就位"
                      description="会话、草稿和附件元信息都保存到本地。后面接入 agent 时，可以直接把运行记录也挂进来。"
                    />
                  </>
                ) : (
                  <EmptyPanelState title="暂无会话" description="创建一个新线程后，这里会展示当前会话的状态摘要。" />
                )}
              </div>
            </Tabs.Panel>

            <Tabs.Panel id="steps" className="mt-4 flex-1 overflow-y-auto px-0">
              <div className="space-y-3 outline-none">
                {recentSteps.length > 0 ? (
                  recentSteps.map((step) => (
                    <Card key={step.id} className="rounded-2xl border border-border bg-card p-4 shadow-none">
                      <CardHeader className="flex items-start justify-between gap-3 p-0">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{getStepTitle(step)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {new Date(step.startedAt).toLocaleString("zh-CN")}
                          </p>
                        </div>
                        <div className={`rounded-full border px-2 py-1 text-[11px] ${getStepStatusClass(step.status)}`}>
                          {getStepStatusLabel(step.status)}
                        </div>
                      </CardHeader>
                      <CardContent className="mt-3 p-0">
                        <div className="rounded-xl border border-border bg-muted/40 px-3 py-3 text-xs leading-6 text-muted-foreground">
                          <pre className="max-h-52 overflow-auto whitespace-pre-wrap font-sans">
                            {getStepSummary(step)}
                          </pre>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <EmptyPanelState title="还没有步骤" description="先发起一次对话，assistant-ui 线程里的思考和工具调用会同步展示到这里。" />
                )}
              </div>
            </Tabs.Panel>
          </Tabs.Root>
        </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
