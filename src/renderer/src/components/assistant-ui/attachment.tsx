"use client";

import { PropsWithChildren, useEffect, useState, type FC } from "react";
import { FileText, PaperclipIcon, XIcon } from "lucide-react";
import {
  AttachmentPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  useAui,
  useAuiState,
} from "@assistant-ui/react";
import { useShallow } from "zustand/shallow";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@renderer/components/assistant-ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@renderer/components/assistant-ui/dialog";
import { TooltipIconButton } from "@renderer/components/assistant-ui/tooltip-icon-button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@renderer/components/assistant-ui/tooltip";
import { cn } from "@renderer/lib/utils";

const useFileSrc = (file: File | undefined) => {
  const [src, setSrc] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!file) {
      setSrc(undefined);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setSrc(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  return src;
};

const useAttachmentSrc = () => {
  const { file, src } = useAuiState(
    useShallow((s): { file?: File; src?: string } => {
      if (s.attachment.type !== "image") return {};
      if (s.attachment.file) return { file: s.attachment.file };

      const imageSrc = s.attachment.content?.find(
        (content) => content.type === "image",
      );
      return imageSrc && imageSrc.type === "image"
        ? { src: imageSrc.image }
        : {};
    }),
  );

  return useFileSrc(file) ?? src;
};

const AttachmentPreview: FC<{ src: string }> = ({ src }) => {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <img
      src={src}
      alt="Attachment preview"
      className={cn(
        "block h-auto max-h-[80vh] w-auto max-w-full object-contain",
        isLoaded ? "opacity-100" : "invisible",
      )}
      onLoad={() => setIsLoaded(true)}
    />
  );
};

const AttachmentPreviewDialog: FC<PropsWithChildren> = ({ children }) => {
  const src = useAttachmentSrc();

  if (!src) return children;

  return (
    <Dialog>
      <DialogTrigger
        className="cursor-pointer transition-colors hover:bg-accent/50"
        asChild
      >
        {children}
      </DialogTrigger>
      <DialogContent className="p-2 sm:max-w-3xl [&>button]:rounded-full [&>button]:bg-foreground/60 [&>button]:p-1 [&>button]:opacity-100 [&>button]:ring-0! [&_svg]:text-background [&>button]:hover:[&_svg]:text-destructive">
        <DialogTitle className="sr-only">Image Attachment Preview</DialogTitle>
        <div className="relative mx-auto flex max-h-[80dvh] w-full items-center justify-center overflow-hidden bg-background">
          <AttachmentPreview src={src} />
        </div>
      </DialogContent>
    </Dialog>
  );
};

const AttachmentThumb: FC = () => {
  const isImage = useAuiState((s) => s.attachment.type === "image");
  const src = useAttachmentSrc();

  return (
    <Avatar className="h-full w-full rounded-none">
      <AvatarImage
        src={src}
        alt="Attachment preview"
        className="object-cover"
      />
      <AvatarFallback delayMs={isImage ? 200 : 0}>
        <FileText className="size-8 text-muted-foreground" />
      </AvatarFallback>
    </Avatar>
  );
};

const AttachmentTile: FC = () => {
  const aui = useAui();
  const isComposer = aui.attachment.source !== "message";
  const isImage = useAuiState((s) => s.attachment.type === "image");
  const typeLabel = useAuiState((s) => {
    switch (s.attachment.type) {
      case "image":
        return "Image";
      case "document":
        return "Document";
      case "file":
        return "File";
      default:
        return s.attachment.type;
    }
  });

  return (
    <Tooltip>
      <AttachmentPrimitive.Root
        className={cn("relative", isImage && "only:*:first:size-24")}
      >
        <AttachmentPreviewDialog>
          <TooltipTrigger asChild>
            <div
              className="size-14 cursor-pointer overflow-hidden rounded-[calc(var(--composer-radius)-var(--composer-padding))] border bg-muted transition-opacity hover:opacity-75"
              role="button"
              aria-label={`${typeLabel} attachment`}
            >
              <AttachmentThumb />
            </div>
          </TooltipTrigger>
        </AttachmentPreviewDialog>
        {isComposer ? <AttachmentRemove /> : null}
      </AttachmentPrimitive.Root>
      <TooltipContent side="top">
        <AttachmentPrimitive.Name />
      </TooltipContent>
    </Tooltip>
  );
};

const AttachmentRemove: FC = () => {
  return (
    <AttachmentPrimitive.Remove asChild>
      <TooltipIconButton
        tooltip="Remove file"
        className="absolute top-1.5 right-1.5 size-3.5 rounded-full bg-white text-muted-foreground opacity-100 shadow-sm hover:bg-white! [&_svg]:text-black hover:[&_svg]:text-destructive"
        side="top"
      >
        <XIcon className="size-3 dark:stroke-[2.5px]" />
      </TooltipIconButton>
    </AttachmentPrimitive.Remove>
  );
};

export const UserMessageAttachments: FC = () => {
  return (
    <div className="col-span-full col-start-1 row-start-1 flex w-full flex-row justify-end gap-2 empty:hidden">
      <MessagePrimitive.Attachments>
        {() => <AttachmentTile />}
      </MessagePrimitive.Attachments>
    </div>
  );
};

export const ComposerAttachments: FC = () => {
  return (
    <div className="flex w-full flex-row items-center gap-2 overflow-x-auto empty:hidden">
      <ComposerPrimitive.Attachments>
        {() => <AttachmentTile />}
      </ComposerPrimitive.Attachments>
    </div>
  );
};

export const DesktopComposerAddAttachment: FC<{
  isPickingFiles?: boolean;
  onAttachFiles?: () => void;
}> = ({ isPickingFiles = false, onAttachFiles = () => undefined }) => {
  return (
    <TooltipIconButton
      tooltip="Add Attachment"
      side="bottom"
      type="button"
      onClick={onAttachFiles}
      disabled={isPickingFiles}
      className="h-8 w-8 rounded-md border border-black/8 bg-white p-0 text-muted-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
      aria-label="Add Attachment"
    >
      <PaperclipIcon className="size-4" />
    </TooltipIconButton>
  );
};
