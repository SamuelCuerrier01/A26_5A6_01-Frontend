const TAILLE_PAGE_CONVERSATIONS = 15;
let limiteConversations = TAILLE_PAGE_CONVERSATIONS;

function renderConversationList() {
  if (!listElement) {
    return;
  }

  const filtered = getFilteredConversations();
  listElement.innerHTML = '';

  const afficherRonds = NotifPrefs.afficheRonds(state.currentUserId);
  const indexActif = filtered.findIndex(
    (conversation) => conversation.id === state.activeConversationId
  );
  const limite = Math.max(limiteConversations, indexActif + 1);

  filtered.slice(0, limite).forEach((conversation) => {
    const li = document.createElement('li');
    const otherUser = conversation.otherUser;
    const isActive = conversation.id === state.activeConversationId;
    const lastMessage = conversation.lastMessage?.contenu ?? t('dm.noMessage');
    const statusLabel = otherUser?.present ? t('dm.online') : t('dm.offline');
    const subtitle = conversation.lastMessage ? lastMessage : statusLabel;

    li.classList.add('conversation');
    li.classList.toggle('active', isActive);
    li.dataset.conversationId = conversation.id;

    const avatar = document.createElement('div');
    avatar.classList.add('avatar');
    if (!otherUser?.present) {
      avatar.classList.add('offline');
    }
    ChatUiShared.remplirAvatar(avatar, otherUser?.avatar);
    ChatUiShared.rendreAvatarCliquable(avatar, {
      utilisateurId: otherUser?.id,
      nom: ChatUiShared.nomAffiche(otherUser) || t('dm.defaultUser'),
      t,
      ouvrir: ouvrirProfilDm,
    });

    const info = document.createElement('div');
    info.classList.add('conversation-info');

    const username = document.createElement('div');
    username.classList.add('username');
    username.textContent =
      ChatUiShared.nomAffiche(otherUser) || t('dm.defaultUser');

    const lastMessageEl = document.createElement('div');
    lastMessageEl.classList.add('last-message');
    lastMessageEl.textContent = subtitle;

    info.append(username, lastMessageEl);
    const compteur = document.createElement('span');
    compteur.classList.add('notif-count', 'notif-count--conversation');
    NotifPrefs.remplirCompteur(
      compteur,
      NotifPrefs.nombreNonLus('prive', conversation.id),
      afficherRonds
    );
    li.append(avatar, info, compteur);

    li.addEventListener('click', async () => {
      state.activeConversationId = conversation.id;
      if (messageInput) messageInput.value = '';
      await renderActiveConversation();
      renderConversationList();
      mettreAJourBadgeApplication();
      await actualiserIndicateurSaisie();
    });

    listElement.appendChild(li);
  });

  if (filtered.length > limite) {
    const item = document.createElement('li');
    item.classList.add('conversation-more');
    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'secondary-button full-width';
    plus.textContent = t('dm.showMoreConversations');
    plus.addEventListener('click', () => {
      limiteConversations = limite + TAILLE_PAGE_CONVERSATIONS;
      renderConversationList();
      listElement
        .querySelectorAll('.conversation[data-conversation-id]')
        [limite]?.scrollIntoView?.({ block: 'nearest' });
    });
    item.appendChild(plus);
    listElement.appendChild(item);
  }
}

function reinitialiserHistoriqueDm() {
  etatHistoriqueDm = {
    conversationId: null,
    messagesAnciens: [],
    finHistorique: false,
    enChargement: false,
  };
}

function afficherAucuneConversation() {
  ChatUiShared.remplirAvatar(topbarAvatar, null);
  topbarAvatar?.classList.add('sans-presence');
  if (topbarAvatar) {
    topbarAvatar.dataset.userId = '';
    topbarAvatar.removeAttribute('title');
    topbarAvatar.removeAttribute('aria-label');
  }
  if (topbarName) topbarName.textContent = t('dm.selectConversation');
  if (topbarStatus) {
    topbarStatus.textContent = t('dm.noActiveConversation');
    topbarStatus.classList.remove('online', 'offline');
  }
}

