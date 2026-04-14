import { ChevronRightIcon, ChevronDownIcon, FolderIcon, CheckIcon } from "lucide-react";
import { useState, useMemo } from "react";
import type { GitDiffFile } from "@shared/contracts";
import { cn } from "@renderer/lib/utils";

type TreeNode = {
  name: string;
  path: string;
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

function CustomCheckbox({ checked, indeterminate, onChange }: { checked: boolean, indeterminate?: boolean, onChange: () => void }) {
  return (
    <div 
      onClick={(e) => { e.stopPropagation(); onChange(); }}
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

function TreeItem({ 
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

  return (
    <div className="flex flex-col text-[11px] font-mono">
      <div
        className={cn(
          "flex cursor-pointer select-none items-center gap-1.5 rounded-[4px] px-1 py-1 hover:bg-secondary/50 group/item",
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

        <div className="ml-auto flex shrink-0 items-center gap-2 pr-1">
          {!isDir && status && (
            <span className={cn("inline-block min-w-[12px] text-center text-[10px] font-bold uppercase", colorClass)}>
              {status === 'modified' ? 'M' : status === 'untracked' ? 'U' : status === 'deleted' ? 'D' : ''}
            </span>
          )}
          
          <CustomCheckbox 
            checked={isChecked} 
            indeterminate={isIndeterminate}
            onChange={() => onToggleSelection(node.allChildPaths, !isChecked)}
          />
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
}

export function FileTreeView({ 
  files, 
  onSelectFile,
  selectedPaths,
  onToggleSelection
}: { 
  files: GitDiffFile[], 
  onSelectFile: (path: string) => void,
  selectedPaths: Set<string>,
  onToggleSelection: (paths: string[], selected: boolean) => void
}) {
  const tree = useMemo(() => buildTree(files), [files]);

  return (
    <div className="flex flex-col h-full bg-[color:var(--color-control-panel-bg)] py-1">
      {tree.map(node => (
        <TreeItem 
          key={node.path} 
          node={node} 
          onSelectFile={onSelectFile}
          selectedPaths={selectedPaths}
          onToggleSelection={onToggleSelection}
        />
      ))}
    </div>
  );
}
