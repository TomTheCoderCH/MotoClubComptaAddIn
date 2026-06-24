import { app, BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import started from 'electron-squirrel-startup';
import { openDatabase, getDb, getDbDir, isDbOpen } from './db';
import { registerIpcHandlers } from './ipc-handlers';
import { performBackup, pruneBackups } from './backup';
import { readSettings } from './settings';

// E2E test isolation: redirect userData to the temp APPDATA injected by electron-fixture.ts.
// app.setPath('userData') must be called before app.ready, and overrides the registry-based default.
if (process.env['NODE_ENV'] === 'test' && process.env['APPDATA']) {
  app.setPath('userData', path.join(process.env['APPDATA'], app.getName()));
}

// Force le locale Chromium en fr-CH pour que les <input type="date"> affichent dd.MM.yyyy.
// La valeur ISO (yyyy-MM-dd) transmise via e.target.value reste inchangée.
app.commandLine.appendSwitch('lang', 'fr-CH');

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
  const settings = readSettings();

  registerIpcHandlers();

  if (!settings) {
    // Premier lancement : WelcomePage demandera à l'utilisateur de choisir le dossier
    createWindow();
    return;
  }

  if (!fs.existsSync(settings.dataDir)) {
    const choice = dialog.showMessageBoxSync({
      type: 'warning',
      title: 'Dossier de données introuvable',
      message: `Le dossier de données configuré n'existe plus :\n${settings.dataDir}`,
      detail: "Choisissez un nouveau dossier ou quittez l'application.",
      buttons: ['Choisir un nouveau dossier', 'Quitter'],
      defaultId: 0,
      cancelId: 1,
    });
    if (choice === 1) {
      app.exit(0);
      return;
    }
    // choice === 0 : WelcomePage permettra de choisir sans migration
    createWindow();
    return;
  }

  openDatabase(settings.dataDir);
  createWindow();
});

app.on('before-quit', async (e) => {
  if (isQuitting) return;
  isQuitting = true;
  e.preventDefault();

  if (!isDbOpen()) {
    // Premier lancement ou dossier manquant — aucune DB à sauvegarder
    app.exit(0);
    return;
  }

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
