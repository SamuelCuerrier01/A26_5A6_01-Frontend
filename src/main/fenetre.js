const { BrowserWindow, ipcMain, screen, shell } = require('electron');
const path = require('path');
const {
  etat,
  isDev,
  cleanText,
  logDebugNotif,
  envoyerVersRenderer,
} = require('./contexte');
const {
  RACINE,
  DEV_SERVER_PORT,
  APP_PAGES_ROOT,
  APP_INDEX_PATH,
  APP_LOGIN_PATH,
  isAppUrl,
  isPathInsideAppPages,
  exposerCanal,
  verifierProvenance,
} = require('./securite');

const APP_ICON_PATH = path.join(RACINE, 'assets', 'icon.png');

const WINDOW_BACKGROUND_COLOR = '#0d3d38';
const WINDOW_BACKGROUND_COLOR_CLAIR = '#e3f6ef';

function couleurFondFenetre() {
  return etat.themeActuel === 'clair'
    ? WINDOW_BACKGROUND_COLOR_CLAIR
    : WINDOW_BACKGROUND_COLOR;
}

const DEFAULT_WINDOW_WIDTH = 1280;
const DEFAULT_WINDOW_HEIGHT = 800;
const MIN_WINDOW_WIDTH = 960;
const MIN_WINDOW_HEIGHT = 600;

const ZOOM_ADAPTATIF_MAX = 1.35;

function facteurZoomAdaptatif(largeur, hauteur) {
  const rapport = Math.min(
    largeur / DEFAULT_WINDOW_WIDTH,
    hauteur / DEFAULT_WINDOW_HEIGHT
  );
  const borne = Math.min(Math.max(rapport, 1), ZOOM_ADAPTATIF_MAX);
  return Math.round(borne * 20) / 20;
}

