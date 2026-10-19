let etatHistoriqueSalon = {
  salonId: null,
  messagesAnciens: [],
  finHistorique: false,
  enChargement: false,
};

const messagesEnAttenteSalon = new Map();

const messagesEnAttenteEnCoursSalon = new Set();

function ajouterMessageEnAttenteSalon(salonId, message) {
  const liste = messagesEnAttenteSalon.get(salonId) ?? [];
  liste.push(message);
  messagesEnAttenteSalon.set(salonId, liste);
}

function obtenirMessagesEnAttenteSalon(salonId) {
  const liste = messagesEnAttenteSalon.get(salonId) ?? [];
  return liste.filter((message) => message.auteurId === utilisateurActuelId);
}

function retirerMessageEnAttenteSalon(salonId, messageId) {
  const liste = messagesEnAttenteSalon.get(salonId);
  if (!liste) return;
  const restants = liste.filter((message) => message.id !== messageId);
  if (restants.length) {
    messagesEnAttenteSalon.set(salonId, restants);
  } else {
    messagesEnAttenteSalon.delete(salonId);
  }
}

async function reessayerMessageEnAttenteSalon(message) {
  if (messagesEnAttenteEnCoursSalon.has(message.id)) return;
  if (etatReseau.statut !== 'connecte') {
    notifier(t('messages.stillOffline'), true);
    return;
  }
  messagesEnAttenteEnCoursSalon.add(message.id);
  afficherMessages({ conserverPositionScroll: true });

  try {
    await window.electronAPI.envoyerMessageSalon({
      salonId: message.conversationId,
      utilisateurId: message.auteurId,
      contenu: message.contenu,
    });
  } catch (erreur) {
    messagesEnAttenteEnCoursSalon.delete(message.id);
    notifier(messageErreur(erreur), true);
    afficherMessages({ conserverPositionScroll: true });
    return;
  }

  retirerMessageEnAttenteSalon(message.conversationId, message.id);
  messagesEnAttenteEnCoursSalon.delete(message.id);
  try {
    await actualiser();
  } catch (erreur) {
    notifier(messageErreur(erreur), true);
  }
}

function supprimerMessageEnAttenteSalon(message) {
  if (messagesEnAttenteEnCoursSalon.has(message.id)) return;
  retirerMessageEnAttenteSalon(message.conversationId, message.id);
  afficherMessages({ conserverPositionScroll: true });
}

function creerActionsMessageNonLivre(message) {
  return ChatUiShared.creerActionsMessageNonLivre({
    message,
    t,
    enCours: messagesEnAttenteEnCoursSalon.has(message.id),
    onReessayer: reessayerMessageEnAttenteSalon,
    onSupprimer: supprimerMessageEnAttenteSalon,
  });
}

const LogiqueInterface = window.LogiqueInterface;
if (!LogiqueInterface) {
  throw new Error('logique-interface.js doit être chargé avant salons/*.js');
}
const fusionnerHistorique = LogiqueInterface.fusionnerHistorique;
const fusionnerAvecMessagesEnAttente =
  LogiqueInterface.fusionnerAvecMessagesEnAttente;

function creerStatutHistorique(etatHistorique, surClicChargerPlus) {
  if (etatHistorique.enChargement) {
    return creerEl('div', {
      classe: 'historique-statut historique-statut--chargement',
      texte: t('history.loading'),
      attrs: { 'aria-live': 'polite' },
    });
  }
  if (etatHistorique.finHistorique) {
    return creerEl('div', {
      classe: 'historique-statut historique-statut--fin',
      texte: t('history.endOfHistory'),
    });
  }
  const bouton = creerEl('button', {
    classe: 'historique-statut historique-statut--bouton',
    texte: t('history.loadOlder'),
    attrs: { type: 'button' },
  });
  bouton.addEventListener('click', surClicChargerPlus);
  return bouton;
}
