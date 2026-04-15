import { ChevronRightIcon, ChevronDownIcon, FolderIcon, CheckIcon } from "lucide-react";
import { useState, useMemo, useEffect, useRef, memo } from "react";
import type { GitDiffFile } from "@shared/contracts";
import { cn } from "@renderer/lib/utils";

type TreeNode = {
  name: string;
  path: string;
  dir?: string;
  isDirectory: boolean;
  file?: GitDiffFile;
  children: Record<string, TreeNode>;
  allChildPaths: string[];
};

function buildTree(files: GitDiffFile[]): TreeNode[] {
  const root: TreeNode = { name: "root", path: "", isDirectory: true, children: {}, allChildPaths: [] };

  for (const file of files) {
    const parts = file.path.split("/");
    let current = root;
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = i === parts.length - 1;

      if (!current.children[part]) {
        current.children[part] = {
          name: part,
          path: currentPath,
          isDirectory: !isFile,
          file: isFile ? file : undefined,
          children: {},
          allChildPaths: []
        };
      }
      current = current.children[part];
    }
  }

  // Compress empty intermediate folders
  function compress(node: TreeNode) {
    if (!node.isDirectory) return;
    const childrenKeys = Object.keys(node.children);
    if (childrenKeys.length === 1) {
      const child = node.children[childrenKeys[0]];
      if (child.isDirectory) {
        node.name = `${node.name}/${child.name}`;
        node.path = child.path;
        node.children = child.children;
        compress(node);
        return;
      }
    }
    for (const key of childrenKeys) {
      compress(node.children[key]);
    }
  }

  for (const key of Object.keys(root.children)) {
    compress(root.children[key]);
  }

  function calculatePaths(node: TreeNode): string[] {
    if (!node.isDirectory) {
      node.allChildPaths = [node.path];
      return node.allChildPaths;
    }
    const paths: string[] = [];
    for (const key in node.children) {
      paths.push(...calculatePaths(node.children[key]));
    }
    node.allChildPaths = paths;
    return paths;
  }

  for (const key in root.children) {
    calculatePaths(root.children[key]);
  }

  function toArray(node: TreeNode): TreeNode[] {
    const children = Object.values(node.children).sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1; // Folders first
      }
      return a.name.localeCompare(b.name);
    });
    for (const child of children) {
      if (child.isDirectory) {
        child.children = Object.fromEntries(toArray(child).map(c => [c.name, c]));
      }
    }
    return children;
  }

  return toArray(root);
}

function CustomCheckbox({ checked, indeterminate, onChange }: { checked: boolean, indeterminate?: boolean, onChange?: () => void }) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onChange?.(); }}
      className={cn(
        "flex size-[14px] shrink-0 cursor-pointer items-center justify-center rounded-[3px] border transition-colors",
        checked || indeterminate
          ? "border-[color:var(--color-diff-add-text)] bg-[color:var(--color-diff-add-text)] text-white"
          : "border-muted-foreground/40 bg-transparent hover:border-foreground/40"
      )}
    >
      {indeterminate ? (
        <div className="h-0.5 w-[8px] rounded-full bg-current" />
      ) : checked ? (
        <CheckIcon className="size-[10px]" strokeWidth={3.5} />
      ) : null}
    </div>
  );
}

const DRAG_EVENT = "chela-drag-select-trigger";
let dragSelectValue = true;
let isDraggingCheckbox = false;
let lastDragY: number | null = null;
let dragRafId: number | null = null;

if (typeof window !== "undefined") {
  const cleanupDrag = () => {
    isDraggingCheckbox = false;
    lastDragY = null;
    if (dragRafId) {
      cancelAnimationFrame(dragRafId);
      dragRafId = null;
    }
  };

  window.addEventListener("mouseup", cleanupDrag);
  window.addEventListener("mousemove", (e) => {
    if (isDraggingCheckbox && e.buttons === 1) {
      const currentY = e.clientY;
      const clientX = e.clientX;
      const prevY = lastDragY;

      if (dragRafId) cancelAnimationFrame(dragRafId);

      dragRafId = requestAnimationFrame(() => {
        if (prevY !== null) {
          const diff = Math.abs(currentY - prevY);
          // Interp if we skip > 20 pixels (row is ~22px) -> reduce calculating frequency
          if (diff > 20) {
            const steps = Math.ceil(diff / 15);
            // batch dispatched events
            const elementsToTrigger = new Set<Element>();

            for (let i = 1; i < steps; i++) {
              const stepY = prevY + (currentY - prevY) * (i / steps);
              // avoid repeatedly triggering same element by caching what we hit
              const el = document.elementFromPoint(clientX, stepY);
              if (el) elementsToTrigger.add(el);
            }

            for (const el of elementsToTrigger) {
              el.dispatchEvent(new CustomEvent(DRAG_EVENT, { bubbles: true }));
            }
          }
        }
        lastDragY = currentY;
      });
    } else {
      cleanupDrag();
    }
  });
}