async function renderActiveConversation(options = {}) {
  const { conserverPositionScroll = false, garderScroll = false } = options;
  if (!state.activeConversationId) {
    if (messageList) {
      messageList.innerHTML = '';
    }
    afficherAucuneConversation();
    definirConversationActivePourNotifs(null);
    reinitialiserHistoriqueDm();
    afficherEtatReseau();
    return;
  }

  const conversation = state.conversations.find(
    (entry) => entry.id === state.activeConversationId
  );

  if (!conversation || !messageList) {
    state.activeConversationId = null;
    if (messageList) {
      messageList.innerHTML = '';
    }
    afficherAucuneConversation();
    definirConversationActivePourNotifs(null);
    reinitialiserHistoriqueDm();
    afficherEtatReseau();
    return;
  }

  afficherEtatReseau();

  if (etatHistoriqueDm.conversationId !== conversation.id) {
    separateurDm = {
      conversationId: conversation.id,
      nonLus: NotifPrefs.nombreNonLus('prive', conversation.id),
    };
    void chargerLecturesDm(conversation.id);
    etatHistoriqueDm = {
      conversationId: conversation.id,
      messagesAnciens: [],
      finHistorique: Boolean(conversation.finHistorique),
      enChargement: false,
    };
  } else if (etatHistoriqueDm.messagesAnciens.length === 0) {
    etatHistoriqueDm.finHistorique = Boolean(conversation.finHistorique);
  }

  definirConversationActivePourNotifs(conversation.id);

  const messagesEnAttenteDeLaConversation = obtenirMessagesEnAttenteDm(
    conversation.id
  );
  if (etatHistoriqueDm.sautEnCours) {
    ChatUiShared.afficherChargementRecherche(messageList, t);
    return;
  }
  const messagesHistorique = fusionnerHistoriqueDm(
    etatHistoriqueDm.messagesAnciens,
    etatHistoriqueDm.ancreId && !etatHistoriqueDm.finRecents
      ? (conversation.messages ?? []).filter((message) =>
          etatHistoriqueDm.messagesAnciens.some(
            (ancien) => ancien.id === message.id
          )
        )
      : (conversation.messages ?? [])
  );
  const messages = fusionnerAvecMessagesEnAttenteDm(
    messagesHistorique,
    messagesEnAttenteDeLaConversation
  );
  const otherUser = conversation.otherUser;

  if (topbarName) {
    topbarName.textContent =
      ChatUiShared.nomAffiche(otherUser) || t('dm.defaultUser');
  }
  if (topbarStatus) {
    topbarStatus.textContent = otherUser?.present
      ? t('dm.online')
      : t('dm.offline');
    topbarStatus.classList.toggle('online', Boolean(otherUser?.present));
    topbarStatus.classList.toggle('offline', !otherUser?.present);
  }
  if (topbarAvatar) {
    topbarAvatar.classList.toggle('offline', !otherUser?.present);
    topbarAvatar.classList.remove('sans-presence');
    ChatUiShared.remplirAvatar(topbarAvatar, otherUser?.avatar);
    topbarAvatar.dataset.userId = otherUser?.id ?? '';
    const nomTopbar = ChatUiShared.nomAffiche(otherUser) || t('dm.defaultUser');
    topbarAvatar.title = t('userCard.view', { name: nomTopbar });
    topbarAvatar.setAttribute('aria-label', topbarAvatar.title);
  }
  if (typingIndicator && isTypingNom) {
    isTypingNom.textContent =
      ChatUiShared.nomAffiche(otherUser) || t('dm.defaultUser');
  }

  const hauteurAvant = messageList.scrollHeight;
  const scrollAvant = messageList.scrollTop;

  messageList.innerHTML = '';

  if (messages.length === 0) {
    const row = document.createElement('article');
    row.classList.add('message-row');

    const body = document.createElement('div');
    body.classList.add('message-body');

    const text = document.createElement('p');
    text.classList.add('text');
    text.textContent = t('dm.noMessagesYet');

    body.appendChild(text);
    row.appendChild(body);
    messageList.appendChild(row);
    return;
  }

  messageList.appendChild(
    creerStatutHistoriqueDm(etatHistoriqueDm, () =>
      chargerMessagesPlusAnciensDm()
    )
  );

  const indexNonLu = LogiqueInterface.indexSeparateur(
    messages,
    separateurDm,
    state.currentUserId
  );
  const lecturesConnues = lecturesDm.conversationId === conversation.id;
  const luJusqua = lecturesConnues ? lecturesDm.luJusqua : null;
  const dernierEnvoi = messages
    .filter(
      (message) => message.auteurId === state.currentUserId && !message.nonLivre
    )
    .at(-1)?.id;
  const dernierLivre = messages.filter((message) => !message.nonLivre).at(-1);

  messages.forEach((message, index) => {
    if (index === indexNonLu) {
      messageList.appendChild(ChatUiShared.creerSeparateurNonLus(t));
    }
    const row = document.createElement('article');
    const isOwn = message.auteurId === state.currentUserId;
    const author = isOwn
      ? t('dm.me')
      : ChatUiShared.nomAffiche(otherUser) || t('dm.defaultUser');
    const timeLabel = new Date(message.envoi).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    row.classList.add('message-row');
    row.dataset.messageId = message.id;
    if (ChatUiShared.estMessageCible(message.id)) {
      row.classList.add('message-cible');
    }
    if (isOwn) {
      row.classList.add('own-message');
    }
    if (message.nonLivre) {
      row.classList.add('non-livre');
    }

    const avatar = document.createElement('div');
    avatar.classList.add('avatar');
    ChatUiShared.remplirAvatar(
      avatar,
      isOwn ? state.preferences?.avatar : otherUser?.avatar
    );
    if (!isOwn) {
      ChatUiShared.rendreAvatarCliquable(avatar, {
        utilisateurId: otherUser?.id,
        nom: author,
        t,
        ouvrir: ouvrirProfilDm,
      });
    }

    const body = document.createElement('div');
    body.classList.add('message-body');

    const meta = document.createElement('div');
    meta.classList.add('message-meta');

    const authorEl = document.createElement('span');
    authorEl.classList.add('author');
    authorEl.textContent = author;

    const timeEl = document.createElement('span');
    timeEl.classList.add('timestamp');
    timeEl.textContent = timeLabel;

    const text = document.createElement('p');
    text.classList.add('text');
    ChatUiShared.remplirTexteMessage(text, message.contenu);

    meta.append(authorEl, timeEl);
    if (message.modification) {
      const edited = document.createElement('span');
      edited.classList.add('edited-label');
      edited.textContent = `(${t('messages.edited')})`;
      meta.appendChild(edited);
    }
    const lecture = LogiqueInterface.statutLecture(
      message.envoi,
      luJusqua,
      message.id,
      lecturesDm.dernierMessageLuId
    );
    const statut =
      lecture === 'lu' ? 'lu' : message.livraison ? 'distribue' : 'envoye';
    if (isOwn && !message.nonLivre && message.id === dernierEnvoi) {
      meta.appendChild(ChatUiShared.creerStatutLecture(statut, t));
    }
    body.append(meta, text);

    if (message.nonLivre) {
      body.appendChild(creerActionsMessageNonLivre(message));
    } else if (isOwn) {
      body.appendChild(creerActionsMessage(message, text));
    }
    row.append(avatar, body);
    messageList.appendChild(row);
  });

  if (etatHistoriqueDm.ancreId && !etatHistoriqueDm.finRecents) {
    const bouton = document.createElement('button');
    bouton.className = 'historique-statut historique-statut--bouton';
    bouton.type = 'button';
    bouton.textContent = t('history.loadNewer');
    bouton.disabled = etatHistoriqueDm.enChargement;
    bouton.addEventListener('click', () => void chargerMessagesPlusRecentsDm());
    messageList.appendChild(bouton);
  }

  if (fenetreEstFocusee && dernierLivre?.id) {
    NotifPrefs.marquerLu(window.electronAPI, 'prive', conversation.id, {
      messageId: dernierLivre.id,
      estAffichee: () =>
        fenetreEstFocusee && state.activeConversationId === conversation.id,
      surChangement: () => {
        renderConversationList();
        mettreAJourBadgeApplication();
      },
    });
  }

  if (garderScroll) {
    messageList.scrollTop = scrollAvant;
  } else if (conserverPositionScroll) {
    messageList.scrollTop =
      messageList.scrollHeight - hauteurAvant + scrollAvant;
  } else {
    messageList.scrollTop = messageList.scrollHeight;
  }
}

