import { Card, CardContent, CardHeader, Tabs } from "@heroui/react";
import { ClockIcon, DocumentTextIcon, RectangleGroupIcon } from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import type { ChatSession, SelectedFile } from "@shared/contracts";
import { formatRelativeTime } from "@renderer/lib/session";
import { useState } from "react";

type ContextPanelProps = {
  open: boolean;
  session: ChatSession | null;
};

function EmptyPanelState({ title, description }: { title: string; description: string }) {
  return (
    <Card className="heroui-soft-card rounded-2xl border-dashed px-4 py-5 shadow-none">
      <p className="text-sm font-medium text-shell-200">{title}</p>
      <p className="mt-2 text-sm leading-6 text-shell-500">{description}</p>
    </Card>
  );
}

function AttachmentCard({ attachment }: { attachment: SelectedFile }) {
  return (
    <Card className="heroui-soft-card rounded-2xl p-4 shadow-none">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-shell-100">{attachment.name}</p>
          <p className="mt-1 text-xs text-shell-500">
            {attachment.kind} · {(attachment.size / 1024).toFixed(1)} KB
          </p>
        </div>
        <div className="rounded-xl border border-black/8 bg-white px-2 py-1 text-[11px] uppercase tracking-[0.2em] text-accent-500">
          {attachment.extension || "file"}
        </div>
      </div>
      <div className="mt-3 rounded-xl border border-black/6 bg-shell-950/70 p-3 text-xs leading-6 text-shell-400">
        {attachment.previewText ? (
          <pre className="max-h-52 overflow-auto whitespace-pre-wrap font-sans">{attachment.previewText}</pre>
        ) : (
          <p>{attachment.error ?? "当前文件暂时没有可展示的文本预览。"}</p>
        )}
      </div>
    </Card>
  );
}

export function ContextPanel({ open, session }: ContextPanelProps) {
  const [selectedTab, setSelectedTab] = useState("attachments");

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.aside
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 16 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="h-full border-l border-black/6 bg-[#f4f7fb] px-4 py-4"
        >
        <div className="mb-4">
          <p className="text-xs uppercase tracking-[0.24em] text-shell-500">Context</p>
          <h3 className="mt-2 text-lg font-semibold text-shell-100">上下文</h3>
        </div>

        <div className="flex h-[calc(100%-2rem)] flex-col">
          <Tabs.Root
            selectedKey={selectedTab}
            onSelectionChange={(key) => setSelectedTab(String(key))}
            variant="secondary"
            className="flex h-full flex-col"
          >
            <Tabs.List>
              <Tabs.Tab id="attachments" className="rounded-2xl border border-black/8 bg-white/78 px-3 py-2 text-shell-400">
                <span className="flex items-center justify-center gap-2">
                  <DocumentTextIcon className="h-4 w-4" />
                  附件
                </span>
              </Tabs.Tab>
              <Tabs.Tab id="session" className="rounded-2xl border border-black/8 bg-white/78 px-3 py-2 text-shell-400">
                <span className="flex items-center justify-center gap-2">
                  <ClockIcon className="h-4 w-4" />
                  会话
                </span>
              </Tabs.Tab>
              <Tabs.Tab id="steps" className="rounded-2xl border border-black/8 bg-white/78 px-3 py-2 text-shell-400">
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
                    <Card className="heroui-soft-card rounded-2xl p-4 shadow-none">
                      <CardHeader className="p-0 text-sm font-medium text-shell-100">{session.title}</CardHeader>
                      <CardContent className="mt-3 space-y-2 p-0 text-sm text-shell-400">
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
              <Card className="heroui-soft-card rounded-2xl p-4 shadow-none">
                <CardHeader className="p-0 text-sm font-medium text-shell-100">Agent 通路预留中</CardHeader>
                <CardContent className="mt-3 space-y-3 p-0 text-sm text-shell-400">
                  <div className="rounded-xl border border-lime-400/20 bg-lime-400/10 px-3 py-3 text-lime-400">
                    本地桌面壳：ready
                  </div>
                  <div className="rounded-xl border border-accent-400/20 bg-accent-500/10 px-3 py-3 text-accent-300">
                    文件选择与预览：ready
                  </div>
                  <div className="rounded-xl border border-black/8 bg-shell-950/70 px-3 py-3 text-shell-500">
                    真实模型 / tool 步骤流：pending
                  </div>
                </CardContent>
              </Card>
            </Tabs.Panel>
          </Tabs.Root>
        </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
