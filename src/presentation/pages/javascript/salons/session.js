el.formulaire.addEventListener('submit', async (event) => {
  event.preventDefault();
  const contenu = el.message.value.trim();
  if (!salonActifId || !contenu) return;

  const auteurId = utilisateurActuelId;
  const salonId = salonActifId;
  el.message.value = '';

  if (etatReseau.statut !== 'connecte') {
    ajouterMessageEnAttenteSalon(
      salonId,
      ChatUiShared.creerMessageEnAttente({
        conversationId: salonId,
        auteurId,
        contenu,
      })
    );
    afficherMessages({ conserverPositionScroll: true });
    return;
  }

  if (timersArretSaisie[auteurId]) {
    clearTimeout(timersArretSaisie[auteurId]);
    delete timersArretSaisie[auteurId];
  }

  await window.electronAPI.modifierEtatSaisie({
    conversationId: salonId,
    utilisateurId: auteurId,
    est_saisie: false,
  });

  let envoye;
  try {
    envoye = await window.electronAPI.envoyerMessageSalon({
      salonId,
      utilisateurId: auteurId,
      contenu,
    });
  } catch (erreur) {
    ajouterMessageEnAttenteSalon(
      salonId,
      ChatUiShared.creerMessageEnAttente({
        conversationId: salonId,
        auteurId,
        contenu,
      })
    );
    afficherMessages({ conserverPositionScroll: true });
    notifier(messageErreur(erreur), true);
    return;
  }
  try {
    await integrerMessageSalonRecu({ salonId, message: envoye });
  } catch (erreur) {
    notifier(messageErreur(erreur), true);
  }
});

el.profil?.addEventListener('click', () => {
  window.electronAPI.navigate('profil.html');
});

el.logout?.addEventListener('click', async () => {
  ChatUiShared.oublierRailEnCache();
  try {
    await window.electronAPI.deconnexionSession();
  } catch (erreur) {
    console.error('[logout] échec de deconnexionSession :', erreur);
  }
  await window.electronAPI.allerALaConnexion();
});

async function initialiserUtilisateurCourant() {
  utilisateurActuel = await window.electronAPI.obtenirUtilisateurConnecte();
  utilisateurActuelId = utilisateurActuel?.id ?? '';
}

function appliquerPreferences(nouvelles) {
  if (!nouvelles) return;
  preferences = nouvelles;
  ThemeManager.appliquerTheme(nouvelles.theme);
  if (nouvelles.langue) I18n.definirLangueActuelle(nouvelles.langue);
  NotifPrefs.definirMode(utilisateurActuelId, nouvelles.modeNotification);
}

async function initialiser() {
  await I18n.initialiserDepuisElectronAPI(window.electronAPI);
  appliquerTraductionsStatiques();

  await ThemeManager.initialiserDepuisElectronAPI(window.electronAPI);

  try {
    await initialiserUtilisateurCourant();
    appliquerPreferences(await window.electronAPI.obtenirPreferences());
    await chargerEtatReseauEtPresences();
    if (typeof serviceNotifications?.isWindowFocused === 'function') {
      fenetreEstFocusee = Boolean(await serviceNotifications.isWindowFocused());
    }
    const cible = await window.electronAPI.prendreCibleNavigation([
      'salon',
      'ajout-serveur',
    ]);
    if (cible?.type === 'salon' && cible.id) salonActifId = cible.id;
    await NotifPrefs.chargerNonLus(window.electronAPI);
    await actualiser();
    if (cible?.type === 'ajout-serveur') el.creerRail.click();
  } catch (erreur) {
    notifier(messageErreur(erreur), true);
  } finally {
    ThemeManager.pagePrete?.();
  }
}

