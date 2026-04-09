import { globalShortcut, BrowserWindow } from "electron";
import { appLogger } from "./logger.js";

const SHORTCUT = "Alt+Space";

export function registerQuickInvoke(getWindow: () => BrowserWindow | null): void {
  const ok = globalShortcut.register(SHORTCUT, () => {
    const win = getWindow();
    if (!win) return;

    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    win.focus();

    // 通知 renderer 聚焦到 composer
    win.webContents.send("quick-invoke:focus-composer");
  });

  if (ok) {
    appLogger.info({
      scope: "quick-invoke",
      message: `全局快捷键 ${SHORTCUT} 注册成功`,
    });
  } else {
    appLogger.warn({
      scope: "quick-invoke",
      message: `全局快捷键 ${SHORTCUT} 注册失败（可能被其他应用占用）`,
    });
  }
}

export function unregisterQuickInvoke(): void {
  globalShortcut.unregister(SHORTCUT);
}
