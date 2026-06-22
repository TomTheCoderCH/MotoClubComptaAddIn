import { app, BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { openDatabase, getDb, getDbDir } from './db';
import { registerIpcHandlers } from './ipc-handlers';
import { performBackup, pruneBackups } from './backup';

if (started) app.quit();

let isQuitting = false;

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'MCY Compta',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
}

app.on('ready', () => {
  openDatabase();
  registerIpcHandlers();
  createWindow();
});

app.on('before-quit', async (e) => {
  if (isQuitting) return;
  isQuitting = true;
  e.preventDefault();
  try {
    const backupDir = path.join(getDbDir(), 'backups');
    await performBackup(getDb(), backupDir);
    pruneBackups(backupDir);
  } catch (err) {
    dialog.showErrorBox(
      'Erreur de sauvegarde',
      `La sauvegarde automatique a échoué :\n${String(err)}\n\nL'application va quand même se fermer.`,
    );
  } finally {
    app.exit(0);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