function creerActionsMessage(message, texteEl) {
  return ChatUiShared.creerActionsMessage({
    message,
    texteEl,
    api: window.electronAPI,
    utilisateurId: () => state.currentUserId,
    t,
    notifier,
    messageErreur,
    champMessage: messageInput,
    getEtatReseau: () => etatReseau,
  });
}

function creerActionsMessageNonLivre(message) {
  return ChatUiShared.creerActionsMessageNonLivre({
    message,
    t,
    enCours: messagesEnAttenteEnCoursDm.has(message.id),
    onReessayer: reessayerMessageEnAttenteDm,
    onSupprimer: supprimerMessageEnAttenteDm,
  });
}

const paginationsEnCoursDm = new Map();

function chargerMessagesPlusAnciensDm(options = {}) {
  const historique = etatHistoriqueDm;
  const enCours = paginationsEnCoursDm.get(historique);
  if (enCours) return enCours;
  const requete = executerPaginationDm(options).finally(() => {
    if (paginationsEnCoursDm.get(historique) === requete)
      paginationsEnCoursDm.delete(historique);
  });
  paginationsEnCoursDm.set(historique, requete);
  return requete;
}

async function executerPaginationDm({ taille } = {}) {
  const historique = etatHistoriqueDm;
  const conversation = state.conversations.find(
    (entry) => entry.id === state.activeConversationId
  );
  if (
    !conversation ||
    etatHistoriqueDm.conversationId !== conversation.id ||
    etatHistoriqueDm.enChargement ||
    etatHistoriqueDm.finHistorique
  ) {
    return false;
  }

  const plusAncienCharge =
    etatHistoriqueDm.messagesAnciens[0] ?? conversation.messages?.[0];

  etatHistoriqueDm.enChargement = true;
  await renderActiveConversation({ conserverPositionScroll: true });

  try {
    if (etatHistoriqueDm !== historique) return false;
    const resultat = await window.electronAPI.obtenirMessagesPriveesAvant({
      conversationId: conversation.id,
      utilisateurId: state.currentUserId,
      avantId: plusAncienCharge?.id,
      ...(taille ? { taille } : {}),
    });
    if (etatHistoriqueDm !== historique) {
      return false;
    }
    etatHistoriqueDm.messagesAnciens = fusionnerHistoriqueDm(
      etatHistoriqueDm.messagesAnciens,
      resultat.messages
    );
    etatHistoriqueDm.finHistorique = resultat.finHistorique;
    return true;
  } catch (erreur) {
    if (etatHistoriqueDm !== historique) return false;
    notifier(messageErreur(erreur), true);
    return false;
  } finally {
    if (etatHistoriqueDm === historique) {
      etatHistoriqueDm.enChargement = false;
      await renderActiveConversation({ conserverPositionScroll: true });
    }
  }
}

