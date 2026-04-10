// ---------------------------------------------------------------------------
// Scheduler — 轻量级定时调度引擎
// ---------------------------------------------------------------------------
//
// 基于 setInterval 的简单调度，支持：
// - 固定间隔（intervalMs）
// - 每日定时（dailyAt: "HH:mm"）
// - 持久化 job 定义（userData/data/scheduler-jobs.json）
// - bus 集成：每次触发 emit "schedule:triggered"
// ---------------------------------------------------------------------------

import { app } from "electron";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { bus } from "./event-bus.js";
import { appLogger } from "./logger.js";
import { getSettings } from "./settings.js";
import { getClockTimeInTimeZone, resolveConfiguredTimeZone } from "../shared/timezone.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScheduleJobDef = {
  id: string;
  name: string;
  enabled: boolean;
} & (
  | { type: "interval"; intervalMs: number }
  | { type: "daily"; time: string } // "HH:mm"
);

export type ScheduleJobCallback = (jobId: string) => void | Promise<void>;

type RunningJob = {
  def: ScheduleJobDef;
  callback: ScheduleJobCallback;
  timerId: ReturnType<typeof setInterval> | ReturnType<typeof setTimeout> | null;
};

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

class Scheduler {
  private jobs = new Map<string, RunningJob>();
  private started = false;
  private dailyCheckTimer: ReturnType<typeof setInterval> | null = null;

  register(def: ScheduleJobDef, callback: ScheduleJobCallback): void {
    if (this.jobs.has(def.id)) {
      this.unregister(def.id);
    }

    const job: RunningJob = { def, callback, timerId: null };
    this.jobs.set(def.id, job);

    if (this.started && def.enabled) {
      this.startJob(job);
    }

    appLogger.info({
      scope: "scheduler",
      message: `注册调度任务：${def.name} (${def.id})`,
    });
  }

  unregister(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    this.stopJob(job);
    this.jobs.delete(jobId);
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    for (const job of this.jobs.values()) {
      if (job.def.enabled) {
        this.startJob(job);
      }
    }

    // 每分钟检查 daily jobs
    this.dailyCheckTimer = setInterval(() => this.checkDailyJobs(), 60_000);

    appLogger.info({
      scope: "scheduler",
      message: `Scheduler 启动，${this.jobs.size} 个任务已注册`,
    });
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;

    for (const job of this.jobs.values()) {
      this.stopJob(job);
    }

    if (this.dailyCheckTimer) {
      clearInterval(this.dailyCheckTimer);
      this.dailyCheckTimer = null;
    }
  }

  getJobs(): ScheduleJobDef[] {
    return Array.from(this.jobs.values()).map((j) => j.def);
  }

  setEnabled(jobId: string, enabled: boolean): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.def.enabled = enabled;

    if (this.started) {
      if (enabled) {
        this.startJob(job);
      } else {
        this.stopJob(job);
      }
    }
  }

  // ── private ────────────────────────────────────────

  private startJob(job: RunningJob): void {
    if (job.timerId) return;

    if (job.def.type === "interval") {
      job.timerId = setInterval(() => {
        this.executeJob(job);
      }, job.def.intervalMs);
    }
    // daily jobs 由 checkDailyJobs 驱动，不需要单独 timer
  }

  private stopJob(job: RunningJob): void {
    if (job.timerId) {
      clearInterval(job.timerId);
      clearTimeout(job.timerId);
      job.timerId = null;
    }
  }

  private checkDailyJobs(): void {
    const now = new Date();
    const timeZone = resolveConfiguredTimeZone(getSettings().timeZone);
    const hhmm = getClockTimeInTimeZone(now, timeZone);

    for (const job of this.jobs.values()) {
      if (job.def.type === "daily" && job.def.enabled && job.def.time === hhmm) {
        this.executeJob(job);
      }
    }
  }

  private executeJob(job: RunningJob): void {
    const cronExpr =
      job.def.type === "interval"
        ? `every ${job.def.intervalMs}ms`
        : `daily@${job.def.time}`;

    bus.emit("schedule:triggered", {
      jobId: job.def.id,
      cronExpr,
    });

    try {
      const result = job.callback(job.def.id);
      if (result && typeof (result as Promise<void>).catch === "function") {
        (result as Promise<void>).catch((err) => {
          appLogger.warn({
            scope: "scheduler",
            message: `调度任务 ${job.def.id} 异步执行失败`,
            error: err instanceof Error ? err : new Error(String(err)),
          });
        });
      }
    } catch (err) {
      appLogger.warn({
        scope: "scheduler",
        message: `调度任务 ${job.def.id} 执行失败`,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 持久化
// ---------------------------------------------------------------------------

function getJobsPath(): string {
  return join(app.getPath("userData"), "data", "scheduler-jobs.json");
}

export function loadPersistedJobs(): ScheduleJobDef[] {
  const filePath = getJobsPath();
  if (!existsSync(filePath)) return [];
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as ScheduleJobDef[];
  } catch {
    return [];
  }
}

export function savePersistedJobs(jobs: ScheduleJobDef[]): void {
  const filePath = getJobsPath();
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(jobs, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// 单例导出
// ---------------------------------------------------------------------------

export const scheduler = new Scheduler();
