import { ChevronRightIcon, ChevronDownIcon, FolderIcon } from "lucide-react";
import { useState, useMemo } from "react";
import type { GitDiffFile } from "@shared/contracts";
import { cn } from "@renderer/lib/utils";

type TreeNode = {
  name: string;
  path: string;
  isDirectory: boolean;
  file?: GitDiffFile;
  children: Record<string, TreeNode>;
};

function buildTree(files: GitDiffFile[]): TreeNode[] {
  const root: TreeNode = { name: "root", path: "", isDirectory: true, children: {} };

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

function TreeItem({ 
  node, 
  depth = 0, 
  onSelectFile 
}: { 
  node: TreeNode; 
  depth?: number; 
  onSelectFile: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const isDir = node.isDirectory;
  const status = node.file?.status;

  const colorClass = 
    status === "modified" ? "text-[color:var(--color-diff-del-text)]/80" :
    status === "deleted" ? "text-red-500/70" :
    status === "untracked" ? "text-[color:var(--color-diff-add-text)]/80" : "text-muted-foreground";

  return (
    <div className="flex flex-col text-[11px] font-mono">
      <div
        className={cn(
          "flex cursor-pointer select-none items-center gap-1.5 rounded-[4px] px-1 py-1 hover:bg-secondary/50",
          !isDir && "group"
        )}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
        onClick={() => {
          if (isDir) {
            setExpanded(!expanded);
          } else {
            onSelectFile(node.path);
          }
        }}
      >
        {isDir ? (
          expanded ? <ChevronDownIcon className="size-3 shrink-0 opacity-60" /> : <ChevronRightIcon className="size-3 shrink-0 opacity-60" />
        ) : (
          <span className="size-3 shrink-0" />
        )}
        
        {isDir ? (
          <FolderIcon className="size-3 shrink-0 opacity-60" />
        ) : null}

        <span className={cn("truncate", !isDir ? "text-foreground" : "text-foreground opacity-80")}>
          {node.name}
        </span>

        {!isDir && status && (
          <span className={cn("ml-auto shrink-0 pr-1 text-[10px] font-bold uppercase", colorClass)}>
            {status === 'modified' ? 'M' : status === 'untracked' ? 'U' : status === 'deleted' ? 'D' : ''}
          </span>
        )}
      </div>

      {isDir && expanded && (
        <div className="flex flex-col">
          {Object.values(node.children).map((child) => (
            <TreeItem key={child.path} node={child} depth={depth + 1} onSelectFile={onSelectFile} />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTreeView({ files, onSelectFile }: { files: GitDiffFile[], onSelectFile: (path: string) => void }) {
  const tree = useMemo(() => buildTree(files), [files]);

  return (
    <div className="flex flex-col h-full bg-[color:var(--color-control-panel-bg)] py-1">
      {tree.map(node => (
        <TreeItem key={node.path} node={node} onSelectFile={onSelectFile} />
      ))}
    </div>
  );
}
