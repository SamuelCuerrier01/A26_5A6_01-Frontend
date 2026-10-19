const { app, nativeImage, Notification } = require('electron');
const { t } = require('../i18n/i18n.js');
const {
  etat,
  logDebugNotif,
  cleanText,
  envoyerVersRenderer,
} = require('./contexte');
const { exposerCanal } = require('./securite');
const { APP_ICON_PATH } = require('./fenetre');

function estProbablementWSL() {
  if (process.platform !== 'linux') return false;
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) return true;
  try {
    return require('fs')
      .readFileSync('/proc/version', 'utf8')
      .toLowerCase()
      .includes('microsoft');
  } catch {
    return false;
  }
}

const INTERVALLE_SONDE_NOTIFICATIONS_MS = 60_000;
const DELAI_SONDE_NOTIFICATIONS_MS = 3000;
let serviceNotificationsLinux =
  process.platform === 'linux' ? 'inconnu' : 'disponible';

function sonderServiceNotificationsLinux() {
  if (process.platform !== 'linux') return;
  const forcage = process.env.CHATVARDAGE_NOTIFICATIONS_SYSTEME;
  if (forcage === '1' || forcage === '0') {
    serviceNotificationsLinux = forcage === '1' ? 'disponible' : 'absent';
    return;
  }
  require('child_process').execFile(
    'gdbus',
    [
      'call',
      '--session',
      '--dest',
      'org.freedesktop.DBus',
      '--object-path',
      '/org/freedesktop/DBus',
      '--method',
      'org.freedesktop.DBus.NameHasOwner',
      'org.freedesktop.Notifications',
    ],
    { timeout: DELAI_SONDE_NOTIFICATIONS_MS },
    (erreur, sortie) => {
      const etat = !erreur && /\btrue\b/.test(sortie) ? 'disponible' : 'absent';
      if (etat !== serviceNotificationsLinux) {
        logDebugNotif(
          `[notifications] service de notifications D-Bus : ${etat}` +
            (etat === 'absent'
              ? " (repli : clignotement + message dans l'app)"
              : '')
        );
      }
      serviceNotificationsLinux = etat;
    }
  );
}

function surveillerServiceNotificationsLinux() {
  if (process.platform !== 'linux') return;
  sonderServiceNotificationsLinux();
  setInterval(
    sonderServiceNotificationsLinux,
    INTERVALLE_SONDE_NOTIFICATIONS_MS
  );
}

function notifierParRepli(type, conversationId, contenu) {
  if (
    etat.mainWindow &&
    !etat.mainWindow.isDestroyed() &&
    !etat.mainWindow.isFocused()
  ) {
    etat.mainWindow.flashFrame(true);
  }
  envoyerVersRenderer('notifications:repli', { type, conversationId, contenu });
}

function avertirSiWSL() {
  if (!estProbablementWSL()) return;
  logDebugNotif(
    '[notifications] Exécution détectée sous WSL. Les notifications système ' +
      'passent par libnotify (D-Bus), relayé par WSLg vers le Centre de ' +
      'notifications Windows — mais seulement si un bus D-Bus de session est ' +
      'actif dans la distribution. Si les logs disent "notification ' +
      'affichée" sans que rien ne s\'affiche : (1) vérifier que WSL est à jour ' +
      '(wsl --update, puis wsl --shutdown, depuis PowerShell), (2) activer ' +
      'systemd dans /etc/wsl.conf ([boot]\\nsystemd=true) puis relancer WSL, ' +
      '(3) tester `notify-send "test" "hello"` dans le terminal WSL — si ' +
      "ça n'affiche rien non plus côté Windows, le problème est dans " +
      "l'environnement WSL, pas dans cette app. Sur un Windows, un macOS ou " +
      'un Linux natif (avec un vrai bureau/démon de notifications), ce code ' +
      'fonctionne sans configuration supplémentaire.'
  );
}

