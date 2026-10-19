const { LANGUE_PAR_DEFAUT } = require('../i18n/i18n.js');

const isDev = process.env.NODE_ENV === 'development';

const THEME_PAR_DEFAUT = 'sombre';
const THEMES_SUPPORTEES = ['sombre', 'clair'];
const MODE_NOTIFICATION_PAR_DEFAUT = 'systeme';
const MODES_NOTIFICATION = ['systeme', 'discret', 'aucune'];

const etat = {
  langueActuelle: LANGUE_PAR_DEFAUT,
  langueChoisieAvantConnexion: null,
  themeActuel: THEME_PAR_DEFAUT,
  modeNotificationActuel: MODE_NOTIFICATION_PAR_DEFAUT,
  aliasActuel: null,
  avatarActuel: null,
  mainWindow: null,
  activeConversationId: null,
  fenetreEstFocusee: true,
  motifRetourConnexion: null,
  cibleNavigation: null,
};

const debugNotifications = isDev || process.env.DEBUG_NOTIFICATIONS === '1';

function logDebugNotif(...args) {
  if (debugNotifications) {
    console.log(...args);
  }
}

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function envoyerVersRenderer(canal, donnees) {
  if (etat.mainWindow && !etat.mainWindow.isDestroyed()) {
    etat.mainWindow.webContents.send(canal, donnees);
  }
}

module.exports = {
  isDev,
  THEME_PAR_DEFAUT,
  THEMES_SUPPORTEES,
  MODE_NOTIFICATION_PAR_DEFAUT,
  MODES_NOTIFICATION,
  etat,
  logDebugNotif,
  cleanText,
  envoyerVersRenderer,
};