async function chargerLecturesDm(conversationId) {
  const generation = ++generationLecturesDm;
  const etat =
    lecturesDm.conversationId === conversationId
      ? lecturesDm
      : { conversationId, luJusqua: null };
  lecturesDm = etat;
  try {
    const { lecteurs } = await window.electronAPI.obtenirLectures({
      type: 'prive',
      conversationId,
    });
    if (
      generation !== generationLecturesDm ||
      state.activeConversationId !== conversationId ||
      lecturesDm.conversationId !== conversationId
    )
      return;
    lecturesDm = {
      conversationId,
      ...LogiqueInterface.fusionnerLecture(lecturesDm, lecteurs[0] ?? etat),
    };
    await renderActiveConversation({ garderScroll: true });
  } catch (erreur) {
    console.warn('[lectures] accusé de lecture indisponible :', erreur);
  }
}

async function appliquerLecture(lecture) {
  if (lecture?.deMoi) {
    await NotifPrefs.chargerNonLus(window.electronAPI);
    renderConversationList();
    await actualiserBadgeSalons({ recharger: false });
    mettreAJourBadgeApplication();
    return;
  }
  if (
    lecture?.type !== 'prive' ||
    lecture.conversationId !== state.activeConversationId ||
    lecturesDm.conversationId !== lecture.conversationId
  ) {
    return;
  }
  lecturesDm = {
    conversationId: lecture.conversationId,
    ...LogiqueInterface.fusionnerLecture(lecturesDm, lecture),
  };
  await renderActiveConversation({ garderScroll: true });
}

