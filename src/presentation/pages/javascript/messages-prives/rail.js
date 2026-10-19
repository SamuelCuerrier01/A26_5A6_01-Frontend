const CLEF_SERVEUR_ACTIF = 'chatvardage:serveur-actif';

function lireStockage(stockage, clef) {
  try {
    return stockage.getItem(clef);
  } catch {
    return null;
  }
}

function ecrireStockage(stockage, clef, valeur) {
  try {
    stockage.setItem(clef, valeur);
  } catch {}
}

let serveursRail = [];

async function actualiserBadgeSalons({ recharger = true } = {}) {
  if (recharger) {
    try {
      serveursRail = (await window.electronAPI.obtenirServeurs()) ?? [];
    } catch {
      return;
    }
  }
  const pastilles = NotifPrefs.afficheRonds(state.currentUserId)
    ? new Map(
        serveursRail.map((serveur) => [
          serveur.id,
          NotifPrefs.totalNonLus({
            type: 'salon',
            conversationIds: serveur.salonIds ?? [],
          }),
        ])
      )
    : new Map();
  ChatUiShared.afficherRailServeurs({
    conteneur: document.getElementById('server-rail'),
    avant: document.getElementById('open-create-channel-rail'),
    serveurs: serveursRail,
    serveurActifId: null,
    nonLus: pastilles,
    libelleVoirPlus: t('servers.showMoreRail'),
    surChoix: (serveur) => {
      ecrireStockage(localStorage, CLEF_SERVEUR_ACTIF, serveur.id);
      window.electronAPI.navigate('index.html');
    },
  });
}

function mettreAJourBadgeApplication() {
  if (typeof serviceNotifications?.setBadgeCount !== 'function') return;
  NotifPrefs.appliquerBadge(
    serviceNotifications,
    NotifPrefs.afficheRonds(state.currentUserId) ? NotifPrefs.totalNonLus() : 0
  );
}

function fermerMenuNotif() {
  if (!notifMenu || notifMenu.hidden) return;
  notifMenu.hidden = true;
  notifBtn?.setAttribute('aria-expanded', 'false');
}

function ouvrirMenuNotif() {
  if (!notifMenu) return;
  const modeActuel = NotifPrefs.obtenirMode(state.currentUserId);
  notifMenu.querySelectorAll('input[name="notif-mode"]').forEach((radio) => {
    radio.checked = radio.value === modeActuel;
  });
  const caseApercu = notifMenu.querySelector('#notif-apercu');
  if (caseApercu) {
    caseApercu.checked = NotifPrefs.afficheApercu(state.currentUserId);
  }
  notifMenu.hidden = false;
  notifBtn?.setAttribute('aria-expanded', 'true');
}

function brancherChoixModeNotification() {
  notifMenu?.querySelectorAll('input[name="notif-mode"]').forEach((radio) => {
    radio.addEventListener('change', async () => {
      const precedent = NotifPrefs.obtenirMode(state.currentUserId);
      NotifPrefs.definirMode(state.currentUserId, radio.value);
      fermerMenuNotif();
      const rafraichir = async () => {
        renderConversationList();
        await actualiserBadgeSalons({ recharger: false });
        mettreAJourBadgeApplication();
      };
      await rafraichir();
      try {
        await window.electronAPI.modifierPreferences({
          modeNotification: radio.value,
        });
        notifier(t('notifications.preferenceUpdated'));
      } catch (erreur) {
        NotifPrefs.definirMode(state.currentUserId, precedent);
        await rafraichir();
        notifier(messageErreur(erreur), true);
      }
    });
  });
}
