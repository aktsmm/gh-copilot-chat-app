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
import { startEmbeddedServer, stopEmbeddedServer } from "./embedded-server.js";

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverPort = 3001;
let isQuitting = false;

const EXTERNAL_PROTOCOL_ALLOWLIST = new Set(["http:", "https:"]);

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
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ── Create the main window ──────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    title: "GitHub Copilot Chat",
    backgroundColor: "#0d1117",
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: true,
    },
  });

  // Load the server URL
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);

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
    const appOrigin = `http://127.0.0.1:${serverPort}`;
    if (url.startsWith(appOrigin)) {
      return;
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
            dialog.showMessageBox({
              type: "info",
              title: "GitHub Copilot Chat Desktop",
              message: "GitHub Copilot Chat Desktop v1.0.0",
              detail:
                "Powered by GitHub Copilot SDK\nhttps://github.com/github/copilot-sdk",
            });
          },
        },
        {
          label: "GitHub Repository",
          click: () =>
            shell.openExternal("https://github.com/github/copilot-sdk"),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── System tray ─────────────────────────────────────────────
function createTray() {
  // Use a simple 16x16 icon (create programmatically for now)
  const icon = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAADpJREFUOE9jZKAQMFKon2HUAAYGhtEwIBgG/xkYGP4T4wJ8YfCfgYHhP7FhQNAF+MIAXxgMjDAAAIhUGoF52GXnAAAAAElFTkSuQmCC",
  );
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show GitHub Copilot Chat",
      click: () => mainWindow?.show(),
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

  tray.on("double-click", () => {
    mainWindow?.show();
  });
}

// ── App lifecycle ──────────────────────────────────────────
app.on("ready", async () => {
  try {
    serverPort = await startEmbeddedServer();
    console.log(`[electron] Embedded server on port ${serverPort}`);
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

  createWindow();
  createMenu();
  createTray();

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
    mainWindow.show();
  }
});

app.on("before-quit", async () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
  await stopEmbeddedServer();
});
