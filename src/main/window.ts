import { cpSync, existsSync, readdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, screen } from "electron";
import { IPC_CHANNELS } from "../shared/ipc.js";
import { appLogger, attachWindowLogging } from "./logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIN_WINDOW_WIDTH = 920;
const MIN_WINDOW_HEIGHT = 600;
const APP_PRODUCT_NAME = "Chela";
const LEGACY_USER_DATA_DIR_NAMES = ["first-pi-agent", "first_pi_agent"];

let mainWindow: BrowserWindow | null = null;

function safeSendToRenderer(channel: string, payload: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  try {
    mainWindow.webContents.send(channel, payload);
  } catch (error) {
    appLogger.warn({
      scope: "app.window",
      message: "向渲染进程发送窗口事件失败",
      data: {
        channel,
      },
      error,
    });
  }
}

export function configureAppIdentity(): void {
  app.setName(APP_PRODUCT_NAME);
}

function getPreloadPath() {
  return join(__dirname, "../preload/index.mjs");
}

function getRendererPath() {
  return join(__dirname, "../renderer/index.html");
}

function getDevServerUrl() {
  return process.env.ELECTRON_RENDERER_URL ?? process.env.VITE_DEV_SERVER_URL;
}

export function migrateLegacyUserData(): void {
  const currentUserDataPath = app.getPath("userData");
  const hasCurrentData = existsSync(currentUserDataPath)
    && readdirSync(currentUserDataPath).length > 0;

  if (hasCurrentData) {
    return;
  }

  const appDataPath = app.getPath("appData");

  for (const legacyDirName of LEGACY_USER_DATA_DIR_NAMES) {
    const legacyUserDataPath = join(appDataPath, legacyDirName);
    if (legacyUserDataPath === currentUserDataPath || !existsSync(legacyUserDataPath)) {
      continue;
    }

    if (!existsSync(currentUserDataPath)) {
      renameSync(legacyUserDataPath, currentUserDataPath);
      return;
    }

    cpSync(legacyUserDataPath, currentUserDataPath, {
      recursive: true,
      force: false,
      errorOnExist: false,
    });
    return;
  }
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function requireMainWindow(): BrowserWindow {
  if (!mainWindow) {
    throw new Error("Main window is not ready yet.");
  }

  return mainWindow;
}

export function computeWindowFrameState() {
  const window = requireMainWindow();
  return {
    isMaximized: window.isMaximized(),
  };
}

export function computeWindowBounds() {
  const window = requireMainWindow();
  const bounds = window.getBounds();
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };
}

export function setMainWindowBounds(bounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const window = requireMainWindow();
  const display = screen.getDisplayMatching(window.getBounds());
  const workArea = display.workArea;
  const [minWidth, minHeight] = window.getMinimumSize();
  // M20: 把 x/y 钳制到 workArea 内，避免传入负值或离屏坐标导致后续 maxWidth/maxHeight 异常或窗口被推到屏幕外。
  const nextX = Math.min(
    Math.max(workArea.x, Math.round(bounds.x)),
    workArea.x + workArea.width - minWidth,
  );
  const nextY = Math.min(
    Math.max(workArea.y, Math.round(bounds.y)),
    workArea.y + workArea.height - minHeight,
  );
  const maxWidth = Math.max(minWidth, workArea.x + workArea.width - nextX);
  const maxHeight = Math.max(minHeight, workArea.y + workArea.height - nextY);

  window.setBounds({
    x: nextX,
    y: nextY,
    width: Math.min(maxWidth, Math.max(minWidth, Math.round(bounds.width))),
    height: Math.min(maxHeight, Math.max(minHeight, Math.round(bounds.height))),
  });

  return computeWindowBounds();
}

function notifyWindowState() {
  if (!mainWindow) {
    return;
  }

  safeSendToRenderer(IPC_CHANNELS.windowStateChanged, computeWindowFrameState());
}

export function createMainWindow(): BrowserWindow {
  const devServerUrl = getDevServerUrl();
  const isDev = Boolean(devServerUrl);

  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    frame: false,
    backgroundColor: "#e8edf3",
    title: APP_PRODUCT_NAME,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: !isDev,
      devTools: isDev,
    },
  });

  attachWindowLogging(mainWindow);

  mainWindow.on("maximize", notifyWindowState);
  mainWindow.on("unmaximize", notifyWindowState);
  mainWindow.on("ready-to-show", notifyWindowState);
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;

    const isDevToolsShortcut =
      input.key === "F12" ||
      ((input.control || input.meta) &&
        input.shift &&
        input.key.toUpperCase() === "I");

    if (isDevToolsShortcut) {
      event.preventDefault();
      if (!isDev) {
        return;
      }

      if (mainWindow?.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow?.webContents.openDevTools({ mode: "detach" });
      }
      return;
    }

    const isReloadShortcut =
      input.key === "F5" ||
      ((input.control || input.meta) &&
        !input.shift &&
        input.key.toUpperCase() === "R");

    if (isReloadShortcut) {
      event.preventDefault();
      mainWindow?.webContents.reload();
      return;
    }
  });
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(getRendererPath());
  }

  appLogger.info({
    scope: "app.window",
    message: "主窗口已创建",
    data: {
      devServerUrl: devServerUrl ?? null,
    },
  });

  return mainWindow;
}