function showMessageNotification(message) {
  if (!Notification.isSupported()) {
    logDebugNotif(
      '[showMessageNotification] ignoré : Notification non supportée sur ce système.'
    );
    return false;
  }
  if (!etat.mainWindow || etat.mainWindow.isDestroyed()) {
    logDebugNotif(
      '[showMessageNotification] ignoré : fenêtre principale absente ou détruite.'
    );
    return false;
  }

  const conversationId = cleanText(message?.conversationId, 120);
  const body = message?.apercuMasque
    ? t(etat.langueActuelle, 'notifications.hiddenPreview')
    : cleanText(message?.contenu, 180);
  if (!conversationId || !body) {
    logDebugNotif(
      '[showMessageNotification] ignoré : message invalide (conversationId ou contenu manquant).'
    );
    return false;
  }

  if (etat.fenetreEstFocusee && conversationId === etat.activeConversationId) {
    logDebugNotif(
      `[showMessageNotification] ignoré : conversation "${conversationId}" actuellement affichée et fenêtre au premier plan (déjà "lue" en direct).`
    );
    return false;
  }

  const type =
    message?.type === 'salon' || message?.type === 'prive'
      ? message.type
      : null;
  if (serviceNotificationsLinux !== 'disponible') {
    notifierParRepli(type, conversationId, body);
    logDebugNotif(
      `[showMessageNotification] repli (service de notifications ${serviceNotificationsLinux}) pour "${conversationId}".`
    );
    return true;
  }

  const notification = new Notification({
    title: t(etat.langueActuelle, 'notifications.newMessageTitle'),
    body,
    icon: APP_ICON_PATH,
  });

  notification.on('click', () => {
    if (etat.mainWindow && !etat.mainWindow.isDestroyed()) {
      etat.mainWindow.show();
      etat.mainWindow.focus();
    }
    if (type) {
      envoyerVersRenderer('notifications:naviguer-vers-conversation', {
        type,
        conversationId,
      });
    }
  });
  notification.show();
  logDebugNotif(
    `[showMessageNotification] notification affichée pour "${conversationId}".`
  );
  return true;
}

exposerCanal(
  'notification:set-active-conversation',
  (conversationId) => {
    etat.activeConversationId = cleanText(conversationId, 120) || null;
    return true;
  },
  { siRefuse: false }
);

exposerCanal(
  'notification:message-received',
  (message) => {
    if (etat.modeNotificationActuel !== 'systeme') {
      return { shown: false };
    }
    return { shown: showMessageNotification(message) };
  },
  { siRefuse: { shown: false } }
);

exposerCanal('window:is-focused', () => etat.fenetreEstFocusee, {
  siRefuse: true,
});

function mettreAJourBadgeApplication(count, iconDataUrl) {
  const nombre = Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0;

  if (process.platform === 'darwin' || process.platform === 'linux') {
    if (typeof app.setBadgeCount === 'function') {
      app.setBadgeCount(nombre);
    }
  }

  if (
    process.platform === 'win32' &&
    etat.mainWindow &&
    !etat.mainWindow.isDestroyed()
  ) {
    if (nombre > 0 && iconDataUrl) {
      try {
        etat.mainWindow.setOverlayIcon(
          nativeImage.createFromDataURL(iconDataUrl),
          `${nombre} message(s) non lu(s)`
        );
      } catch (erreur) {
        console.error(
          "[badge] impossible de créer l'icône de superposition Windows :",
          erreur
        );
      }
    } else {
      etat.mainWindow.setOverlayIcon(null, '');
    }
  }
}

exposerCanal(
  'notifications:set-badge-count',
  (donnees) => {
    mettreAJourBadgeApplication(donnees?.count, donnees?.iconDataUrl);
    return true;
  },
  { siRefuse: false }
);

module.exports = {
  estProbablementWSL,
  avertirSiWSL,
  surveillerServiceNotificationsLinux,
  showMessageNotification,
};
