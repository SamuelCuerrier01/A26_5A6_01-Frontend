function notifier(message, erreur = false) {
  if (!toastElement) {
    return;
  }
  toastElement.textContent = message;
  toastElement.classList.toggle('error', erreur);
  toastElement.classList.add('visible');
  window.setTimeout(() => toastElement.classList.remove('visible'), 2600);
}

let etatHistoriqueDm = {
  conversationId: null,
  messagesAnciens: [],
  finHistorique: false,
  enChargement: false,
};

const messagesEnAttenteDm = new Map();

const messagesEnAttenteEnCoursDm = new Set();

function ajouterMessageEnAttenteDm(conversationId, message) {
  const liste = messagesEnAttenteDm.get(conversationId) ?? [];
  liste.push(message);
  messagesEnAttenteDm.set(conversationId, liste);
}

function obtenirMessagesEnAttenteDm(conversationId) {
  const liste = messagesEnAttenteDm.get(conversationId) ?? [];
  return liste.filter((message) => message.auteurId === state.currentUserId);
}

function retirerMessageEnAttenteDm(conversationId, messageId) {
  const liste = messagesEnAttenteDm.get(conversationId);
  if (!liste) return;
  const restants = liste.filter((message) => message.id !== messageId);
  if (restants.length) {
    messagesEnAttenteDm.set(conversationId, restants);
  } else {
    messagesEnAttenteDm.delete(conversationId);
  }
}

async function reessayerMessageEnAttenteDm(message) {
  if (messagesEnAttenteEnCoursDm.has(message.id)) return;
  if (etatReseau.statut !== 'connecte') {
    notifier(t('messages.stillOffline'), true);
    return;
  }
  messagesEnAttenteEnCoursDm.add(message.id);
  void renderActiveConversation({ conserverPositionScroll: true });

  let envoye;
  try {
    envoye = await window.electronAPI.envoyerMessagePrive({
      conversationId: message.conversationId,
      contenu: message.contenu,
      utilisateurId: message.auteurId,
    });
  } catch (erreur) {
    messagesEnAttenteEnCoursDm.delete(message.id);
    notifier(messageErreur(erreur), true);
    void renderActiveConversation({ conserverPositionScroll: true });
    return;
  }

  retirerMessageEnAttenteDm(message.conversationId, message.id);
  messagesEnAttenteEnCoursDm.delete(message.id);
  try {
    await integrerMessagePrive(envoye);
  } catch (erreur) {
    notifier(messageErreur(erreur), true);
    void renderActiveConversation({ conserverPositionScroll: true });
  }
}

function supprimerMessageEnAttenteDm(message) {
  if (messagesEnAttenteEnCoursDm.has(message.id)) return;
  retirerMessageEnAttenteDm(message.conversationId, message.id);
  void renderActiveConversation({ conserverPositionScroll: true });
}

const fusionnerHistoriqueDm = (messagesAnciens, messagesRecents) =>
  LogiqueInterface.fusionnerHistorique(
    messagesAnciens,
    messagesRecents,
    'envoi'
  );
const fusionnerAvecMessagesEnAttenteDm = (messagesTries, messagesEnAttente) =>
  LogiqueInterface.fusionnerAvecMessagesEnAttente(
    messagesTries,
    messagesEnAttente,
    'envoi'
  );

function creerStatutHistoriqueDm(etatHistorique, surClicChargerPlus) {
  const div = document.createElement(
    etatHistorique.enChargement || etatHistorique.finHistorique
      ? 'div'
      : 'button'
  );
  div.classList.add('historique-statut');
  if (etatHistorique.enChargement) {
    div.classList.add('historique-statut--chargement');
    div.textContent = t('history.loading');
    div.setAttribute('aria-live', 'polite');
  } else if (etatHistorique.finHistorique) {
    div.classList.add('historique-statut--fin');
    div.textContent = t('history.endOfHistory');
  } else {
    div.classList.add('historique-statut--bouton');
    div.type = 'button';
    div.textContent = t('history.loadOlder');
    div.addEventListener('click', surClicChargerPlus);
  }
  return div;
}
