import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DocumentTextIcon,
  FolderIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";
import type {
  InstalledSkillDetail,
  InstalledSkillInstance,
  InstalledSkillSource,
  SkillCatalogEntry,
  SkillDiscoveryResult,
} from "@shared/contracts";
import { Badge } from "@renderer/components/assistant-ui/badge";
import { Button } from "@renderer/components/assistant-ui/button";
import { cn } from "@renderer/lib/utils";
import { FieldInput, SettingsCard } from "./shared";

type InstalledFilter = "all" | InstalledSkillSource;
type TransferMode = "copy" | "move";
type SkillLocationId = "project" | "codex" | "claude" | "other";

const SKILL_LOCATION_OPTIONS: Array<{
  id: SkillLocationId;
  label: string;
  hint: string;
  rootHint: string;
}> = [
  {
    id: "project",
    label: "项目内",
    hint: "当前工作区 .agents/skills",
    rootHint: ".agents/skills",
  },
  {
    id: "codex",
    label: "Codex",
    hint: "全局技能目录",
    rootHint: "~/.codex/skills",
  },
  {
    id: "claude",
    label: "Claude",
    hint: "Claude skills 目录",
    rootHint: "~/.claude/skills",
  },
  {
    id: "other",
    label: "其他 agent",
    hint: "预留自定义根目录",
    rootHint: "custom /skills root",
  },
];

function formatPathForDisplay(value: string) {
  return value.replace(/\\/g, "/");
}

function sourceLabel(source: InstalledSkillSource) {
  return source === "project" ? "项目内" : "Codex";
}

function mapSourceToLocationId(source: InstalledSkillSource): SkillLocationId {
  return source === "project" ? "project" : "codex";
}

function getLocationMeta(locationId: SkillLocationId) {
  return SKILL_LOCATION_OPTIONS.find((option) => option.id === locationId)!;
}

function getDefaultTransferSource(skill: InstalledSkillDetail): InstalledSkillSource {
  return skill.primarySource ?? skill.instances[0]?.source ?? "project";
}

function getDefaultTransferTarget(
  skill: InstalledSkillDetail,
  source: InstalledSkillSource,
): SkillLocationId {
  const sourceLocation = mapSourceToLocationId(source);
  const installedLocations = new Set(
    skill.sources.map((installedSource) => mapSourceToLocationId(installedSource)),
  );

  const availableTarget = SKILL_LOCATION_OPTIONS.find(
    (option) => option.id !== sourceLocation && !installedLocations.has(option.id),
  );
  if (availableTarget) {
    return availableTarget.id;
  }

  return (
    SKILL_LOCATION_OPTIONS.find((option) => option.id !== sourceLocation)?.id ??
    sourceLocation
  );
}

