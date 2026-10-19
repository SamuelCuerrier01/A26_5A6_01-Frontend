const I18n =
  window.I18n ??
  (() => {
    console.error(
      '[renderer] window.I18n est introuvable : i18n-browser.js doit être chargé avant renderer.js (voir index.html). Traductions désactivées pour cette session (clés brutes affichées).'
    );
    return {
      t: (cle) => cle,
      appliquerTraductionsStatiques: () => {},
      messageErreur: (erreur) =>
        erreur instanceof Error ? erreur.message : String(erreur),
      initialiserDepuisElectronAPI: async () => 'fr',
      obtenirLangue: () => 'fr',
      definirLangueActuelle: () => {},
    };
  })();
const t = I18n.t;
const appliquerTraductionsStatiques = I18n.appliquerTraductionsStatiques;
const messageErreur = I18n.messageErreur;
const ChatUiShared = window.ChatUiShared;
if (!ChatUiShared) {
  throw new Error('chat-ui-shared.js doit être chargé avant renderer.js');
}

const ThemeManager =
  window.ThemeManager ??
  (() => {
    console.error(
      '[renderer] window.ThemeManager est introuvable : theme-browser.js doit être chargé avant renderer.js (voir index.html). Le thème reste bloqué sur sombre pour cette session.'
    );
    return {
      appliquerTheme: () => {},
      obtenirTheme: () => 'sombre',
      initialiserDepuisElectronAPI: async () => 'sombre',
    };
  })();

const NotifPrefs =
  window.NotifPrefs ??
  (() => {
    console.error(
      '[renderer] window.NotifPrefs est introuvable : notif-prefs.js doit être chargé avant renderer.js (voir index.html). Notifications et badges désactivés pour cette session.'
    );
    return {
      MODE_SYSTEME: 'systeme',
      MODE_DISCRET: 'discret',
      MODE_AUCUNE: 'aucune',
      obtenirMode: () => 'aucune',
      definirMode: () => {},
      afficheRonds: () => false,
      chargerNonLus: async () => {},
      nombreNonLus: () => 0,
      ajouterNonLu: () => {},
      marquerLu: () => {},
      totalNonLus: () => 0,
      remplirCompteur: (element) => {
        if (element) element.hidden = true;
      },
      genererIconeBadge: () => null,
      appliquerBadge: () => {},
      traiterMessageRecu: async () => {},
    };
  })();
let utilisateurActuelId = null;
let utilisateurActuel = null;
let preferences = null;
let salonActifId = null;
const CLEF_SERVEUR_ACTIF = 'chatvardage:serveur-actif';
let serveurActifId = lireStockage(localStorage, CLEF_SERVEUR_ACTIF);
let etatCharge = false;
let etat = {
  utilisateurs: [],
  serveurs: [],
  serveurActif: null,
  salons: [],
  invitations: [],
};

function lireStockage(stockage, clef) {
  try {
    return stockage.getItem(clef);
  } catch {
    return null;
  }
}

function ecrireStockage(stockage, clef, valeur) {
  try {
    if (valeur === null) stockage.removeItem(clef);
    else stockage.setItem(clef, valeur);
  } catch {
  }
}

function roleActuel() {
  return etat.serveurActif?.monRole ?? null;
}
let presences = {};
let etatReseau = { statut: 'inconnu', reconnexions: 0 };
let fenetreEstFocusee = true;

let lecturesSalon = { salonId: null, lecteurs: [] };
let separateurSalon = { salonId: null, nonLus: 0 };

const el = {
  salons: document.querySelector('#channel-list'),
  messages: document.querySelector('#message-list'),
  nomSalon: document.querySelector('#active-channel-name'),
  prive: document.querySelector('#private-indicator'),
  formulaire: document.querySelector('#message-form'),
  message: document.querySelector('#message-input'),
  inviter: document.querySelector('#open-invite-user'),
  membres: document.querySelector('#open-members'),
  creer: document.querySelector('#open-create-channel'),
  creerRail: document.querySelector('#open-create-channel-rail'),
  rail: document.querySelector('#server-rail'),
  menuServeur: document.querySelector('#server-menu-btn'),
  nomServeur: document.querySelector('#server-name'),
  invitations: document.querySelector('#open-invitations'),
  compteur: document.querySelector('#invitation-count'),
  utilisateurPseudo: document.querySelector('#current-user-pseudo'),
  utilisateurRoleBadge: document.querySelector('#current-user-role-badge'),
  logout: document.querySelector('#logout-btn'),
  profil: document.querySelector('#open-profile'),
  roomSettings: document.querySelector('#open-room-settings'),
  dialogue: document.querySelector('#app-dialog'),
  titreDialogue: document.querySelector('#dialog-title'),
  contenuDialogue: document.querySelector('#dialog-content'),
  toast: document.querySelector('#toast'),
  statutConnexion: document.querySelector('#connection-status'),
  libelleConnexion: document.querySelector('#connection-label'),
  detailConnexion: document.querySelector('#connection-detail'),
  reessayerConnexion: document.querySelector('#connection-retry'),
  avatarCourant: document.querySelector('#current-user-avatar'),
  envoyer: document.querySelector('#message-form button[type="submit"]'),
};

function afficherEtatReseau(nouvelEtat = etatReseau) {
  etatReseau = nouvelEtat ?? etatReseau;
  ChatUiShared.afficherEtatReseau({
    etat: etatReseau,
    elements: {
      statutConnexion: el.statutConnexion,
      libelleConnexion: el.libelleConnexion,
      detailConnexion: el.detailConnexion,
      reessayer: el.reessayerConnexion,
      messageInput: el.message,
      submitButton: el.envoyer,
    },
    t,
    composerAutorise: Boolean(salonActif()?.peutEcrire),
  });
  afficherPresenceCourante();
}

function afficherPresenceCourante() {
  ChatUiShared.afficherAvatarCourant({
    element: el.avatarCourant,
    utilisateur: utilisateurActuel,
    preferences,
    presences,
    etatReseau,
    t,
  });
}

async function chargerEtatReseauEtPresences() {
  await ChatUiShared.chargerEtatReseauEtPresences({
    api: window.electronAPI,
    onEtat: (reseau) => {
      etatReseau = reseau;
    },
    onPresences: (recues) => {
      presences = recues;
    },
  });
  afficherEtatReseau();
  afficherPresenceCourante();
}

const salonActif = () => etat.salons.find((salon) => salon.id === salonActifId);
const utilisateur = (id) => etat.utilisateurs.find((item) => item.id === id);

let generationLecturesSalon = 0;
