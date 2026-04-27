"use client";

import { PropsWithChildren, useEffect, useMemo, useState, type FC } from "react";
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

type AttachmentImageState = {
  file?: File;
  src?: string;
  isImage: boolean;
};

function fileUrlToPath(fileUrl: string) {
  try {
    const url = new URL(fileUrl);
    if (url.protocol !== "file:") {
      return null;
    }

    return decodeURIComponent(
      url.pathname.replace(/^\/([A-Za-z]:)/, "$1"),
    );
  } catch {
    return null;
  }
}

function formatFileSize(size?: number) {
  if (!size || Number.isNaN(size)) {
    return null;
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} kB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

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
    useShallow((s): AttachmentImageState => {
      const imageSrc = s.attachment.content?.find(
        (content) => content.type === "image",
      );

      const isImage =
        s.attachment.type === "image" ||
        s.attachment.contentType?.startsWith("image/") === true ||
        (imageSrc?.type === "image");

      if (!isImage) {
        return { isImage: false };
      }

      if (s.attachment.file) {
        return { file: s.attachment.file, isImage: true };
      }

      return imageSrc && imageSrc.type === "image"
        ? { src: imageSrc.image, isImage: true }
        : { isImage: true };
    }),
  );

  const fileSrc = useFileSrc(file);
  const [resolvedSrc, setResolvedSrc] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (fileSrc) {
      setResolvedSrc(fileSrc);
      return;
    }

    if (!src) {
      setResolvedSrc(undefined);
      return;
    }

    if (!src.startsWith("file://")) {
      setResolvedSrc(src);
      return;
    }

    const filePath = fileUrlToPath(src);
    if (!filePath) {
      setResolvedSrc(src);
      return;
    }

    let cancelled = false;
    void window.desktopApi?.files.readImageDataUrl(filePath).then((dataUrl) => {
      if (!cancelled) {
        setResolvedSrc(dataUrl ?? src);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [fileSrc, src]);

  return resolvedSrc;
};

const useAttachmentCardInfo = () => {
  const { name, contentType, fileSize } = useAuiState(
    useShallow((s) => ({
      name: s.attachment.name,
      contentType: s.attachment.contentType,
      fileSize: s.attachment.file?.size,
    })),
  );

  const subtitle = useMemo(() => {
    const sizeLabel = formatFileSize(fileSize);
    if (sizeLabel) {
      return sizeLabel;
    }

    if (contentType?.startsWith("image/")) {
      return "图片附件";
    }

    return "本地附件";
  }, [contentType, fileSize]);

  return { name, subtitle };
};

const AttachmentPreview: FC<{ src: string }> = ({ src }) => {
  return (
    <img
      src={src}
      alt="Attachment preview"
      className="block h-auto max-h-[80vh] w-auto max-w-full object-contain"
    />
  );
};

const AttachmentPreviewDialog: FC<PropsWithChildren> = ({ children }) => {
  const src = useAttachmentSrc();

  if (!src) return children;

  return (
    <Dialog>
      <DialogTrigger
        className="cursor-pointer transition-colors hover:bg-shell-hover"
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
  const src = useAttachmentSrc();
  const isImage = useAuiState(
    (s) =>
      s.attachment.type === "image" ||
      s.attachment.contentType?.startsWith("image/") === true ||
      s.attachment.content?.some((content) => content.type === "image") === true,
  );

  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-[var(--radius-shell)] bg-slate-100/80">
      {isImage && src ? (
        <img
          src={src}
          alt="Attachment preview"
          className="h-full w-full rounded-[var(--radius-shell)] object-cover"
        />
      ) : (
        <FileText className="size-8 text-muted-foreground" />
      )}
    </div>
  );
};

const AttachmentTile: FC = () => {
  const aui = useAui();
  const isComposer = aui.attachment.source !== "message";
  const src = useAttachmentSrc();
  const { name, subtitle } = useAttachmentCardInfo();
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
        className="group relative shrink-0"
      >
        <AttachmentPreviewDialog>
          <TooltipTrigger asChild>
            <div
              className="flex h-[72px] w-[220px] cursor-pointer items-center gap-3 rounded-[var(--radius-shell)] bg-slate-50/90 px-3 py-3 transition-colors hover:bg-slate-100/90"
              role="button"
              aria-label={`${typeLabel} attachment`}
            >
              <div className="size-12 shrink-0 overflow-hidden rounded-[var(--radius-shell)] bg-slate-100">
                <AttachmentThumb />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-slate-900">
                  {name}
                </p>
                <p className="mt-0.5 text-[12px] text-slate-500">
                  {subtitle}
                </p>
              </div>
            </div>
          </TooltipTrigger>
        </AttachmentPreviewDialog>
        {isComposer ? <AttachmentRemove /> : null}
      </AttachmentPrimitive.Root>
      <TooltipContent side="top">
        {src ? "点击预览" : name}
      </TooltipContent>
    </Tooltip>
  );
};

const AttachmentRemove: FC = () => {
  return (
    <AttachmentPrimitive.Remove asChild>
      <TooltipIconButton
        tooltip="Remove file"
        className="absolute top-1.5 right-1.5 size-5 rounded-full bg-white/92 text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-white [&_svg]:size-3.5 [&_svg]:text-black hover:[&_svg]:text-destructive"
        side="top"
      >
        <XIcon className="dark:stroke-[2.5px]" />
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
    <div className="flex w-full flex-row items-center gap-2 overflow-x-auto pb-1 empty:hidden">
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
      className="h-8 w-8 rounded-[var(--radius-shell)] bg-transparent p-0 text-[color:var(--color-text-secondary)] shadow-none ring-0 transition hover:bg-[color:var(--color-control-bg-hover)] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      aria-label="Add Attachment"
    >
      <PaperclipIcon className="size-4" />
    </TooltipIconButton>
  );
};
