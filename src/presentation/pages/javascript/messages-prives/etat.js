const I18n =
  window.I18n ??
  (() => {
    console.error(
      '[message-prive] window.I18n est introuvable : i18n-browser.js doit être chargé avant ce script (voir message-prive.html). Traductions désactivées pour cette session (clés brutes affichées).'
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
const ChatUiShared = window.ChatUiShared;
if (!ChatUiShared) {
  throw new Error(
    'chat-ui-shared.js doit être chargé avant messages-prives/etat.js'
  );
}
const LogiqueInterface = window.LogiqueInterface;
if (!LogiqueInterface) {
  throw new Error(
    'logique-interface.js doit être chargé avant messages-prives/etat.js'
  );
}

const ThemeManager =
  window.ThemeManager ??
  (() => {
    console.error(
      '[message-prive] window.ThemeManager est introuvable : theme-browser.js doit être chargé avant ce script (voir message-prive.html). Le thème reste bloqué sur sombre pour cette session.'
    );
    return {
      appliquerTheme: () => {},
      obtenirTheme: () => 'sombre',
      initialiserDepuisElectronAPI: async () => 'sombre',
    };
  })();

function creerIconeMain() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'icone-main');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const groupe = document.createElementNS(NS, 'g');
  groupe.setAttribute('fill', 'currentColor');
  const paume = document.createElementNS(NS, 'circle');
  paume.setAttribute('cx', '8');
  paume.setAttribute('cy', '10');
  paume.setAttribute('r', '4');
  groupe.appendChild(paume);
  for (const angle of [-30, -10, 10, 30]) {
    const doigt = document.createElementNS(NS, 'rect');
    doigt.setAttribute('x', '-1');
    doigt.setAttribute('y', '-6');
    doigt.setAttribute('width', '2');
    doigt.setAttribute('height', '5');
    doigt.setAttribute('rx', '1');
    doigt.setAttribute('transform', `translate(8 6) rotate(${angle})`);
    groupe.appendChild(doigt);
  }
  svg.appendChild(groupe);
  return svg;
}

const EMOJI_VERS_ICONE = { '👋': creerIconeMain };

function remplirTexteMessage(element, texte) {
  element.replaceChildren();
  const emojiConnus = Object.keys(EMOJI_VERS_ICONE);
  const decoupage = new RegExp(`(${emojiConnus.join('|')})`, 'gu');
  for (const segment of texte.split(decoupage)) {
    if (!segment) continue;
    const creerIcone = EMOJI_VERS_ICONE[segment];
    element.appendChild(
      creerIcone ? creerIcone() : document.createTextNode(segment)
    );
  }
}

const listElement = document.getElementById('conversation-list');
const messageList = document.getElementById('message-list');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const topbarName = document.querySelector('.user-name');
const topbarStatus = document.querySelector('.user-status');
const topbarAvatar = document.querySelector('.topbar-avatar');
const typingIndicator = document.getElementById('typing-indicator');
const filterButtons = document.querySelectorAll('.filter-button');
const currentUserPseudoEl = document.getElementById('current-user-pseudo');
const currentUserRoleBadgeEl = document.getElementById(
  'current-user-role-badge'
);
const profilBtn = document.getElementById('open-profile');
const logoutBtn = document.getElementById('logout-btn');
const openNewDmBtn = document.getElementById('open-new-dm');
const dmDialog = document.getElementById('dm-dialog');
const dmDialogContent = document.getElementById('dialog-content');
const toastElement = document.getElementById('toast');
const notifBtn = document.getElementById('open-notif-settings');
const notifMenu = document.getElementById('notif-menu');
const isTypingNom = document.getElementById('is-typing-nom');
const connectionStatus = document.getElementById('connection-status');
const connectionLabel = document.getElementById('connection-label');
const connectionDetail = document.getElementById('connection-detail');
const connectionRetry = document.getElementById('connection-retry');
const currentUserAvatar = document.getElementById('current-user-avatar');

let etatReseau = { statut: 'inconnu' };
let presences = {};

function afficherEtatReseau(nouvelEtat = etatReseau) {
  etatReseau = nouvelEtat ?? etatReseau;
  ChatUiShared.afficherEtatReseau({
    etat: etatReseau,
    elements: {
      statutConnexion: connectionStatus,
      libelleConnexion: connectionLabel,
      detailConnexion: connectionDetail,
      reessayer: connectionRetry,
      messageInput,
      submitButton: messageForm?.querySelector('button[type="submit"]'),
    },
    t,
    composerAutorise: Boolean(
      state.activeConversationId &&
      state.conversations.some(
        (conversation) => conversation.id === state.activeConversationId
      )
    ),
  });
  afficherPresenceCourante();
}

function afficherPresenceCourante() {
  ChatUiShared.afficherAvatarCourant({
    element: currentUserAvatar,
    utilisateur: state.utilisateurActuel,
    preferences: state.preferences,
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

const NotifPrefs =
  window.NotifPrefs ??
  (() => {
    console.error(
      '[message-prive] window.NotifPrefs est introuvable : notif-prefs.js doit être chargé avant ce script (voir message-prive.html). Notifications et badges désactivés pour cette session.'
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
const serviceNotifications = window.notifications;

let fenetreEstFocusee = true;

let lecturesDm = { conversationId: null, luJusqua: null };
let separateurDm = { conversationId: null, nonLus: 0 };

function definirConversationActivePourNotifs(conversationId) {
  if (typeof serviceNotifications?.setActiveConversation === 'function') {
    serviceNotifications.setActiveConversation(conversationId ?? null);
  }
}

function notifierMessageSysteme(message) {
  if (typeof serviceNotifications?.messageReceived === 'function' && message) {
    serviceNotifications.messageReceived(message);
  }
}

const state = {
  conversations: [],
  activeConversationId: null,
  currentFilter: 'all',
  preferences: null,
  currentUserId: null,
  utilisateurActuel: null,
  utilisateurs: [],
  etatsSaisie: {},
};

function afficherUtilisateurCourant() {
  if (currentUserPseudoEl) {
    const pseudo = state.utilisateurActuel?.pseudo ?? '';
    currentUserPseudoEl.textContent = state.preferences?.alias || pseudo;
    currentUserPseudoEl.title = state.preferences?.alias ? `@${pseudo}` : '';
  }
  afficherPresenceCourante();
  if (currentUserRoleBadgeEl) {
    const role = state.utilisateurActuel?.role;
    const cleRole = role === 'admin' ? 'channels.roleAdmin' : null;
    currentUserRoleBadgeEl.hidden = !cleRole;
    currentUserRoleBadgeEl.textContent = cleRole ? t(cleRole) : '';
    currentUserRoleBadgeEl.title = cleRole ? t(cleRole) : '';
  }
}

function brancherPresence() {
  window.electronAPI.onPresenceChange((presence) => {
    presences[presence.utilisateurId] = presence.statut;
    afficherPresenceCourante();

    const choixUtilisateur = Array.from(
      dmDialogContent?.querySelectorAll('.user-choice[data-user-id]') ?? []
    ).find((element) => element.dataset.userId === presence.utilisateurId);
    const avatarChoix = choixUtilisateur?.querySelector('.avatar');
    if (avatarChoix) {
      const estEnLigne = presence.statut === 'en-ligne';
      avatarChoix.classList.toggle('offline', !estEnLigne);
      avatarChoix.title = estEnLigne ? t('dm.online') : t('dm.offline');
    }

    const conversation = state.conversations.find(
      (item) => item.otherUser?.id === presence.utilisateurId
    );
    if (!conversation) return;

    conversation.otherUser.present = presence.statut === 'en-ligne';

    if (state.currentFilter !== 'all') {
      renderConversationList();
    } else if (listElement) {
      const ligne = Array.from(
        listElement.querySelectorAll('.conversation[data-conversation-id]')
      ).find((element) => element.dataset.conversationId === conversation.id);
      const avatar = ligne?.querySelector('.avatar');
      avatar?.classList.toggle('offline', !conversation.otherUser.present);

      if (!conversation.lastMessage) {
        const sousTitre = ligne?.querySelector('.last-message');
        if (sousTitre) {
          sousTitre.textContent = conversation.otherUser.present
            ? t('dm.online')
            : t('dm.offline');
        }
      }
    }

    if (conversation.id === state.activeConversationId) {
      if (topbarStatus) {
        topbarStatus.textContent = conversation.otherUser.present
          ? t('dm.online')
          : t('dm.offline');
        topbarStatus.classList.toggle('online', conversation.otherUser.present);
        topbarStatus.classList.toggle(
          'offline',
          !conversation.otherUser.present
        );
      }
      topbarAvatar?.classList.toggle(
        'offline',
        !conversation.otherUser.present
      );
    }
  });
}

let generationLecturesDm = 0;
