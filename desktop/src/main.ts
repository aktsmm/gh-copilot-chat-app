/**
 * Electron main process.
 *
 * 1. Starts the embedded Express + Socket.IO server
 * 2. Opens a BrowserWindow pointing to the server
 * 3. Provides system tray, keyboard shortcuts, and native menus
 */

import {
  app,
  BrowserWindow,
  shell,
  Menu,
  Tray,
  globalShortcut,
  nativeImage,
  dialog,
} from "electron";
import path from "node:path";
import { existsSync } from "node:fs";
import { startEmbeddedServer, stopEmbeddedServer } from "./embedded-server.js";

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverPort = 3001;
let serverReady = false;
let isQuitting = false;

const EXTERNAL_PROTOCOL_ALLOWLIST = new Set(["http:", "https:"]);

function revealMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }

  mainWindow.focus();
}

function resolveIconPath(preferIco = false): string | undefined {
  const iconFileNames = preferIco
    ? ["icon.ico", "icon.png"]
    : ["icon.png", "icon.ico"];

  const appPath = app.getAppPath();
  const baseDirs = [
    path.join(process.resourcesPath, "assets"),
    process.resourcesPath,
    path.join(appPath, "assets"),
    path.resolve(appPath, "../assets"),
    path.resolve(appPath, "../../assets"),
  ];

  for (const baseDir of baseDirs) {
    for (const iconFileName of iconFileNames) {
      const iconPath = path.join(baseDir, iconFileName);
      if (existsSync(iconPath)) {
        return iconPath;
      }
    }
  }

  return undefined;
}

function loadTrayIcon() {
  const trayIconPath = resolveIconPath(process.platform === "win32");
  if (trayIconPath) {
    const image = nativeImage.createFromPath(trayIconPath);
    if (!image.isEmpty()) {
      return image;
    }
  }
  return nativeImage.createEmpty();
}

function isSafeExternalUrl(url: string): boolean {
  try {
    const target = new URL(url);
    return EXTERNAL_PROTOCOL_ALLOWLIST.has(target.protocol);
  } catch {
    return false;
  }
}

// ── Single instance lock ────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    revealMainWindow();
  });
}

// ── Create the main window ──────────────────────────────────
function getBootHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>GitHub Copilot Chat</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #0d1117;
        color: #9ca3af;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .box {
        text-align: center;
      }
      .dot {
        width: 10px;
        height: 10px;
        border-radius: 9999px;
        margin: 0 auto 10px;
        background: #60a5fa;
        animation: pulse 1.1s ease-in-out infinite;
      }
      @keyframes pulse {
        0%, 100% { opacity: 0.4; transform: scale(0.9); }
        50% { opacity: 1; transform: scale(1.1); }
      }
    </style>
  </head>
  <body>
    <div class="box" role="status" aria-live="polite">
      <div class="dot"></div>
      <div>Starting GitHub Copilot Chat…</div>
    </div>
  </body>
</html>`;
}

function loadBootScreen() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const html = encodeURIComponent(getBootHtml());
  void mainWindow.loadURL(`data:text/html;charset=utf-8,${html}`);
}

function loadMainApp() {
  if (!mainWindow || mainWindow.isDestroyed() || !serverReady) return;
  void mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);
}

function createWindow() {
  const windowIconPath = resolveIconPath(process.platform === "win32");

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    title: "GitHub Copilot Chat",
    backgroundColor: "#0d1117",
    show: false,
    icon: windowIconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: true,
    },
  });

  if (serverReady) {
    loadMainApp();
  } else {
    loadBootScreen();
  }

  // Show when ready to prevent white flash
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const appOrigin = new URL(`http://127.0.0.1:${serverPort}`).origin;
    try {
      const target = new URL(url);
      if (target.origin === appOrigin) {
        return;
      }
    } catch {
      // Fall through and block malformed URLs.
    }
    event.preventDefault();
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url);
    }
  });

  // Handle window close — minimize to tray instead of quitting
  mainWindow.on("close", (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ── Application menu ────────────────────────────────────────
function createMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        {
          label: "New Chat",
          accelerator: "CmdOrCtrl+N",
          click: () =>
            mainWindow?.webContents.executeJavaScript(
              'document.querySelector("[data-action=new-chat]")?.click()',
            ),
        },
        { type: "separator" },
        {
          label: "Quit",
          accelerator: "CmdOrCtrl+Q",
          click: () => {
            isQuitting = true;
            app.quit();
          },
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(isDev ? [{ role: "toggleDevTools" as const }] : []),
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About GitHub Copilot Chat",
          click: () => {
            const version = app.getVersion();
            dialog.showMessageBox({
              type: "info",
              title: "GitHub Copilot Chat Desktop",
              message: `GitHub Copilot Chat Desktop v${version}`,
              detail:
                "Powered by GitHub Copilot SDK\nhttps://github.com/aktsmm/gh-copilot-chat-app",
            });
          },
        },
        {
          label: "GitHub Repository",
          click: () =>
            shell.openExternal("https://github.com/aktsmm/gh-copilot-chat-app"),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── System tray ─────────────────────────────────────────────
function createTray() {
  const icon = loadTrayIcon();
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show GitHub Copilot Chat",
      click: () => revealMainWindow(),
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip("GitHub Copilot Chat");
  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    revealMainWindow();
  });

  tray.on("double-click", () => {
    revealMainWindow();
  });
}

// ── App lifecycle ──────────────────────────────────────────
app.on("ready", async () => {
  createWindow();
  createMenu();
  createTray();

  try {
    serverPort = await startEmbeddedServer();
    serverReady = true;
    console.log(`[electron] Embedded server on port ${serverPort}`);
    loadMainApp();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[electron] Failed to start server:", err);
    dialog.showErrorBox(
      "Server Error",
      `Failed to start the embedded server.\n\n${detail}`,
    );
    app.quit();
    return;
  }

  // Global shortcut to toggle window
  globalShortcut.register("CmdOrCtrl+Shift+C", () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });
});

app.on("window-all-closed", () => {
  // On macOS, keep running in tray
  if (process.platform !== "darwin") {
    isQuitting = true;
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    revealMainWindow();
  }
});

app.on("before-quit", async () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
  await stopEmbeddedServer();
});