function appliquerZoomAdaptatif(win) {
  if (win.isDestroyed()) return;
  const [largeur, hauteur] = win.getContentSize();
  const facteur = facteurZoomAdaptatif(largeur, hauteur);
  if (win.webContents.getZoomFactor() !== facteur) {
    win.webContents.setZoomFactor(facteur);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    center: true,
    show: false,
    backgroundColor: couleurFondFenetre(),
    autoHideMenuBar: true,
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hidden' }
      : { frame: false }),
    icon: APP_ICON_PATH,
    webPreferences: {
      preload: path.join(RACINE, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      allowRunningInsecureContent: false,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  win.on('minimize', () => {
    logDebugNotif('[fenetre] minimize');
  });
  win.on('restore', () => {
    logDebugNotif('[fenetre] restore');
  });
  win.on('focus', () => {
    win.flashFrame(false);
    etat.fenetreEstFocusee = true;
    logDebugNotif('[fenetre] focus');
    envoyerVersRenderer('window:focus-changed', true);
  });
  win.on('blur', () => {
    etat.fenetreEstFocusee = false;
    logDebugNotif('[fenetre] blur');
    envoyerVersRenderer('window:focus-changed', false);
  });
  win.on('maximize', () => envoyerVersRenderer('fenetre:maximisee', true));
  win.on('unmaximize', () =>
    envoyerVersRenderer('fenetre:maximisee', fenetreEstAgrandie())
  );
  win.on('hide', () => {
    logDebugNotif('[fenetre] hide');
  });
  win.on('show', () => {
    logDebugNotif('[fenetre] show');
  });

  win.webContents.setVisualZoomLevelLimits(1, 1);

  let delaiZoom = null;
  win.on('resize', () => {
    clearTimeout(delaiZoom);
    delaiZoom = setTimeout(() => appliquerZoomAdaptatif(win), 60);
  });
  win.webContents.on('did-finish-load', () => appliquerZoomAdaptatif(win));

  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    const devToolsKeys = new Set(['I', 'J', 'C']);
    win.webContents.on('before-input-event', (event, input) => {
      const modifierPressed =
        (input.control && input.shift) || (input.meta && input.alt);
      const isDevToolsShortcut =
        input.key === 'F12' ||
        (modifierPressed && devToolsKeys.has(input.key.toUpperCase()));
      if (isDevToolsShortcut) {
        event.preventDefault();
      }
    });
  }

  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  win.on('closed', () => {
    if (etat.mainWindow === win) {
      etat.mainWindow = null;
    }
  });

  if (isDev) {
    win.loadURL(`http://localhost:${DEV_SERVER_PORT}/`);
  } else {
    win.loadFile(APP_LOGIN_PATH);
  }

  return win;
}

ipcMain.handle('navigation:tableau-de-bord', (event) => {
  const url = event.senderFrame?.url ?? '';
  if (!isAppUrl(url)) {
    return;
  }
  if (etat.mainWindow) {
    etat.mainWindow.loadFile(APP_INDEX_PATH);
  }
});

function afficherPageConnexion() {
  if (!etat.mainWindow || etat.mainWindow.isDestroyed()) {
    return;
  }
  if (isDev) {
    etat.mainWindow.loadURL(`http://localhost:${DEV_SERVER_PORT}/`);
  } else {
    etat.mainWindow.loadFile(APP_LOGIN_PATH);
  }
}

ipcMain.handle('navigation:connexion', (event) => {
  const url = event.senderFrame?.url ?? '';
  if (!isAppUrl(url)) {
    return;
  }
  afficherPageConnexion();
});

let bornesAvantAgrandissement = null;

function fenetreEstAgrandie() {
  return bornesAvantAgrandissement !== null || !!etat.mainWindow?.isMaximized();
}

function basculerAgrandissement() {
  if (!etat.mainWindow || etat.mainWindow.isDestroyed()) return false;
  if (etat.mainWindow.isMaximized()) {
    etat.mainWindow.unmaximize();
  } else if (bornesAvantAgrandissement) {
    etat.mainWindow.setBounds(bornesAvantAgrandissement);
    bornesAvantAgrandissement = null;
  } else {
    bornesAvantAgrandissement = etat.mainWindow.getBounds();
    const { workArea } = screen.getDisplayMatching(bornesAvantAgrandissement);
    etat.mainWindow.setBounds(workArea);
  }
  const agrandie = fenetreEstAgrandie();
  envoyerVersRenderer('fenetre:maximisee', agrandie);
  return agrandie;
}

const TYPES_CIBLE_NAVIGATION = new Set(['salon', 'prive', 'ajout-serveur']);

exposerCanal('navigation:definir-cible', ({ type, id }) => {
  if (!TYPES_CIBLE_NAVIGATION.has(type)) {
    etat.cibleNavigation = null;
    return false;
  }
  etat.cibleNavigation = { type, id: cleanText(id, 120) || null };
  return true;
});

exposerCanal('navigation:prendre-cible', ({ types }) => {
  const cible = etat.cibleNavigation;
  if (!cible || !Array.isArray(types) || !types.includes(cible.type)) {
    return null;
  }
  etat.cibleNavigation = null;
  return cible;
});

exposerCanal('fenetre:reduire', () => etat.mainWindow?.minimize());
exposerCanal('fenetre:agrandir', () => basculerAgrandissement());
exposerCanal('fenetre:fermer', () => etat.mainWindow?.close());
exposerCanal('fenetre:est-maximisee', () => fenetreEstAgrandie());

ipcMain.handle('navigate', (event, page) => {
  verifierProvenance(event);
  const pagePath = path.resolve(APP_PAGES_ROOT, page ?? '');
  if (!isPathInsideAppPages(pagePath)) {
    throw new Error('Page de navigation invalide');
  }
  return BrowserWindow.fromWebContents(event.sender)?.loadFile(pagePath);
});

module.exports = {
  APP_ICON_PATH,
  couleurFondFenetre,
  facteurZoomAdaptatif,
  createWindow,
  afficherPageConnexion,
  fenetreEstAgrandie,
};
