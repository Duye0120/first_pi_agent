import { useLayoutEffect, useRef } from "react";
import { Chip, TextArea } from "@heroui/react";
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
    <section className="px-6 pb-4 pt-1">
      <div className="mx-auto max-w-3xl rounded-xl border border-black/8 bg-white px-4 py-3 shadow-[0_2px_8px_rgba(99,117,145,0.04)]">
        {attachments.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {attachments.map((attachment) => (
              <Chip
                key={attachment.id}
                variant="tertiary"
                className="border-black/8 bg-white text-[11px] text-gray-500"
              >
                <span className="inline-flex items-center gap-1.5">
                  <PaperClipIcon className="h-3 w-3 text-gray-400" />
                  <span className="max-w-32 truncate">{attachment.name}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(attachment.id)}
                    className="rounded-full p-0.5 text-gray-400 transition hover:bg-black/5 hover:text-gray-600"
                  >
                    <XMarkIcon className="h-3 w-3" />
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
          placeholder="向 Pi Agent 提问..."
          variant="secondary"
          className="w-full border-none bg-transparent text-[13px] leading-7 text-gray-800 shadow-none outline-none placeholder:text-gray-300"
        />

        <div className="mt-2 flex items-center justify-between gap-2 border-t border-black/4 pt-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onAttachFiles}
              disabled={isPickingFiles}
              className="rounded p-1 text-gray-400 transition hover:bg-black/4 hover:text-gray-600 disabled:cursor-not-allowed disabled:text-gray-200"
              title="添加文件"
            >
              <PaperClipIcon className="h-3.5 w-3.5" />
            </button>
            <ModelSelector
              currentModel={currentModel}
              thinkingLevel={thinkingLevel}
              onModelChange={onModelChange}
              onThinkingLevelChange={onThinkingLevelChange}
            />
          </div>

          {isAgentRunning ? (
            <button
              type="button"
              onClick={onCancel}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white transition hover:bg-red-600"
            >
              <StopCircleIcon className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSend}
              disabled={isSending || (!draft.trim() && attachments.length === 0)}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-800 text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
            >
              <PaperAirplaneIcon className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
