const { ipcMain, session } = require('electron');
const path = require('path');
const { fileURLToPath } = require('url');
const { isDev } = require('./contexte');

const RACINE = path.resolve(__dirname, '..', '..');

const DEV_SERVER_PORT = '5173';

const APP_PAGES_ROOT = path.resolve(RACINE, 'src', 'presentation', 'pages');
const APP_INDEX_PATH = path.resolve(APP_PAGES_ROOT, 'index.html');

function isPathInsideAppPages(filePath) {
  return filePath.startsWith(`${APP_PAGES_ROOT}${path.sep}`);
}

const APP_LOGIN_PATH = path.resolve(RACINE, 'dist', 'login', 'index.html');

function isAppUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol === 'file:') {
    let filePath;
    try {
      filePath = path.resolve(fileURLToPath(parsed));
    } catch {
      return false;
    }
    return isPathInsideAppPages(filePath) || filePath === APP_LOGIN_PATH;
  }

  if (isDev && parsed.protocol === 'http:') {
    return parsed.hostname === 'localhost' && parsed.port === DEV_SERVER_PORT;
  }

  return false;
}

function isProdLoginFileUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'file:') return false;

  let filePath;
  try {
    filePath = path.resolve(fileURLToPath(parsed));
  } catch {
    return false;
  }

  return filePath === APP_LOGIN_PATH;
}

function configurerCsp() {
  const cspDev =
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    'font-src https://fonts.gstatic.com; ' +
    "img-src 'self' data:; " +
    `connect-src 'self' http://localhost:${DEV_SERVER_PORT} ws://localhost:${DEV_SERVER_PORT};`;

  const cspProd =
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    'font-src https://fonts.gstatic.com; ' +
    "img-src 'self' data:;";

  const devOrigin = `http://localhost:${DEV_SERVER_PORT}/`;

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const isLoginPageRequest = isDev
      ? details.url.startsWith(devOrigin)
      : isProdLoginFileUrl(details.url);

    if (!isLoginPageRequest) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [isDev ? cspDev : cspProd],
      },
    });
  });
}

function isTrustedIpcEvent(event) {
  return isAppUrl(event.senderFrame?.url ?? '');
}

function verifierProvenance(event) {
  if (!isAppUrl(event.senderFrame?.url ?? '')) {
    throw new Error('Origine IPC non autorisée');
  }
}

function exposerCanal(nom, action, options = {}) {
  const refusSilencieux = Object.hasOwn(options, 'siRefuse');
  ipcMain.handle(nom, (event, donnees) => {
    if (refusSilencieux && !isTrustedIpcEvent(event)) {
      return options.siRefuse;
    }
    verifierProvenance(event);
    return action(donnees ?? {});
  });
}

module.exports = {
  RACINE,
  DEV_SERVER_PORT,
  APP_PAGES_ROOT,
  APP_INDEX_PATH,
  APP_LOGIN_PATH,
  isPathInsideAppPages,
  isAppUrl,
  isProdLoginFileUrl,
  configurerCsp,
  isTrustedIpcEvent,
  verifierProvenance,
  exposerCanal,
};