async function allerAuMessageDm(messageId) {
  const id = state.activeConversationId;
  if (!id) return;
  const historique = {
    ...etatHistoriqueDm,
    messagesAnciens: [],
    sautEnCours: true,
  };
  etatHistoriqueDm = historique;
  ChatUiShared.afficherChargementRecherche(messageList, t);
  try {
    const resultat = await window.electronAPI.obtenirMessagesPriveesAvant({
      conversationId: id,
      autourId: messageId,
      taille: 50,
    });
    if (state.activeConversationId !== id || etatHistoriqueDm !== historique)
      return;
    if (!resultat?.messages?.some((message) => message.id === messageId)) {
      notifier(t('search.messageNotFound'), true);
      return;
    }
    historique.messagesAnciens = resultat.messages;
    historique.finHistorique = resultat.finHistorique;
    historique.ancreId = messageId;
    try {
      const suite = await window.electronAPI.obtenirMessagesPriveesAvant({
        conversationId: id,
        apresId: resultat.messages.at(-1).id,
        taille: 50,
      });
      historique.messagesAnciens = fusionnerHistoriqueDm(
        historique.messagesAnciens,
        suite.messages
      );
      historique.finRecents = suite.finHistorique;
    } catch {
      historique.finRecents = false;
    }
  } catch (erreur) {
    if (state.activeConversationId !== id || etatHistoriqueDm !== historique)
      return;
    notifier(messageErreur(erreur), true);
  } finally {
    if (state.activeConversationId === id && etatHistoriqueDm === historique) {
      historique.sautEnCours = false;
      await renderActiveConversation({ conserverPositionScroll: true });
      if (historique.ancreId)
        ChatUiShared.allerAuMessageAffiche(messageList, messageId);
    }
  }
}
async function chargerMessagesPlusRecentsDm() {
  const historique = etatHistoriqueDm;
  const id = state.activeConversationId;
  if (!historique.ancreId || historique.finRecents || historique.enChargement)
    return;
  historique.enChargement = true;
  try {
    const dernier = historique.messagesAnciens.at(-1);
    if (!dernier) return;
    const resultat = await window.electronAPI.obtenirMessagesPriveesAvant({
      conversationId: id,
      apresId: dernier.id,
      taille: 50,
    });
    if (etatHistoriqueDm !== historique || state.activeConversationId !== id)
      return;
    historique.messagesAnciens = fusionnerHistoriqueDm(
      historique.messagesAnciens,
      resultat.messages
    );
    historique.finRecents = resultat.finHistorique;
  } catch (erreur) {
    if (etatHistoriqueDm === historique) notifier(messageErreur(erreur), true);
  } finally {
    if (etatHistoriqueDm === historique) {
      historique.enChargement = false;
      await renderActiveConversation({ garderScroll: true });
    }
  }
}
