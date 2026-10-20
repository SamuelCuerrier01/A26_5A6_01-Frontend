async function ouvrirConversationAvec(user) {
  try {
    const conversation = await window.electronAPI.demarrerConversationPrivee({
      utilisateurId: state.currentUserId,
      autreUtilisateurId: user.id,
    });
    dmDialog?.close();
    state.activeConversationId = conversation.id;
    state.currentFilter = 'all';
    filterButtons.forEach((item) => {
      item.classList.toggle('active', item.dataset.filter === 'all');
    });
    await refreshConversations();
  } catch (erreur) {
    notifier(messageErreur(erreur), true);
  }
}

function interlocuteur(utilisateurId) {
  return state.conversations.find((c) => c.otherUser?.id === utilisateurId)
    ?.otherUser;
}

function ouvrirProfilDm(utilisateurId) {
  const autre = interlocuteur(utilisateurId);
  if (!autre) return;
  const active = state.conversations.find(
    (c) => c.id === state.activeConversationId
  );
  ChatUiShared.ouvrirFicheProfil({
    utilisateur: autre,
    enLigne: Boolean(autre.present),
    t,
    utilisateurActuelId: state.currentUserId,
    conversationAvecId: active?.otherUser?.id,
    surMessagePrive: ouvrirConversationAvec,
  });
}

function renderNewDmChoices() {
  if (!dmDialogContent) return;
  dmDialogContent.replaceChildren(
    ...ChatUiShared.creerSelecteurUtilisateurs({
      t,
      messageErreur,
      obtenirSuggestions: () => window.electronAPI.obtenirSuggestionsDm(),
      rechercher: (texte) => window.electronAPI.rechercherUtilisateurs(texte),
      decrireAction: (user) => ({
        libelle: state.conversations.some(
          (conversation) => conversation.otherUser?.id === user.id
        )
          ? t('dm.openExisting')
          : t('dm.newLabel'),
      }),
      surChoix: ouvrirConversationAvec,
      messageAucuneSuggestion: t('dm.noSuggestions'),
    })
  );
}

const timersArretSaisieDm = {};

function brancherFiltres() {
  filterButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      state.currentFilter = button.dataset.filter ?? 'all';
      filterButtons.forEach((item) => {
        item.classList.toggle('active', item === button);
      });

      const visible = getFilteredConversations();
      if (visible.length === 0) {
        state.activeConversationId = null;
      } else if (
        !visible.some(
          (conversation) => conversation.id === state.activeConversationId
        )
      ) {
        state.activeConversationId = visible[0].id;
      }

      await renderActiveConversation();
      renderConversationList();
      mettreAJourBadgeApplication();
    });
  });
}

function brancherFormulaireMessage() {
  if (messageForm && messageInput) {
    messageForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const content = messageInput.value.trim();
      if (!content || !state.activeConversationId) {
        return;
      }

      const auteurId = state.currentUserId;
      const conversationId = state.activeConversationId;
      messageInput.value = '';

      if (etatReseau.statut !== 'connecte') {
        ajouterMessageEnAttenteDm(
          conversationId,
          ChatUiShared.creerMessageEnAttente({
            conversationId,
            auteurId,
            contenu: content,
          })
        );
        await renderActiveConversation({ conserverPositionScroll: true });
        return;
      }

      if (timersArretSaisieDm[auteurId]) {
        clearTimeout(timersArretSaisieDm[auteurId]);
        delete timersArretSaisieDm[auteurId];
      }

      await window.electronAPI.modifierEtatSaisie({
        conversationId,
        utilisateurId: auteurId,
        est_saisie: false,
      });

      let envoye;
      try {
        envoye = await window.electronAPI.envoyerMessagePrive({
          conversationId,
          contenu: content,
          utilisateurId: auteurId,
        });
      } catch (erreur) {
        ajouterMessageEnAttenteDm(
          conversationId,
          ChatUiShared.creerMessageEnAttente({
            conversationId,
            auteurId,
            contenu: content,
          })
        );
        await renderActiveConversation({ conserverPositionScroll: true });
        notifier(messageErreur(erreur), true);
        return;
      }
      try {
        await integrerMessagePrive(envoye);
      } catch (erreur) {
        notifier(messageErreur(erreur), true);
        await renderActiveConversation({ conserverPositionScroll: true });
      }
    });

    messageInput.addEventListener('input', async (event) => {
      if (etatReseau.statut !== 'connecte') return;
      const aDuTexte = event.target.value.trim().length > 0;
      const auteurId = state.currentUserId;
      const conversationId = state.activeConversationId;

      if (!auteurId || !conversationId) return;

      if (timersArretSaisieDm[auteurId]) {
        clearTimeout(timersArretSaisieDm[auteurId]);
        delete timersArretSaisieDm[auteurId];
      }

      if (aDuTexte) {
        await window.electronAPI.modifierEtatSaisie({
          conversationId,
          utilisateurId: auteurId,
          est_saisie: true,
        });

        timersArretSaisieDm[auteurId] = setTimeout(async () => {
          delete timersArretSaisieDm[auteurId];
          if (etatReseau.statut !== 'connecte') return;
          await window.electronAPI.modifierEtatSaisie({
            conversationId,
            utilisateurId: auteurId,
            est_saisie: false,
          });
          await actualiserIndicateurSaisie();
        }, 10000);
      } else {
        await window.electronAPI.modifierEtatSaisie({
          conversationId,
          utilisateurId: auteurId,
          est_saisie: false,
        });
        await actualiserIndicateurSaisie();
      }
    });
  }
}
