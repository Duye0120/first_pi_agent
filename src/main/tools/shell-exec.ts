import { spawn } from "node:child_process";
import path from "node:path";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { checkShellCommand } from "../security.js";

const parameters = Type.Object({
  command: Type.String({ description: "要执行的 shell 命令" }),
  cwd: Type.Optional(Type.String({ description: "工作目录（默认 workspace 根目录）" })),
  timeout: Type.Optional(Type.Number({ description: "超时秒数（默认 30，上限 300）" })),
});

type ShellExecDetails = {
  command: string;
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
};

export function createShellExecTool(workspacePath: string): AgentTool<typeof parameters, ShellExecDetails> {
  return {
    name: "shell_exec",
    label: "执行命令",
    description: "执行 shell 命令。可以安装依赖、运行测试、查看进程状态等。命令在 workspace 目录下执行。",
    parameters,
    async execute(_toolCallId, params, signal?, onUpdate?) {
      const check = checkShellCommand(params.command);

      if (!check.allowed) {
        return {
          content: [{ type: "text", text: `命令被安全策略拦截: ${check.reason}\n如果你确实需要执行，请在终端中手动运行。` }],
          details: {
            command: params.command,
            cwd: workspacePath,
            exitCode: -1,
            stdout: "",
            stderr: check.reason ?? "blocked",
            durationMs: 0,
          },
        };
      }

      // TODO: Phase 4 will implement in-app confirmation for needsConfirmation commands.
      // For now, auto-approve all non-blacklisted commands.

      const cwd = params.cwd
        ? path.resolve(workspacePath, params.cwd)
        : workspacePath;
      const timeoutSec = Math.min(params.timeout ?? 30, 300);
      const startTime = Date.now();

      return new Promise((resolve) => {
        const isWindows = process.platform === "win32";
        const shellCmd = isWindows ? "cmd.exe" : "/bin/sh";
        const shellArgs = isWindows ? ["/c", params.command] : ["-c", params.command];

        const child = spawn(shellCmd, shellArgs, {
          cwd,
          env: { ...process.env },
          stdio: ["ignore", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";
        let killed = false;

        // Timeout handling
        const timer = setTimeout(() => {
          killed = true;
          child.kill("SIGTERM");
          setTimeout(() => {
            if (!child.killed) child.kill("SIGKILL");
          }, 3000);
        }, timeoutSec * 1000);

        // Abort signal
        if (signal) {
          signal.addEventListener("abort", () => {
            killed = true;
            child.kill("SIGTERM");
          }, { once: true });
        }

        child.stdout.on("data", (chunk: Buffer) => {
          const text = chunk.toString();
          stdout += text;
          // Stream update to frontend
          onUpdate?.({
            content: [{ type: "text", text }],
            details: { type: "stdout", data: text } as any,
          });
        });

        child.stderr.on("data", (chunk: Buffer) => {
          const text = chunk.toString();
          stderr += text;
          onUpdate?.({
            content: [{ type: "text", text }],
            details: { type: "stderr", data: text } as any,
          });
        });

        child.on("close", (code) => {
          clearTimeout(timer);
          const durationMs = Date.now() - startTime;
          const exitCode = code ?? (killed ? -1 : 0);

          // Truncate stdout for LLM if too long
          const MAX_LINES = 200;
          const lines = stdout.split("\n");
          let llmStdout: string;
          if (lines.length > MAX_LINES) {
            const tail = lines.slice(-50).join("\n");
            llmStdout = `stdout（最后 50 行，共 ${lines.length} 行）:\n${tail}\n\n[输出共 ${lines.length} 行，已截断。完整输出可在终端面板查看]`;
          } else {
            llmStdout = `stdout:\n${stdout}`;
          }

          const text = [
            `命令: ${params.command}`,
            `退出码: ${exitCode}`,
            killed ? "(命令超时被终止)" : "",
            llmStdout,
            stderr ? `stderr:\n${stderr}` : "",
          ].filter(Boolean).join("\n");

          resolve({
            content: [{ type: "text", text }],
            details: {
              command: params.command,
              cwd,
              exitCode,
              stdout,
              stderr,
              durationMs,
            },
          });
        });

        child.on("error", (err) => {
          clearTimeout(timer);
          resolve({
            content: [{ type: "text", text: `命令执行失败: ${err.message}` }],
            details: {
              command: params.command,
              cwd,
              exitCode: -1,
              stdout: "",
              stderr: err.message,
              durationMs: Date.now() - startTime,
            },
          });
        });
      });
    },
  };
}
