const messageErreur = I18n.messageErreur;

function getFilteredConversations() {
  if (state.currentFilter === 'online') {
    return state.conversations.filter(
      (conversation) => conversation.otherUser?.present === true
    );
  }

  return state.conversations;
}

async function actualiserIndicateurSaisie() {
  if (!state.activeConversationId) {
    if (typingIndicator) {
      typingIndicator.hidden = true;
      typingIndicator.style.setProperty('display', 'none', 'important');
    }
    return;
  }

  const etats = await window.electronAPI.obtenirEtatsSaisie(
    state.activeConversationId
  );
  state.etatsSaisie = Array.isArray(etats) ? etats : [];

  const autreUtilisateurEcrit = (state.etatsSaisie || []).some(
    (item) =>
      item.utilisateurId !== state.currentUserId && item.est_saisie === true
  );

  if (typingIndicator) {
    if (autreUtilisateurEcrit) {
      typingIndicator.hidden = false;
      typingIndicator.style.setProperty('display', 'flex', 'important');
    } else {
      typingIndicator.hidden = true;
      typingIndicator.style.setProperty('display', 'none', 'important');
    }
  }
}

async function refreshConversations(options = {}) {
  try {
    state.conversations = await window.electronAPI.obtenirConversationsPrivees(
      state.currentUserId
    );
  } catch (erreur) {
    notifier(messageErreur(erreur), true);
    planifierNouvelEssaiConversations();
    return;
  }
  if (state.conversations.some((c) => c.otherUser?.pseudoInconnu)) {
    planifierNouvelEssaiConversations();
  }
  await afficherConversations(options);
}

const DELAI_NOUVEL_ESSAI_CONVERSATIONS_MS = 5000;
let minuteurNouvelEssaiConversations = null;

function planifierNouvelEssaiConversations() {
  if (minuteurNouvelEssaiConversations) return;
  minuteurNouvelEssaiConversations = window.setTimeout(() => {
    minuteurNouvelEssaiConversations = null;
    void refreshConversations({ conserverPositionScroll: true });
  }, DELAI_NOUVEL_ESSAI_CONVERSATIONS_MS);
}

async function afficherConversations(options = {}) {
  state.conversations = LogiqueInterface.trierConversations(
    state.conversations
  );

  if (!state.activeConversationId && state.conversations.length > 0) {
    state.activeConversationId = state.conversations[0].id;
  }

  state.etatsSaisie = await window.electronAPI.obtenirEtatsSaisie(
    state.activeConversationId
  );

  if (
    state.currentFilter === 'online' &&
    !state.conversations.some(
      (conversation) =>
        conversation.id === state.activeConversationId &&
        conversation.otherUser?.present
    )
  ) {
    const firstOnline = state.conversations.find(
      (conversation) => conversation.otherUser?.present
    );
    state.activeConversationId = firstOnline?.id ?? null;
  }

  afficherEtatReseau();

  await renderActiveConversation(options);
  renderConversationList();
  mettreAJourBadgeApplication();
  actualiserIndicateurSaisie();
}

function trouverConversation(conversationId) {
  return state.conversations.find(
    (conversation) => conversation.id === conversationId
  );
}

async function integrerMessagePrive(message, options = {}) {
  const conversation = trouverConversation(message?.conversationId);
  if (!conversation) {
    await refreshConversations(options);
    return;
  }
  if (
    message.auteurId === state.currentUserId &&
    etatHistoriqueDm.ancreId &&
    etatHistoriqueDm.conversationId === conversation.id
  ) {
    etatHistoriqueDm = {
      conversationId: conversation.id,
      messagesAnciens: [],
      finHistorique: Boolean(conversation.finHistorique),
      enChargement: false,
    };
    options = {};
  }
  conversation.messages = LogiqueInterface.ajouterMessage(
    conversation.messages,
    message,
    'envoi'
  );
  conversation.lastMessage =
    conversation.messages[conversation.messages.length - 1];
  await afficherConversations(options);
}

const remplacerMessage = LogiqueInterface.remplacerMessage;

