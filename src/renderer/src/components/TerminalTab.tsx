import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import type { Settings } from "@shared/contracts";
import "@xterm/xterm/css/xterm.css";

type Props = {
  terminalId: string;
  visible: boolean;
  settings: Settings | null;
};

function getCssVariable(name: string, fallback: string) {
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback
  );
}

function getTerminalTheme() {
  return {
    background: getCssVariable("--color-shell-terminal", "#f8f9fc"),
    foreground: getCssVariable("--color-terminal-text", "#1e293b"),
    cursor: getCssVariable("--color-accent", "#3b82f6"),
    selectionBackground: getCssVariable("--color-accent-subtle", "#bfdbfe"),
    selectionForeground: getCssVariable("--color-terminal-text", "#1e293b"),
    black: getCssVariable("--terminal-ansi-black", "#334155"),
    red: getCssVariable("--terminal-ansi-red", "#ef4444"),
    green: getCssVariable("--terminal-ansi-green", "#22c55e"),
    yellow: getCssVariable("--terminal-ansi-yellow", "#eab308"),
    blue: getCssVariable("--terminal-ansi-blue", "#3b82f6"),
    magenta: getCssVariable("--terminal-ansi-magenta", "#a855f7"),
    cyan: getCssVariable("--terminal-ansi-cyan", "#06b6d4"),
    white: getCssVariable("--terminal-ansi-white", "#f1f5f9"),
    brightBlack: getCssVariable("--terminal-ansi-bright-black", "#64748b"),
    brightRed: getCssVariable("--terminal-ansi-bright-red", "#f87171"),
    brightGreen: getCssVariable("--terminal-ansi-bright-green", "#4ade80"),
    brightYellow: getCssVariable("--terminal-ansi-bright-yellow", "#facc15"),
    brightBlue: getCssVariable("--terminal-ansi-bright-blue", "#60a5fa"),
    brightMagenta: getCssVariable("--terminal-ansi-bright-magenta", "#c084fc"),
    brightCyan: getCssVariable("--terminal-ansi-bright-cyan", "#22d3ee"),
    brightWhite: getCssVariable("--terminal-ansi-bright-white", "#ffffff"),
  };
}

function parseFontFamily(fontFamily: string | undefined): string {
  if (!fontFamily) return "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace";

  const fonts = fontFamily.split(',').map((f) => {
    const trimmed = f.trim();
    if (trimmed.includes(' ') && !trimmed.startsWith("'") && !trimmed.startsWith('"')) {
      return `"${trimmed}"`;
    }
    return trimmed;
  });

  if (!fonts.some(f => f.toLowerCase() === 'monospace')) {
    fonts.push('monospace');
  }

  return fonts.join(', ');
}

export function TerminalTab({ terminalId, visible, settings }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !terminalId) return;

    const term = new Terminal({
      fontSize: settings?.terminal.fontSize ?? 13,
      fontFamily: parseFontFamily(settings?.terminal.fontFamily),
      cursorBlink: true,
      cursorStyle: "bar",
      theme: getTerminalTheme(),
      scrollback: settings?.terminal.scrollback ?? 5000,
      allowProposedApi: true,
      customGlyphs: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(container);

    try {
      const webglAddon = new WebglAddon();
      term.loadAddon(webglAddon);
    } catch (e) {
      console.warn("Failed to load WebGL addon", e);
    }

    fitAddon.fit();

    termRef.current = term;
    fitRef.current = fitAddon;

    const desktopApi = window.desktopApi;

    // Send user keystrokes to pty
    const disposeData = term.onData((data) => {
      desktopApi?.terminal.write(terminalId, data);
    });

    // Receive pty output
    const cleanupOnData = desktopApi?.terminal.onData((id, data) => {
      if (id === terminalId) term.write(data);
    });

    // Handle resize
    const disposeResize = term.onResize(({ cols, rows }) => {
      desktopApi?.terminal.resize(terminalId, cols, rows);
    });

    // Window resize handler
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(container);

    cleanupRef.current = () => {
      disposeData.dispose();
      disposeResize.dispose();
      cleanupOnData?.();
      resizeObserver.disconnect();
      term.dispose();
    };

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      termRef.current = null;
      fitRef.current = null;
    };
  }, [
    settings?.terminal.fontFamily,
    settings?.terminal.fontSize,
    settings?.terminal.scrollback,
    terminalId,
  ]);

  // Re-fit when visibility changes
  useEffect(() => {
    if (visible && fitRef.current) {
      requestAnimationFrame(() => fitRef.current?.fit());
      requestAnimationFrame(() => termRef.current?.focus());
    }
  }, [visible]);

  useEffect(() => {
    const terminal = termRef.current;
    const container = containerRef.current;
    if (!terminal || !container) {
      return;
    }

    terminal.options.fontFamily = parseFontFamily(settings?.terminal.fontFamily);
    terminal.options.fontSize =
      settings?.terminal.fontSize ?? terminal.options.fontSize;
    terminal.options.theme = getTerminalTheme();
    container.style.backgroundColor = getCssVariable(
      "--color-shell-terminal",
      "#f8f9fc",
    );
    fitRef.current?.fit();
  }, [
    settings?.terminal.fontFamily,
    settings?.terminal.fontSize,
    settings?.theme,
    settings?.customTheme,
  ]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full bg-shell-terminal"
      style={{ padding: "4px 0 0 4px" }}
    />
  );
}