const TreeItem = memo(function TreeItem({
  node,
  depth = 0,
  onSelectFile,
  selectedPaths,
  onToggleSelection
}: {
  node: TreeNode;
  depth?: number;
  onSelectFile: (path: string) => void;
  selectedPaths: Set<string>;
  onToggleSelection: (paths: string[], isSelected: boolean) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(true);

  const isDir = node.isDirectory;
  const status = node.file?.status;

  const checkedCount = node.allChildPaths.filter(p => selectedPaths.has(p)).length;
  const isChecked = checkedCount > 0 && checkedCount === node.allChildPaths.length;
  const isIndeterminate = checkedCount > 0 && checkedCount < node.allChildPaths.length;

  const colorClass =
    status === "modified" ? "text-[color:var(--color-diff-del-text)]/80" :
      status === "deleted" ? "text-red-500/70" :
        status === "untracked" ? "text-[color:var(--color-diff-add-text)]/80" : "text-muted-foreground";

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const handler = () => {
      if (isDraggingCheckbox) {
        onToggleSelection(node.allChildPaths, dragSelectValue);
      }
    };
    el.addEventListener(DRAG_EVENT, handler);
    return () => el.removeEventListener(DRAG_EVENT, handler);
  }, [node.allChildPaths, onToggleSelection]);

  return (
    <div className="flex flex-col text-[11px] font-mono">
      <div
        ref={rowRef}
        className={cn(
          "flex cursor-pointer select-none items-center gap-1.5 rounded-[4px] pl-1.5 pr-2 py-1 hover:bg-secondary/50 group/item",
          !isDir && "group"
        )}
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).closest('.checkbox-trigger')) {
            dragSelectValue = !isChecked; // 记录拖拽初始期望状态
            isDraggingCheckbox = true;
            lastDragY = e.clientY;
            onToggleSelection(node.allChildPaths, dragSelectValue);
          }
        }}
        onMouseEnter={(e) => {
          if (e.buttons === 1 && isDraggingCheckbox) { // Left mouse down and dragging
            // 只有当鼠标滑动并按住时，才继续传递相同的选中状态
            onToggleSelection(node.allChildPaths, dragSelectValue);
          }
        }}
        onClick={(e) => {
          // 如果点击的不是复选框，原有逻辑展开/选中
          if (!(e.target as HTMLElement).closest('.checkbox-trigger')) {
            if (isDir) {
              setExpanded(!expanded);
            } else {
              onSelectFile(node.path);
            }
          }
        }}
      >
        <div
          className="flex shrink-0 items-center justify-center mr-0.5 checkbox-trigger"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <CustomCheckbox
            checked={isChecked}
            indeterminate={isIndeterminate}
          />
        </div>

        {/* 缩进占位 */}
        <div style={{ width: `${Math.max(0, depth) * 14}px` }} className="shrink-0" />

        {isDir ? (
          expanded ? <ChevronDownIcon className="size-3 shrink-0 opacity-60" /> : <ChevronRightIcon className="size-3 shrink-0 opacity-60" />
        ) : depth >= 0 ? (
          <span className="size-3 shrink-0" />
        ) : null}

        {isDir ? (
          <FolderIcon className="size-3 shrink-0 opacity-60" />
        ) : null}

        <div className="flex overflow-hidden w-full items-baseline gap-2">
          <span className={cn("flex-shrink-0 max-w-full truncate", !isDir ? "text-foreground" : "text-foreground opacity-80")}>
            {node.name}
          </span>
          {node.dir ? (
            <span className="flex-shrink truncate text-[10px] text-muted-foreground/60">{node.dir}</span>
          ) : null}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2 pr-1">
          {!isDir && status && (
            <span className={cn("inline-block min-w-[12px] text-center text-[10px] font-bold uppercase", colorClass)}>
              {status === 'modified' ? 'M' : status === 'untracked' ? 'U' : status === 'deleted' ? 'D' : ''}
            </span>
          )}
        </div>
      </div>

      {isDir && expanded && (
        <div className="flex flex-col">
          {Object.values(node.children).map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              onSelectFile={onSelectFile}
              selectedPaths={selectedPaths}
              onToggleSelection={onToggleSelection}
            />
          ))}
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  if (prevProps.node !== nextProps.node) return false;
  if (prevProps.depth !== nextProps.depth) return false;
  if (prevProps.onSelectFile !== nextProps.onSelectFile) return false;
  if (prevProps.onToggleSelection !== nextProps.onToggleSelection) return false;

  const getCheckedCount = (paths: string[], selected: Set<string>) => {
    let count = 0;
    for (const p of paths) {
      if (selected.has(p)) count++;
    }
    return count;
  };

  const prevCount = getCheckedCount(prevProps.node.allChildPaths, prevProps.selectedPaths);
  const nextCount = getCheckedCount(nextProps.node.allChildPaths, nextProps.selectedPaths);

  return prevCount === nextCount;
});

export function FileTreeView({
  files,
  onSelectFile,
  selectedPaths,
  onToggleSelection,
  viewMode = 'tree'
}: {
  files: GitDiffFile[],
  onSelectFile: (path: string) => void,
  selectedPaths: Set<string>,
  onToggleSelection: (paths: string[], selected: boolean) => void,
  viewMode?: 'tree' | 'list'
}) {
  const tree = useMemo(() => {
    if (viewMode === 'list') {
      return files.map(file => {
        const parts = file.path.split("/");
        const name = parts.pop() || file.path;
        const dir = parts.join("/");
        return {
          name,
          dir,
          path: file.path,
          isDirectory: false,
          file,
          children: {},
          allChildPaths: [file.path]
        };
      });
    }
    return buildTree(files);
  }, [files, viewMode]);

  return (
    <div className="flex flex-col h-full bg-[color:var(--color-control-panel-bg)] py-1">
      {tree.map(node => (
        <TreeItem
          key={node.path}
          node={node}
          depth={viewMode === 'list' ? -1 : 0}
          onSelectFile={onSelectFile}
          selectedPaths={selectedPaths}
          onToggleSelection={onToggleSelection}
        />
      ))}
    </div>
  );
}
