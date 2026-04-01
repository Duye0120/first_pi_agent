import { useLayoutEffect, useRef } from "react";
import { Button, Chip, TextArea } from "@heroui/react";
import { PaperAirplaneIcon, PaperClipIcon, StopCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import type { ModelSelection, SelectedFile, ThinkingLevel } from "@shared/contracts";
import { ModelSelector } from "./ModelSelector";

type ComposerProps = {
  draft: string;
  attachments: SelectedFile[];
  isSending: boolean;
  isAgentRunning: boolean;
  isPickingFiles: boolean;
  currentModel: ModelSelection;
  thinkingLevel: ThinkingLevel;
  onDraftChange: (draft: string) => void;
  onAttachFiles: () => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onSend: () => void;
  onCancel: () => void;
  onModelChange: (model: ModelSelection) => void;
  onThinkingLevelChange: (level: ThinkingLevel) => void;
};

export function Composer({
  draft,
  attachments,
  isSending,
  isAgentRunning,
  isPickingFiles,
  currentModel,
  thinkingLevel,
  onDraftChange,
  onAttachFiles,
  onRemoveAttachment,
  onSend,
  onCancel,
  onModelChange,
  onThinkingLevelChange,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 240)}px`;
  }, [draft]);

  return (
    <section className="px-8 pb-6 pt-2">
      <div className="mx-auto max-w-4xl rounded-xl border border-black/8 bg-white px-5 py-4 shadow-[0_4px_14px_rgba(99,117,145,0.06)]">
        {attachments.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <Chip
                key={attachment.id}
                variant="tertiary"
                className="border-black/8 bg-white text-shell-300"
              >
                <span className="inline-flex items-center gap-2">
                  <PaperClipIcon className="h-4 w-4 text-accent-500" />
                  <span className="max-w-40 truncate">{attachment.name}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(attachment.id)}
                    className="rounded-full p-0.5 text-shell-500 transition hover:bg-accent-500/8 hover:text-shell-100"
                  >
                    <XMarkIcon className="h-3.5 w-3.5" />
                  </button>
                </span>
              </Chip>
            ))}
          </div>
        ) : null}

        <TextArea
          ref={textareaRef}
          value={draft}
          rows={1}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
          placeholder="向 first_pi_agent 提问，@ 添加文件，/ 输入命令…"
          variant="secondary"
          className="w-full border-none bg-transparent text-[15px] leading-8 text-shell-100 shadow-none outline-none placeholder:text-shell-500"
        />

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onAttachFiles} className="composer-ghost-button" isDisabled={isPickingFiles}>
              <PaperClipIcon className="h-4 w-4" />
              {isPickingFiles ? "读取中…" : "添加文件"}
            </Button>
            <span className="hidden text-xs text-shell-500 md:inline">Enter 发送，Shift + Enter 换行</span>
          </div>

          {isAgentRunning ? (
            <Button
              isIconOnly
              onClick={onCancel}
              className="h-10 min-w-10 rounded-full bg-red-500 text-white transition hover:bg-red-600"
            >
              <StopCircleIcon className="h-5 w-5" />
            </Button>
          ) : (
            <Button
              isIconOnly
              onClick={onSend}
              isDisabled={isSending || (!draft.trim() && attachments.length === 0)}
              className="h-10 min-w-10 rounded-full bg-shell-100 text-white transition hover:bg-accent-500 disabled:cursor-not-allowed disabled:bg-shell-700 disabled:text-shell-500"
            >
              <PaperAirplaneIcon className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-black/6 pt-3">
          <ModelSelector
            currentModel={currentModel}
            thinkingLevel={thinkingLevel}
            onModelChange={onModelChange}
            onThinkingLevelChange={onThinkingLevelChange}
          />
          <span className="ml-auto text-xs text-shell-500">workspace</span>
        </div>
      </div>
    </section>
  );
}
