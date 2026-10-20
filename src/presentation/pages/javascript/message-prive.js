window.addEventListener('DOMContentLoaded', async () => {
  await I18n.initialiserDepuisElectronAPI(window.electronAPI);
  appliquerTraductionsStatiques();
  await ThemeManager.initialiserDepuisElectronAPI(window.electronAPI);

  serviceNotifications?.onNotificationRepli?.((message) => {
    notifier(t('notifications.fallbackToast', { texte: message.contenu }));
  });
  if (typeof serviceNotifications?.isWindowFocused === 'function') {
    fenetreEstFocusee = Boolean(await serviceNotifications.isWindowFocused());
  }
  if (typeof serviceNotifications?.onFocusChange === 'function') {
    serviceNotifications.onFocusChange(async (focused) => {
      const regagneLeFocus = focused && !fenetreEstFocusee;
      fenetreEstFocusee = focused;
      if (regagneLeFocus) {
        await renderActiveConversation();
        renderConversationList();
        mettreAJourBadgeApplication();
      }
    });
  }

  if (topbarAvatar) {
    topbarAvatar.classList.add('avatar-clickable');
    topbarAvatar.setAttribute('role', 'button');
    topbarAvatar.tabIndex = 0;
    const ouvrirProfilTopbar = () => {
      if (topbarAvatar.dataset.userId)
        ouvrirProfilDm(topbarAvatar.dataset.userId);
    };
    topbarAvatar.addEventListener('click', ouvrirProfilTopbar);
    topbarAvatar.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        ouvrirProfilTopbar();
      }
    });
  }

  const ouvrirConversation = async (cible) => {
    const conversationId = cible?.conversationId;
    if (!conversationId) return;
    if (cible.type === 'prive') {
      state.activeConversationId = conversationId;
      await renderActiveConversation();
      if (state.activeConversationId !== conversationId) return;
      renderConversationList();
      mettreAJourBadgeApplication();
      if (cible.messageId) await allerAuMessageDm(cible.messageId);
    } else if (cible.type === 'salon') {
      await window.electronAPI.definirCibleNavigation({
        type: 'salon',
        id: conversationId,
      });
      window.electronAPI.navigate('index.html');
    }
  };
  if (typeof serviceNotifications?.onNavigateToConversation === 'function') {
    serviceNotifications.onNavigateToConversation(ouvrirConversation);
  }

  ChatUiShared.brancherRechercheMessages({
    bouton: document.getElementById('open-search'),
    dialogue: document.getElementById('search-dialog'),
    api: window.electronAPI,
    t,
    messageErreur,
    conversationActive: () => {
      const conversation = trouverConversation(state.activeConversationId);
      return conversation
        ? {
            type: 'prive',
            conversationId: conversation.id,
            nom:
              ChatUiShared.nomAffiche(conversation.otherUser) ||
              t('dm.defaultUser'),
          }
        : null;
    },
    surChoix: ouvrirConversation,
  });

  profilBtn?.addEventListener('click', () => {
    window.electronAPI.navigate('profil.html');
  });

  logoutBtn?.addEventListener('click', async () => {
    ChatUiShared.oublierRailEnCache();
    try {
      await window.electronAPI.deconnexionSession();
    } catch (erreur) {
      console.error('[logout] échec de deconnexionSession :', erreur);
    }
    await window.electronAPI.allerALaConnexion();
  });
  const cible = await window.electronAPI.prendreCibleNavigation(['prive']);
  if (cible?.id) state.activeConversationId = cible.id;

  setInterval(async () => {
    await actualiserIndicateurSaisie();
  }, 1500);
  window.electronAPI.onServeurChange?.((evenement) => {
    const nom =
      serveursRail.find((serveur) => serveur.id === evenement.serveurId)?.nom ??
      '';
    const pourMoi = evenement.cibleId === state.currentUserId;
    if (pourMoi && evenement.raison === 'expulse') {
      notifier(t('servers.kickedFrom', { name: nom }), true);
    } else if (pourMoi && evenement.raison === 'invitation') {
      notifier(t('servers.newInvitation'));
    }
    window.clearTimeout(minuteurRail);
    minuteurRail = window.setTimeout(() => actualiserBadgeSalons(), 150);
  });

  window.electronAPI.onProfilsPublicsChange?.(async () => {
    await refreshConversations({ conserverPositionScroll: true });
  });

  window.electronAPI.onPreferencesChange(async (nouvelles) => {
    appliquerPreferences(nouvelles);
    appliquerTraductionsStatiques();
    afficherUtilisateurCourant();
    afficherEtatReseau();
    afficherPresenceCourante();
    renderConversationList();
    await renderActiveConversation();
  });

  if (messageList) {
    messageList.addEventListener('scroll', () => {
      if (messageList.scrollTop < 80) {
        chargerMessagesPlusAnciensDm();
      }
    });
  }

  if (openNewDmBtn && dmDialog) {
    openNewDmBtn.addEventListener('click', () => {
      renderNewDmChoices();
      dmDialog.showModal();
    });
  }

  brancherFiltres();

  brancherFormulaireMessage();

  notifMenu
    ?.querySelector('#notif-apercu')
    ?.addEventListener('change', (event) => {
      NotifPrefs.definirApercu(state.currentUserId, event.target.checked);
    });

  notifBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    if (notifMenu?.hidden === false) {
      fermerMenuNotif();
    } else {
      ouvrirMenuNotif();
    }
  });

  notifMenu?.addEventListener('click', (event) => event.stopPropagation());

  brancherChoixModeNotification();

  document.addEventListener('click', fermerMenuNotif);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') fermerMenuNotif();
  });

  brancherMessagesRecus();

  ChatUiShared.brancherBoutonReessayer({
    api: window.electronAPI,
    element: connectionRetry,
    getEtatReseau: () => etatReseau,
    notifierErreur: (erreur) => notifier(messageErreur(erreur), true),
  });

  window.electronAPI.onLectureChange?.((lecture) => {
    void appliquerLecture(lecture);
  });

  window.electronAPI.onSynchronisationRequise?.(async () => {
    try {
      await NotifPrefs.chargerNonLus(window.electronAPI);
      await refreshConversations({ conserverPositionScroll: true });
      if (state.activeConversationId)
        await chargerLecturesDm(state.activeConversationId);
      await actualiserBadgeSalons();
    } catch (erreur) {
      notifier(messageErreur(erreur), true);
    }
  });

  window.electronAPI.onEtatReseauChange((nouvelEtat) => {
    afficherEtatReseau(nouvelEtat);
  });

  brancherPresence();

  window.electronAPI.onMessageModifieChange(async (message) => {
    await appliquerMessageModifie(message);
  });

  window.electronAPI.onMessageSupprimeChange(async (message) => {
    ChatUiShared.oublierEtatActionMessage(message?.messageId);
    await appliquerMessageSupprime(message?.messageId);
    await NotifPrefs.chargerNonLus(window.electronAPI);
    renderConversationList();
    await actualiserBadgeSalons({ recharger: false });
    mettreAJourBadgeApplication();
  });

  ChatUiShared.afficherRailDepuisCache({
    conteneur: document.getElementById('server-rail'),
    avant: document.getElementById('open-create-channel-rail'),
    serveurActifId: null,
    nonLus: new Map(),
    libelleVoirPlus: t('servers.showMoreRail'),
    surChoix: (serveur) => {
      ecrireStockage(localStorage, CLEF_SERVEUR_ACTIF, serveur.id);
      window.electronAPI.navigate('index.html');
    },
  });
  try {
    await initialiserUtilisateurCourant();
    await chargerEtatReseauEtPresences();
    await NotifPrefs.chargerNonLus(window.electronAPI);
    await refreshConversations();
  } finally {
    ThemeManager.pagePrete?.();
  }
  await actualiserBadgeSalons();

  if (window.Inactivite?.initialiserPageInactivite) {
    void window.Inactivite.initialiserPageInactivite();
  }
});

document.getElementById('home-btn')?.addEventListener('click', () => {
  window.electronAPI.navigate('index.html');
});
document
  .getElementById('open-create-channel-rail')
  ?.addEventListener('click', async () => {
    await window.electronAPI.definirCibleNavigation({ type: 'ajout-serveur' });
    window.electronAPI.navigate('index.html');
  });