async function appliquerMessageModifie(message) {
  const conversation = trouverConversation(message?.conversationId);
  if (!conversation) return;
  conversation.messages = remplacerMessage(conversation.messages, message);
  if (conversation.lastMessage?.id === message.id) {
    conversation.lastMessage = { ...conversation.lastMessage, ...message };
  }
  if (etatHistoriqueDm.conversationId === conversation.id) {
    etatHistoriqueDm.messagesAnciens = remplacerMessage(
      etatHistoriqueDm.messagesAnciens,
      message
    );
  }
  await afficherConversations({ garderScroll: true });
}

async function appliquerMessageSupprime(messageId) {
  const conversation = state.conversations.find(
    (item) =>
      item.lastMessage?.id === messageId ||
      LogiqueInterface.contientMessage(item.messages, messageId) ||
      (etatHistoriqueDm.conversationId === item.id &&
        LogiqueInterface.contientMessage(
          etatHistoriqueDm.messagesAnciens,
          messageId
        ))
  );
  if (!conversation) return;
  conversation.messages = LogiqueInterface.retirerMessage(
    conversation.messages,
    messageId
  );
  if (etatHistoriqueDm.conversationId === conversation.id) {
    etatHistoriqueDm.messagesAnciens = LogiqueInterface.retirerMessage(
      etatHistoriqueDm.messagesAnciens,
      messageId
    );
  }
  if (conversation.lastMessage?.id === messageId) {
    if (conversation.messages.length === 0) {
      await refreshConversations({ garderScroll: true });
      return;
    }
    conversation.lastMessage =
      conversation.messages[conversation.messages.length - 1];
  }
  await afficherConversations({ garderScroll: true });
}

async function initialiserUtilisateurCourant() {
  state.utilisateurs = await window.electronAPI.obtenirUtilisateurs();
  state.utilisateurActuel =
    await window.electronAPI.obtenirUtilisateurConnecte();
  state.currentUserId = state.utilisateurActuel?.id ?? '';
  appliquerPreferences(await window.electronAPI.obtenirPreferences());
  afficherUtilisateurCourant();
}

function appliquerPreferences(nouvelles) {
  if (!nouvelles) return;
  state.preferences = nouvelles;
  ThemeManager.appliquerTheme(nouvelles.theme);
  if (nouvelles.langue) I18n.definirLangueActuelle(nouvelles.langue);
  NotifPrefs.definirMode(state.currentUserId, nouvelles.modeNotification);
}

let minuteurRail = null;

function brancherMessagesRecus() {
  if (typeof window.electronAPI?.onNouveauMessage === 'function') {
    window.electronAPI.onNouveauMessage((payload) => {
      if (!payload?.message) return;
      const estSalon = payload.conversationType === 'salon';
      const messageNormalise = {
        type: estSalon ? 'salon' : 'prive',
        auteurId: payload.message.auteurId,
        contenu: payload.message.contenu,
        conversationId: estSalon
          ? payload.salonId
          : payload.message.conversationId,
      };
      if (payload.message.auteurId !== state.currentUserId) {
        NotifPrefs.ajouterNonLu(
          messageNormalise.type,
          messageNormalise.conversationId
        );
      }
      NotifPrefs.traiterMessageRecu(messageNormalise, {
        utilisateurId: state.currentUserId,
        api: window.electronAPI,
        surNonLusActualises: async () => {
          renderConversationList();
          await actualiserBadgeSalons({ recharger: false });
          mettreAJourBadgeApplication();
        },
        surSalon: async () => {
          await actualiserBadgeSalons({ recharger: false });
          mettreAJourBadgeApplication();
        },
        surPrive: () => {
          const suivre = LogiqueInterface.doitSuivreNouveauMessage({
            dansConversationAffichee:
              payload.message.conversationId === state.activeConversationId,
            estAuteur: payload.message.auteurId === state.currentUserId,
            presDuBas: LogiqueInterface.estPresDuBas(messageList),
          });
          return integrerMessagePrive(
            payload.message,
            suivre ? {} : { garderScroll: true }
          );
        },
        notifierMessageSysteme,
      });
    });
  }
}