function SelectionPill({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1.5 text-[12px] transition",
        active
          ? "bg-[color:var(--color-control-bg-active)] text-foreground shadow-[var(--color-control-shadow)] ring-1 ring-black/5 dark:ring-white/5"
          : "bg-[color:var(--color-control-panel-bg)] text-muted-foreground hover:bg-[color:var(--color-control-bg-hover)] hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function FilterTab({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] transition",
        active
          ? "bg-[color:var(--color-control-bg-active)] text-foreground shadow-[var(--color-control-shadow)]"
          : "text-muted-foreground hover:bg-[color:var(--color-control-bg-hover)] hover:text-foreground",
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "rounded-full px-1.5 py-0.5 text-[10px]",
          active
            ? "bg-[color:rgba(255,255,255,0.55)] text-foreground"
            : "bg-[color:var(--color-control-panel-bg)] text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function InlineInstance({
  skillId,
  showSource,
  instance,
  actionBusyKey,
  onOpenDirectory,
  onOpenSkillFile,
}: {
  skillId: string;
  showSource: boolean;
  instance: InstalledSkillInstance;
  actionBusyKey: string | null;
  onOpenDirectory: (skillId: string, source: InstalledSkillSource) => void;
  onOpenSkillFile: (skillId: string, source: InstalledSkillSource) => void;
}) {
  const directoryBusy = actionBusyKey === `${skillId}:${instance.source}:dir`;
  const skillFileBusy = actionBusyKey === `${skillId}:${instance.source}:skill`;

  const hasBadges = showSource || !!instance.missingSkillFile;

  return (
    <div className="rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-4 py-3.5">
      {hasBadges ? (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {showSource ? (
            <Badge
              variant="secondary"
              className="rounded-full px-2 py-0.5 text-[11px]"
            >
              {sourceLabel(instance.source)}
            </Badge>
          ) : null}
          {instance.missingSkillFile ? (
            <Badge variant="warning" className="rounded-full px-2 py-0.5 text-[11px]">
              缺少 SKILL.md
            </Badge>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">目录</p>
          <p className="mt-1.5 truncate font-mono text-[12px] leading-5 text-foreground" title={formatPathForDisplay(instance.skillPath)}>
            {formatPathForDisplay(instance.skillPath)}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenDirectory(skillId, instance.source)}
            disabled={directoryBusy}
          >
            <FolderIcon className="size-4" />
            {directoryBusy ? "打开中…" : "打开目录"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenSkillFile(skillId, instance.source)}
            disabled={!instance.skillFilePath || skillFileBusy}
          >
            <DocumentTextIcon className="size-4" />
            {skillFileBusy ? "打开中…" : "打开 SKILL"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TransferPreview({
  skill,
  transferSource,
  transferMode,
  transferTarget,
  isTransferring,
  onChangeSource,
  onChangeMode,
  onChangeTarget,
  onTransfer,
}: {
  skill: InstalledSkillDetail;
  transferSource: InstalledSkillSource;
  transferMode: TransferMode;
  transferTarget: SkillLocationId;
  isTransferring: boolean;
  onChangeSource: (source: InstalledSkillSource) => void;
  onChangeMode: (mode: TransferMode) => void;
  onChangeTarget: (target: SkillLocationId) => void;
  onTransfer: () => void;
}) {
  const targetMeta = getLocationMeta(transferTarget);
  const installedLocations = new Set(
    skill.sources.map((installedSource) => mapSourceToLocationId(installedSource)),
  );
  const targetInstalled = installedLocations.has(transferTarget);

  return (
    <div className="rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-4 py-3.5">
      <div className="space-y-4">
        {skill.sources.length > 1 ? (
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground/70">来源</p>
            <div className="flex flex-wrap gap-1.5">
              {skill.sources.map((source) => (
                <SelectionPill
                  key={`${skill.id}:source:${source}`}
                  active={transferSource === source}
                  label={sourceLabel(source)}
                  onClick={() => onChangeSource(source)}
                />
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground/70">迁移方式</p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => onChangeMode("copy")}
              className={cn(
                "flex flex-col gap-0.5 rounded-lg px-3 py-2 text-left transition",
                transferMode === "copy"
                  ? "bg-[color:var(--color-control-bg-active)] shadow-[var(--color-control-shadow)] ring-1 ring-black/5 dark:ring-white/5"
                  : "bg-[color:var(--color-control-panel-bg)] hover:bg-[color:var(--color-control-bg-active)]/50"
              )}
            >
              <span className={cn("text-[13px] font-medium", transferMode === "copy" ? "text-foreground" : "text-muted-foreground")}>复制 (Copy)</span>
              <span className="text-[10px] text-muted-foreground/80">保留原技能，在目标位置创建新副本</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeMode("move")}
              className={cn(
                "flex flex-col gap-0.5 rounded-lg px-3 py-2 text-left transition",
                transferMode === "move"
                  ? "bg-[color:var(--color-control-bg-active)] shadow-[var(--color-control-shadow)] ring-1 ring-black/5 dark:ring-white/5"
                  : "bg-[color:var(--color-control-panel-bg)] hover:bg-[color:var(--color-control-bg-active)]/50"
              )}
            >
              <span className={cn("text-[13px] font-medium", transferMode === "move" ? "text-foreground" : "text-muted-foreground")}>移动 (Move)</span>
              <span className="text-[10px] text-muted-foreground/80">将原技能从当前目录转移到目标位置</span>
            </button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground/70">目标位置</p>
          <div className="grid gap-2">
            {SKILL_LOCATION_OPTIONS.map((location) => {
              const installed = installedLocations.has(location.id);
              const selected = transferTarget === location.id;
              const sameAsSource =
                location.id === mapSourceToLocationId(transferSource);

              return (
                <button
                  key={`${skill.id}:target:${location.id}`}
                  type="button"
                  disabled={sameAsSource}
                  onClick={() => onChangeTarget(location.id)}
                  className={cn(
                    "flex flex-col gap-1 rounded-lg px-3 py-2.5 text-left transition",
                    sameAsSource
                      ? "cursor-not-allowed opacity-40 bg-[color:var(--color-control-panel-bg)]/50"
                      : selected
                        ? "bg-[color:var(--color-control-bg-active)] shadow-[var(--color-control-shadow)] ring-1 ring-black/5 dark:ring-white/5"
                        : "bg-[color:var(--color-control-panel-bg)] hover:bg-[color:var(--color-control-bg-active)]/50",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-[13px] font-medium", selected ? "text-foreground" : "text-muted-foreground")}>{location.label}</span>
                      {sameAsSource ? (
                        <span className="rounded-full bg-muted/20 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">当前</span>
                      ) : installed && !selected ? (
                        <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">已存在</span>
                      ) : null}
                    </div>
                    <span className="text-[11px] text-muted-foreground/70">{location.hint}</span>
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground/80">{location.rootHint}</div>
                </button>
              );
            })}
          </div>

          {targetInstalled ? (
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
              <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              目标位置已有同名 skill，操作后将触发覆盖
            </p>
          ) : null}
          
          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              variant="default"
              size="sm"
              className="bg-zinc-900 text-white shadow-sm transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              onClick={onTransfer}
              disabled={isTransferring || mapSourceToLocationId(transferSource) === transferTarget}
            >
              {isTransferring ? "执行中…" : `确认${transferMode === "copy" ? "复制" : "移动"}至 ${targetMeta.label}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InstalledSkillRow({
  skill,
  expanded,
  actionBusyKey,
  transferSource,
  transferMode,
  transferTarget,
  onToggle,
  onChangeTransferSource,
  onChangeTransferMode,
  onChangeTransferTarget,
  onOpenDirectory,
  onOpenSkillFile,
  onExecuteTransfer,
}: {
  skill: InstalledSkillDetail;
  expanded: boolean;
  actionBusyKey: string | null;
  transferSource: InstalledSkillSource;
  transferMode: TransferMode;
  transferTarget: SkillLocationId;
  onToggle: () => void;
  onChangeTransferSource: (source: InstalledSkillSource) => void;
  onChangeTransferMode: (mode: TransferMode) => void;
  onChangeTransferTarget: (target: SkillLocationId) => void;
  onOpenDirectory: (skillId: string, source: InstalledSkillSource) => void;
  onOpenSkillFile: (skillId: string, source: InstalledSkillSource) => void;
  onExecuteTransfer: (skillId: string, payload: { source: InstalledSkillSource; mode: TransferMode; target: SkillLocationId }) => void;
}) {
  return (
    <div className="rounded-[calc(var(--radius-shell)+2px)] bg-[color:var(--color-control-panel-bg)] shadow-[var(--color-control-shadow)]">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex w-full items-center gap-4 px-4 py-4 text-left transition",
          expanded
            ? "bg-[color:rgba(248,244,238,0.92)]"
            : "hover:bg-[color:var(--color-control-bg-hover)]",
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] text-muted-foreground">
            <Squares2X2Icon className="size-4" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[14px] font-medium text-foreground">
                {skill.displayName}
              </p>
              {skill.sources.map((source) => (
                <Badge
                  key={`${skill.id}:${source}`}
                  variant="secondary"
                  className="rounded-full px-2 py-0.5 text-[10px]"
                >
                  {sourceLabel(source)}
                </Badge>
              ))}
            </div>
            <p className="mt-1 truncate text-[12px] leading-6 text-muted-foreground">
              {skill.description}
            </p>
            {skill.usageTargets.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {skill.usageTargets.map((target) => (
                  <span
                    key={`${skill.id}:${target.entryPointId}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--color-control-bg)] px-2 py-1 text-[10px] text-muted-foreground shadow-[var(--color-control-shadow)]"
                  >
                    <SparklesIcon className="size-3.5" />
                    <span>{target.label}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2 text-muted-foreground">
          <span className="text-[11px]">
            {expanded ? "收起" : "详情"}
          </span>
          {expanded ? (
            <ChevronUpIcon className="size-4" />
          ) : (
            <ChevronDownIcon className="size-4" />
          )}
        </div>
      </button>

      {expanded ? (
        <div className="px-4 pb-4">
          <div className="grid gap-4 pt-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
            <div className="space-y-2">
              <p className="px-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">已安装位置</p>
              {skill.instances.map((instance) => (
                <InlineInstance
                  key={`${skill.id}:${instance.source}`}
                  skillId={skill.id}
                  showSource={skill.sources.length > 1}
                  instance={instance}
                  actionBusyKey={actionBusyKey}
                  onOpenDirectory={onOpenDirectory}
                  onOpenSkillFile={onOpenSkillFile}
                />
              ))}
            </div>

            <div className="space-y-2">
              <p className="px-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">迁移</p>
              <TransferPreview
                skill={skill}
                transferSource={transferSource}
                transferMode={transferMode}
                transferTarget={transferTarget}
                isTransferring={actionBusyKey === `${skill.id}:transfer`}
                onChangeSource={onChangeTransferSource}
                onChangeMode={onChangeTransferMode}
                onChangeTarget={onChangeTransferTarget}
                onTransfer={() => onExecuteTransfer(skill.id, { source: transferSource, mode: transferMode, target: transferTarget })}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DiscoveryRow({
  entry,
  installingPackage,
  onInstall,
}: {
  entry: SkillCatalogEntry;
  installingPackage: string | null;
  onInstall: (packageName: string) => void;
}) {
  const installing = installingPackage === entry.packageName;

  return (
    <div className="flex flex-col gap-3 rounded-[calc(var(--radius-shell)+2px)] bg-[color:var(--color-control-panel-bg)] px-4 py-4 shadow-[var(--color-control-shadow)] lg:flex-row lg:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] text-muted-foreground">
          <SparklesIcon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[14px] font-medium text-foreground">
              {entry.displayName}
            </p>
            {entry.sourceLabel ? (
              <Badge
                variant="secondary"
                className="rounded-full px-2 py-0.5 text-[10px]"
              >
                {entry.sourceLabel}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-[12px] leading-6 text-muted-foreground">
            {entry.description}
          </p>
          <p className="mt-1 break-all font-mono text-[11px] leading-5 text-muted-foreground">
            {entry.packageName}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 lg:pl-4">
        {entry.learnMoreUrl ? (
          <Button variant="ghost" size="sm" asChild>
            <a href={entry.learnMoreUrl} target="_blank" rel="noreferrer">
              了解更多
            </a>
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onInstall(entry.packageName)}
          disabled={installing}
        >
          <ArrowDownTrayIcon className="size-4" />
          {installing ? "安装中…" : "安装到 Codex"}
        </Button>
      </div>
    </div>
  );
}

export function SkillsSection() {
  const desktopApi = window.desktopApi;
  const [installedSkills, setInstalledSkills] = useState<InstalledSkillDetail[]>([]);
  const [loadingInstalled, setLoadingInstalled] = useState(true);
  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<InstalledFilter>("all");
  const [discovery, setDiscovery] = useState<SkillDiscoveryResult | null>(null);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [installingPackage, setInstallingPackage] = useState<string | null>(null);
  const [actionBusyKey, setActionBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transferSources, setTransferSources] = useState<
    Partial<Record<string, InstalledSkillSource>>
  >({});
  const [transferModes, setTransferModes] = useState<
    Partial<Record<string, TransferMode>>
  >({});
  const [transferTargets, setTransferTargets] = useState<
    Partial<Record<string, SkillLocationId>>
  >({});
  const deferredQuery = useDeferredValue(query.trim());

  const loadInstalledSkills = useCallback(async () => {
    if (!desktopApi?.skills) {
      setInstalledSkills([]);
      setLoadingInstalled(false);
      return;
    }

    setLoadingInstalled(true);
    try {
      const nextSkills = await desktopApi.skills.listInstalled();
      setInstalledSkills(nextSkills);
      setError(null);
      startTransition(() => {
        setExpandedSkillId((current) => {
          if (!current) {
            return null;
          }

          return nextSkills.some((skill) => skill.id === current) ? current : null;
        });
      });
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "读取 skills 列表失败",
      );
    } finally {
      setLoadingInstalled(false);
    }
  }, [desktopApi]);

  useEffect(() => {
    void loadInstalledSkills();
  }, [loadInstalledSkills]);

  useEffect(() => {
    if (!desktopApi?.skills) {
      return;
    }

    if (deferredQuery.length < 2) {
      setDiscovery(null);
      setDiscoveryLoading(false);
      return;
    }

    let cancelled = false;
    setDiscoveryLoading(true);
    const timer = window.setTimeout(() => {
      void desktopApi.skills
        .searchCatalog(deferredQuery)
        .then((result) => {
          if (!cancelled) {
            setDiscovery(result);
          }
        })
        .catch((nextError) => {
          if (!cancelled) {
            setDiscovery({
              query: deferredQuery,
              entries: [],
              error:
                nextError instanceof Error
                  ? nextError.message
                  : "搜索 catalog 失败",
              rawOutput: "",
            });
          }
        })
        .finally(() => {
          if (!cancelled) {
            setDiscoveryLoading(false);
          }
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [deferredQuery, desktopApi]);

  const installedCounts = useMemo(() => {
    let project = 0;
    let user = 0;
    for (const skill of installedSkills) {
      if (skill.sources.includes("project")) {
        project += 1;
      }
      if (skill.sources.includes("user")) {
        user += 1;
      }
    }

    return {
      all: installedSkills.length,
      project,
      user,
    };
  }, [installedSkills]);

  const filteredInstalledSkills = useMemo(() => {
    const keyword = deferredQuery.toLowerCase();

    return installedSkills.filter((skill) => {
      const matchesFilter =
        filter === "all" ? true : skill.sources.includes(filter);
      if (!matchesFilter) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const haystack = [
        skill.displayName,
        skill.description,
        skill.id,
        ...skill.sources,
        ...skill.instances.map((instance) => instance.skillPath),
      ]
        .join("\n")
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [deferredQuery, filter, installedSkills]);

  useEffect(() => {
    if (filteredInstalledSkills.length === 0) {
      setExpandedSkillId(null);
      return;
    }

    if (
      expandedSkillId !== null &&
      !filteredInstalledSkills.some((skill) => skill.id === expandedSkillId)
    ) {
      setExpandedSkillId(null);
    }
  }, [expandedSkillId, filteredInstalledSkills]);

  const handleInstall = useCallback(
    async (packageName: string) => {
      if (!desktopApi?.skills) {
        return;
      }

      setInstallingPackage(packageName);
      setError(null);

      try {
        const result = await desktopApi.skills.install({
          packageName,
          target: "user",
        });
        setInstalledSkills(result.skills);
        startTransition(() => {
          setExpandedSkillId(
            result.installedSkillId ?? result.installedSkill?.id ?? null,
          );
          setFilter("all");
        });
      } catch (nextError) {
        setError(
          nextError instanceof Error ? nextError.message : "安装 skill 失败",
        );
      } finally {
        setInstallingPackage(null);
      }
    },
    [desktopApi],
  );

  const runInstanceAction = useCallback(
    async (nextBusyKey: string, callback: () => Promise<void>) => {
      setActionBusyKey(nextBusyKey);
      setError(null);
      try {
        await callback();
      } catch (nextError) {
        setError(
          nextError instanceof Error ? nextError.message : "执行技能操作失败",
        );
      } finally {
        setActionBusyKey(null);
      }
    },
    [],
  );

  const handleOpenDirectory = useCallback(
    (skillId: string, source: InstalledSkillSource) => {
      if (!desktopApi?.skills) {
        return;
      }

      void runInstanceAction(`${skillId}:${source}:dir`, () =>
        desktopApi.skills.openDirectory(skillId, source),
      );
    },
    [desktopApi, runInstanceAction],
  );

  const handleOpenSkillFile = useCallback(
    (skillId: string, source: InstalledSkillSource) => {
      if (!desktopApi?.skills) {
        return;
      }

      void runInstanceAction(`${skillId}:${source}:skill`, () =>
        desktopApi.skills.openSkillFile(skillId, source),
      );
    },
    [desktopApi, runInstanceAction],
  );

  const handleExecuteTransfer = useCallback(
    (skillId: string, payload: { source: InstalledSkillSource; mode: TransferMode; target: SkillLocationId }) => {
      if (!desktopApi?.skills) return;

      void runInstanceAction(`${skillId}:transfer`, async () => {
         // Mock transition delay for UX
         await new Promise((resolve) => setTimeout(resolve, 800));
         await loadInstalledSkills();
      });
    },
    [desktopApi, runInstanceAction, loadInstalledSkills]
  );

  return (
    <div className="space-y-4">
      <SettingsCard className="overflow-visible">
        <div className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1">
            <FilterTab
              active={filter === "all"}
              label="全部"
              count={installedCounts.all}
              onClick={() => setFilter("all")}
            />
            <FilterTab
              active={filter === "project"}
              label="项目内"
              count={installedCounts.project}
              onClick={() => setFilter("project")}
            />
            <FilterTab
              active={filter === "user"}
              label="Codex"
              count={installedCounts.user}
              onClick={() => setFilter("user")}
            />
          </div>

          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <div className="relative min-w-0 lg:w-[280px]">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <FieldInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索技能"
                className="pl-9"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void loadInstalledSkills()}
              disabled={loadingInstalled}
              className="h-9 px-3"
            >
              <ArrowPathIcon className="size-4" />
              {loadingInstalled ? "刷新中…" : "刷新"}
            </Button>
          </div>
        </div>
      </SettingsCard>

      {error ? (
        <div className="rounded-[var(--radius-shell)] bg-[color:rgba(239,68,68,0.08)] px-4 py-3 text-[12px] leading-6 text-[color:rgb(185,28,28)]">
          {error}
        </div>
      ) : null}

      <SettingsCard title="已安装">
        <div className="space-y-2 px-3 pb-3">
          {loadingInstalled ? (
            <div className="rounded-[calc(var(--radius-shell)+2px)] bg-[color:var(--color-control-panel-bg)] px-4 py-10 text-center text-[12px] text-muted-foreground shadow-[var(--color-control-shadow)]">
              正在读取本地 skills…
            </div>
          ) : filteredInstalledSkills.length === 0 ? (
            <div className="rounded-[calc(var(--radius-shell)+2px)] bg-[color:var(--color-control-panel-bg)] px-4 py-10 text-center text-[12px] text-muted-foreground shadow-[var(--color-control-shadow)]">
              当前过滤条件下没有匹配的 skill。
            </div>
          ) : (
            filteredInstalledSkills.map((skill) => {
              const transferSource =
                transferSources[skill.id] ?? getDefaultTransferSource(skill);
              const transferMode = transferModes[skill.id] ?? "copy";
              const transferTarget =
                transferTargets[skill.id] ??
                getDefaultTransferTarget(skill, transferSource);

              return (
                <InstalledSkillRow
                  key={skill.id}
                  skill={skill}
                  expanded={expandedSkillId === skill.id}
                  actionBusyKey={actionBusyKey}
                  transferSource={transferSource}
                  transferMode={transferMode}
                  transferTarget={transferTarget}
                  onToggle={() =>
                    setExpandedSkillId((current) =>
                      current === skill.id ? null : skill.id,
                    )
                  }
                  onChangeTransferSource={(source) => {
                    setTransferSources((current) => ({
                      ...current,
                      [skill.id]: source,
                    }));
                    setTransferTargets((current) => {
                      const nextTarget =
                        current[skill.id] ?? getDefaultTransferTarget(skill, source);
                      if (nextTarget === mapSourceToLocationId(source)) {
                        return {
                          ...current,
                          [skill.id]: getDefaultTransferTarget(skill, source),
                        };
                      }

                      return current;
                    });
                  }}
                  onChangeTransferMode={(mode) =>
                    setTransferModes((current) => ({
                      ...current,
                      [skill.id]: mode,
                    }))
                  }
                  onChangeTransferTarget={(target) =>
                    setTransferTargets((current) => ({
                      ...current,
                      [skill.id]: target,
                    }))
                  }
                  onOpenDirectory={handleOpenDirectory}
                  onOpenSkillFile={handleOpenSkillFile}
                  onExecuteTransfer={handleExecuteTransfer}
                />
              );
            })
          )}
        </div>
      </SettingsCard>

      <SettingsCard
        title="发现更多 skills"
        description="这一块只负责发现和安装，本地管理继续独立可用。"
      >
        <div className="space-y-2 px-3 pb-3">
          {deferredQuery.length < 2 ? (
            <div className="rounded-[calc(var(--radius-shell)+2px)] bg-[color:var(--color-control-panel-bg)] px-4 py-10 text-center text-[12px] text-muted-foreground shadow-[var(--color-control-shadow)]">
              输入至少 2 个字符后开始发现更多 skills。
            </div>
          ) : discoveryLoading ? (
            <div className="rounded-[calc(var(--radius-shell)+2px)] bg-[color:var(--color-control-panel-bg)] px-4 py-10 text-center text-[12px] text-muted-foreground shadow-[var(--color-control-shadow)]">
              正在查询可安装 skills…
            </div>
          ) : discovery?.error ? (
            <div className="rounded-[var(--radius-shell)] bg-[color:rgba(239,68,68,0.08)] px-4 py-3 text-[12px] leading-6 text-[color:rgb(185,28,28)]">
              {discovery.error}
            </div>
          ) : discovery && discovery.entries.length > 0 ? (
            discovery.entries.map((entry) => (
              <DiscoveryRow
                key={entry.packageName}
                entry={entry}
                installingPackage={installingPackage}
                onInstall={handleInstall}
              />
            ))
          ) : discovery?.rawOutput ? (
            <div className="rounded-[calc(var(--radius-shell)+2px)] bg-[color:var(--color-control-panel-bg)] px-4 py-4 shadow-[var(--color-control-shadow)]">
              <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                <SparklesIcon className="size-4" />
                CLI 返回了结果，当前还没解析出结构化条目
              </div>
              <pre className="mt-3 overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-shell)] bg-[color:var(--color-control-bg)] px-4 py-3 font-mono text-[11px] leading-5 text-foreground">
                {discovery.rawOutput}
              </pre>
            </div>
          ) : (
            <div className="rounded-[calc(var(--radius-shell)+2px)] bg-[color:var(--color-control-panel-bg)] px-4 py-10 text-center text-[12px] text-muted-foreground shadow-[var(--color-control-shadow)]">
              暂时没有找到匹配的可安装 skill。
            </div>
          )}
        </div>
      </SettingsCard>
    </div>
  );
}
