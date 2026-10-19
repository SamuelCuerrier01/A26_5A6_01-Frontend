const { app, BrowserWindow, Menu } = require('electron');

const PROFIL = process.env.CHATVARDAGE_PROFIL?.trim();
if (PROFIL) {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(PROFIL)) {
    console.error(
      `[ChatVardage] CHATVARDAGE_PROFIL invalide : "${PROFIL}" (lettres, chiffres, _ ou -, 32 max).`
    );
    process.exit(1);
  }
  app.setPath('userData', `${app.getPath('userData')}-${PROFIL}`);
  console.log(`[ChatVardage] Profil "${PROFIL}" : ${app.getPath('userData')}`);
}

const { etat } = require('./src/main/contexte');
require('./src/main/gateway');
const { configurerCsp } = require('./src/main/securite');
const { buildMenu } = require('./src/main/menu');
const { createWindow } = require('./src/main/fenetre');
const {
  avertirSiWSL,
  surveillerServiceNotificationsLinux,
} = require('./src/main/notifications');
require('./src/main/preferences');
require('./src/main/session');
require('./src/main/canaux-donnees');
const { surveillerReseauSysteme } = require('./src/main/reseau');

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (etat.mainWindow) {
      if (etat.mainWindow.isMinimized()) {
        etat.mainWindow.restore();
      }
      etat.mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    avertirSiWSL();
    surveillerServiceNotificationsLinux();
    Menu.setApplicationMenu(buildMenu());
    configurerCsp();
    etat.mainWindow = createWindow();
    surveillerReseauSysteme();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        etat.mainWindow = createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
});
