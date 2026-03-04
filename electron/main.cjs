'use strict';

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

// ─── Constants ────────────────────────────────────────────────────────────────

const PORT = 3002;
const DEV_PORT = 5173;
const IS_DEV = process.env.NODE_ENV === 'development' || !app.isPackaged;
const TRAY_WIDTH = 340;
const TRAY_HEIGHT = 500;
const DASHBOARD_WIDTH = 1100;
const DASHBOARD_HEIGHT = 750;

// ─── State ────────────────────────────────────────────────────────────────────

let tray = null;
let trayWindow = null;
let dashboardWindow = null;
let serverProcess = null;

// ─── App Lifecycle ────────────────────────────────────────────────────────────

// Don't show in Dock — this is a tray-only app by default
if (process.platform === 'darwin') {
  app.dock.hide();
}

app.whenReady().then(async () => {
  await startServer();
  await waitForServer();
  createTray();
  setupIPC();
});

app.on('window-all-closed', () => {
  // On macOS, keep the app running in the tray even with no windows open.
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
});

// ─── Server Management ────────────────────────────────────────────────────────

function startServer() {
  return new Promise((resolve, reject) => {
    const serverPath = IS_DEV
      ? path.join(__dirname, '..', 'server', 'index.js')
      : path.join(process.resourcesPath, 'app', 'server', 'index.js');

    const clientDistPath = IS_DEV
      ? path.join(__dirname, '..', 'client', 'dist')
      : path.join(process.resourcesPath, 'app', 'client', 'dist');

    const userDataPath = app.getPath('userData');

    serverProcess = spawn(process.execPath, [serverPath], {
      env: {
        ...process.env,
        NODE_ENV: IS_DEV ? 'development' : 'production',
        PORT: String(PORT),
        ELECTRON_DIST_PATH: clientDistPath,
        ELECTRON_USER_DATA: userDataPath,
      },
      stdio: IS_DEV ? 'inherit' : 'pipe',
    });

    serverProcess.on('error', (err) => {
      console.error('[main] Server process error:', err);
      reject(err);
    });

    serverProcess.on('exit', (code, signal) => {
      console.log(`[main] Server process exited: code=${code}, signal=${signal}`);
    });

    // Resolve immediately — waitForServer() polls for readiness
    resolve();
  });
}

function waitForServer(retries = 30, delay = 300) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const check = () => {
      const req = http.get(`http://127.0.0.1:${PORT}/api/status`, (res) => {
        if (res.statusCode === 200) {
          console.log('[main] Server is ready');
          resolve();
        } else {
          retry();
        }
      });
      req.on('error', retry);
      req.setTimeout(200, () => { req.destroy(); retry(); });
    };

    const retry = () => {
      attempts++;
      if (attempts >= retries) {
        reject(new Error(`Server did not start after ${retries} attempts`));
      } else {
        setTimeout(check, delay);
      }
    };

    check();
  });
}

// ─── Tray ─────────────────────────────────────────────────────────────────────

function createTray() {
  const iconPath = IS_DEV
    ? path.join(__dirname, '..', 'assets', 'trayTemplate.png')
    : path.join(process.resourcesPath, 'assets', 'trayTemplate.png');

  const icon = nativeImage.createFromPath(iconPath);
  icon.setTemplateImage(true);

  tray = new Tray(icon);
  tray.setToolTip('GuardClaw — AI Agent Safety Monitor');

  tray.on('click', toggleTrayWindow);

  tray.on('right-click', () => {
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Open Dashboard', click: openDashboard },
      { type: 'separator' },
      { label: 'Quit GuardClaw', click: () => app.quit() },
    ]);
    tray.popUpContextMenu(contextMenu);
  });
}

// ─── Tray Window ─────────────────────────────────────────────────────────────

function createTrayWindow() {
  trayWindow = new BrowserWindow({
    width: TRAY_WIDTH,
    height: TRAY_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    hasShadow: true,
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const trayUrl = IS_DEV
    ? `http://localhost:${DEV_PORT}/tray.html`
    : `http://localhost:${PORT}/tray.html`;

  trayWindow.loadURL(trayUrl);

  trayWindow.on('blur', () => {
    if (trayWindow) trayWindow.hide();
  });

  trayWindow.on('closed', () => {
    trayWindow = null;
  });

  return trayWindow;
}

function toggleTrayWindow() {
  if (!trayWindow || trayWindow.isDestroyed()) {
    createTrayWindow();
  }

  if (trayWindow.isVisible()) {
    trayWindow.hide();
    return;
  }

  positionTrayWindow();
  trayWindow.show();
  trayWindow.focus();
}

function positionTrayWindow() {
  const trayBounds = tray.getBounds();
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
  const workArea = display.workArea;

  let x = Math.round(trayBounds.x + trayBounds.width / 2 - TRAY_WIDTH / 2);
  let y = Math.round(trayBounds.y + trayBounds.height + 4);

  x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - TRAY_WIDTH));
  y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - TRAY_HEIGHT));

  trayWindow.setPosition(x, y, false);
  trayWindow.setSize(TRAY_WIDTH, TRAY_HEIGHT, false);
}

// ─── Dashboard Window ─────────────────────────────────────────────────────────

function openDashboard() {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.show();
    dashboardWindow.focus();
    if (process.platform === 'darwin') app.dock.show();
    return;
  }

  dashboardWindow = new BrowserWindow({
    width: DASHBOARD_WIDTH,
    height: DASHBOARD_HEIGHT,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0f0f1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const dashboardUrl = IS_DEV
    ? `http://localhost:${DEV_PORT}`
    : `http://localhost:${PORT}`;

  dashboardWindow.loadURL(dashboardUrl);

  if (process.platform === 'darwin') app.dock.show();

  dashboardWindow.on('closed', () => {
    dashboardWindow = null;
    if (process.platform === 'darwin') app.dock.hide();
  });
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

function setupIPC() {
  ipcMain.handle('open-dashboard', () => {
    openDashboard();
    if (trayWindow && !trayWindow.isDestroyed()) {
      trayWindow.hide();
    }
  });

  ipcMain.handle('get-port', () => PORT);
}
