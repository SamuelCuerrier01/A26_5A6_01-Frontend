const { contextBridge, ipcRenderer } = require('electron');

const SVG_NS = 'http://www.w3.org/2000/svg';
const ICONES_FENETRE = {
  reduire: 'M2 6h8',
  agrandir: 'M2.5 2.5h7v7h-7z',
  restaurer: 'M4 2h6v6M2 4h6v6H2z',
  fermer: 'M2.5 2.5l7 7M9.5 2.5l-7 7',
};

function creerIconeFenetre(nom) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 12 12');
  svg.setAttribute('aria-hidden', 'true');
  const trace = document.createElementNS(SVG_NS, 'path');
  trace.setAttribute('d', ICONES_FENETRE[nom]);
  svg.appendChild(trace);
  return svg;
}

const LIBELLES_FENETRE_PAR_DEFAUT = {
  reduire: 'Réduire',
  agrandir: 'Agrandir',
  restaurer: 'Restaurer',
  fermer: 'Fermer',
};
const CLES_LIBELLES_FENETRE = {
  reduire: 'minimize',
  agrandir: 'maximize',
  restaurer: 'restore',
  fermer: 'close',
};

async function traduireLibellesFenetre() {
  try {
    const [dictionnaires, langue] = await Promise.all([
      ipcRenderer.invoke('i18n:dictionnaires'),
      ipcRenderer.invoke('langue:obtenir'),
    ]);
    const traductions = dictionnaires?.[langue]?.titlebar ?? {};
    return Object.fromEntries(
      Object.entries(CLES_LIBELLES_FENETRE).map(([nom, cle]) => [
        nom,
        traductions[cle] ?? LIBELLES_FENETRE_PAR_DEFAUT[nom],
      ])
    );
  } catch {
    return LIBELLES_FENETRE_PAR_DEFAUT;
  }
}

function definirLibelle(bouton, libelle) {
  bouton.setAttribute('aria-label', libelle);
  bouton.title = libelle;
}

function creerBoutonFenetre(nom, libelle, canal) {
  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.className = `app-titlebar-btn app-titlebar-btn--${nom}`;
  definirLibelle(bouton, libelle);
  bouton.appendChild(creerIconeFenetre(nom));
  bouton.addEventListener('click', () => ipcRenderer.invoke(canal));
  return bouton;
}

window.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('.app-titlebar')) return;
  const barre = document.createElement('div');
  barre.className = 'app-titlebar';
  const titre = document.createElement('span');
  titre.className = 'app-titlebar-title';
  titre.textContent = 'ChatVardage';
  barre.appendChild(titre);

  if (process.platform === 'darwin') {
    document.documentElement.classList.add('platform-darwin');
  } else {
    const boutons = document.createElement('div');
    boutons.className = 'app-titlebar-controls';
    let libelles = LIBELLES_FENETRE_PAR_DEFAUT;
    let maximiseeCourante = false;
    const reduire = creerBoutonFenetre(
      'reduire',
      libelles.reduire,
      'fenetre:reduire'
    );
    const agrandir = creerBoutonFenetre(
      'agrandir',
      libelles.agrandir,
      'fenetre:agrandir'
    );
    const fermer = creerBoutonFenetre(
      'fermer',
      libelles.fermer,
      'fenetre:fermer'
    );
    const afficherMaximisee = (maximisee) => {
      maximiseeCourante = maximisee;
      const etatBouton = maximisee ? 'restaurer' : 'agrandir';
      agrandir.replaceChildren(creerIconeFenetre(etatBouton));
      definirLibelle(agrandir, libelles[etatBouton]);
    };
    traduireLibellesFenetre().then((traduits) => {
      libelles = traduits;
      definirLibelle(reduire, libelles.reduire);
      definirLibelle(fermer, libelles.fermer);
      afficherMaximisee(maximiseeCourante);
    });
    ipcRenderer.on('fenetre:maximisee', (_event, maximisee) =>
      afficherMaximisee(maximisee)
    );
    ipcRenderer
      .invoke('fenetre:est-maximisee')
      .then(afficherMaximisee)
      .catch(() => {});
    boutons.append(reduire, agrandir, fermer);
    barre.appendChild(boutons);
    barre.addEventListener('dblclick', (event) => {
      if (!event.target.closest('.app-titlebar-controls')) {
        ipcRenderer.invoke('fenetre:agrandir');
      }
    });
  }

  document.body.prepend(barre);
});

contextBridge.exposeInMainWorld('notifications', {
  setActiveConversation: (conversationId) =>
    ipcRenderer.invoke('notification:set-active-conversation', conversationId),
  messageReceived: (message) =>
    ipcRenderer.invoke('notification:message-received', message),
  setBadgeCount: (count, iconDataUrl) =>
    ipcRenderer.invoke('notifications:set-badge-count', { count, iconDataUrl }),
  isWindowFocused: () => ipcRenderer.invoke('window:is-focused'),
  onFocusChange: (callback) => {
    const ecouteur = (_event, focused) => callback(focused);
    ipcRenderer.on('window:focus-changed', ecouteur);
    return () => ipcRenderer.removeListener('window:focus-changed', ecouteur);
  },
  onNotificationRepli: (callback) => {
    const ecouteur = (_event, message) => callback(message);
    ipcRenderer.on('notifications:repli', ecouteur);
    return () => ipcRenderer.removeListener('notifications:repli', ecouteur);
  },
  onNavigateToConversation: (callback) => {
    const ecouteur = (_event, cible) => callback(cible);
    ipcRenderer.on('notifications:naviguer-vers-conversation', ecouteur);
    return () =>
      ipcRenderer.removeListener(
        'notifications:naviguer-vers-conversation',
        ecouteur
      );
  },
});

contextBridge.exposeInMainWorld('electronAPI', {
  authentifierSession: (identifiant, motDePasse) =>
    ipcRenderer.invoke('session:authentifier', { identifiant, motDePasse }),
  inscriptionSession: (courriel, motDePasse, pseudo) =>
    ipcRenderer.invoke('session:inscription', { courriel, motDePasse, pseudo }),
  restaurerSession: () => ipcRenderer.invoke('session:restaurer'),
  deconnexionSession: () => ipcRenderer.invoke('session:deconnexion'),
  definirMotifRetourConnexion: (motif) =>
    ipcRenderer.invoke('session:definir-motif-retour', { motif }),
  deconnexionPartout: () => ipcRenderer.invoke('session:deconnexion-partout'),
  deconnexionAutres: () => ipcRenderer.invoke('session:deconnexion-autres'),
  obtenirUtilisateurConnecte: () =>
    ipcRenderer.invoke('session:utilisateur-connecte'),

  profilObtenir: () => ipcRenderer.invoke('profil:obtenir'),
  profilModifierPseudo: (pseudo) =>
    ipcRenderer.invoke('profil:modifier-pseudo', { pseudo }),
  profilModifierCompte: (donnees) =>
    ipcRenderer.invoke('profil:modifier-compte', donnees),
  profilSupprimerCompte: (motDePasseActuel) =>
    ipcRenderer.invoke('profil:supprimer-compte', { motDePasseActuel }),

  configObtenir: () => ipcRenderer.invoke('config:obtenir'),
  configModifier: (donnees) => ipcRenderer.invoke('config:modifier', donnees),

  obtenirPreferences: () => ipcRenderer.invoke('preferences:obtenir'),
  modifierPreferences: (donnees) =>
    ipcRenderer.invoke('preferences:modifier', donnees),
  onPreferencesChange: (rappel) => {
    const ecouteur = (_event, preferences) => rappel(preferences);
    ipcRenderer.on('preferences:change', ecouteur);
    return () => ipcRenderer.removeListener('preferences:change', ecouteur);
  },

  obtenirEtatReseau: () => ipcRenderer.invoke('reseau:etat'),
  reessayerConnexion: () => ipcRenderer.invoke('reseau:reessayer'),
  obtenirPresences: () => ipcRenderer.invoke('presence:obtenir'),
  modifierPresence: (statut) =>
    ipcRenderer.invoke('presence:modifier', { statut }),
  onSynchronisationRequise: (rappel) => {
    const ecouteur = () => rappel();
    ipcRenderer.on('reseau:synchronisation-requise', ecouteur);
    return () =>
      ipcRenderer.removeListener('reseau:synchronisation-requise', ecouteur);
  },
  onEtatReseauChange: (rappel) => {
    const ecouteur = (_event, etat) => rappel(etat);
    ipcRenderer.on('reseau:etat-change', ecouteur);
    return () => ipcRenderer.removeListener('reseau:etat-change', ecouteur);
  },
  onProfilsPublicsChange: (rappel) => {
    const ecouteur = (_event, ids) => rappel(ids);
    ipcRenderer.on('utilisateurs:profils-change', ecouteur);
    return () =>
      ipcRenderer.removeListener('utilisateurs:profils-change', ecouteur);
  },
  onServeurChange: (rappel) => {
    const ecouteur = (_event, evenement) => rappel(evenement);
    ipcRenderer.on('serveurs:change', ecouteur);
    return () => ipcRenderer.removeListener('serveurs:change', ecouteur);
  },
  onPresenceChange: (rappel) => {
    const ecouteur = (_event, presence) => rappel(presence);
    ipcRenderer.on('presence:change', ecouteur);
    return () => ipcRenderer.removeListener('presence:change', ecouteur);
  },
  onLectureChange: (rappel) => {
    const ecouteur = (_event, lecture) => rappel(lecture);
    ipcRenderer.on('messages:lecture-change', ecouteur);
    return () =>
      ipcRenderer.removeListener('messages:lecture-change', ecouteur);
  },
  onMessageModifieChange: (rappel) => {
    const ecouteur = (_event, message) => rappel(message);
    ipcRenderer.on('messages:modifie-change', ecouteur);
    return () =>
      ipcRenderer.removeListener('messages:modifie-change', ecouteur);
  },
  onMessageSupprimeChange: (rappel) => {
    const ecouteur = (_event, message) => rappel(message);
    ipcRenderer.on('messages:supprime-change', ecouteur);
    return () =>
      ipcRenderer.removeListener('messages:supprime-change', ecouteur);
  },
  onNouveauMessage: (rappel) => {
    const ecouteur = (_event, payload) => rappel(payload);
    ipcRenderer.on('messages:nouveau', ecouteur);
    return () => ipcRenderer.removeListener('messages:nouveau', ecouteur);
  },
  allerAuTableauDeBord: () => ipcRenderer.invoke('navigation:tableau-de-bord'),
  allerALaConnexion: () => ipcRenderer.invoke('navigation:connexion'),
  obtenirMotifRetourConnexion: () =>
    ipcRenderer.invoke('navigation:motif-retour-connexion'),

  obtenirLangue: () => ipcRenderer.invoke('langue:obtenir'),
  definirLangue: (langue) => ipcRenderer.invoke('langue:definir', { langue }),
  obtenirDictionnairesI18n: () => ipcRenderer.invoke('i18n:dictionnaires'),
  obtenirLangueParDefaut: () => ipcRenderer.invoke('i18n:langue-par-defaut'),

  obtenirTheme: () => ipcRenderer.invoke('theme:obtenir'),
  definirTheme: (theme) => ipcRenderer.invoke('theme:definir', { theme }),
  obtenirThemeParDefaut: () => ipcRenderer.invoke('theme:par-defaut'),

  obtenirEtatSalons: ({ serveurId, salonId } = {}) =>
    ipcRenderer.invoke('salons:etat', { serveurId, salonId }),
  obtenirMessagesSalonAvant: (donnees) =>
    ipcRenderer.invoke('salons:messages-avant', donnees),

  obtenirServeurs: () => ipcRenderer.invoke('serveurs:lister'),
  creerServeur: (donnees) => ipcRenderer.invoke('serveurs:creer', donnees),
  modifierServeur: (donnees) =>
    ipcRenderer.invoke('serveurs:modifier', donnees),
  supprimerServeur: (serveurId) =>
    ipcRenderer.invoke('serveurs:supprimer', { serveurId }),
  rejoindreServeur: (serveurId) =>
    ipcRenderer.invoke('serveurs:rejoindre', { serveurId }),
  quitterServeur: (serveurId) =>
    ipcRenderer.invoke('serveurs:quitter', { serveurId }),
  decouvrirServeurs: ({ texte, decalage }) =>
    ipcRenderer.invoke('serveurs:decouvrir', { texte, decalage }),
  expulserMembre: (donnees) => ipcRenderer.invoke('serveurs:expulser', donnees),
  changerRoleMembre: (donnees) =>
    ipcRenderer.invoke('serveurs:changer-role', donnees),
  inviterAuServeur: (donnees) =>
    ipcRenderer.invoke('serveurs:inviter', donnees),
  obtenirMembresServeur: (donnees) =>
    ipcRenderer.invoke('serveurs:membres', donnees),
  membresParmi: (donnees) =>
    ipcRenderer.invoke('serveurs:membres-parmi', donnees),
  accepterInvitation: (donnees) =>
    ipcRenderer.invoke('serveurs:accepter-invitation', donnees),
  refuserInvitation: (donnees) =>
    ipcRenderer.invoke('serveurs:refuser-invitation', donnees),

  creerSalon: (donnees) => ipcRenderer.invoke('salons:creer', donnees),
  modifierSalon: (donnees) => ipcRenderer.invoke('salons:modifier', donnees),
  supprimerSalon: (salonId) =>
    ipcRenderer.invoke('salons:supprimer', { salonId }),
  envoyerMessageSalon: (donnees) =>
    ipcRenderer.invoke('salons:envoyer-message', donnees),
  modifierMessage: (donnees) =>
    ipcRenderer.invoke('messages:modifier', donnees),
  supprimerMessage: (donnees) =>
    ipcRenderer.invoke('messages:supprimer', donnees),
  navigate: (page) => ipcRenderer.invoke('navigate', page),
  definirCibleNavigation: (cible) =>
    ipcRenderer.invoke('navigation:definir-cible', cible),
  prendreCibleNavigation: (types) =>
    ipcRenderer.invoke('navigation:prendre-cible', { types }),
  obtenirUtilisateurs: () => ipcRenderer.invoke('utilisateurs:lister'),
  obtenirSuggestionsDm: () => ipcRenderer.invoke('utilisateurs:suggestions-dm'),
  rechercherUtilisateurs: (texte) =>
    ipcRenderer.invoke('utilisateurs:rechercher', { texte }),
  obtenirConversationsPrivees: (utilisateurId) =>
    ipcRenderer.invoke('obtenir-conversations-privees', { utilisateurId }),
  obtenirMessagesPriveesAvant: (donnees) =>
    ipcRenderer.invoke('obtenir-messages-prive-avant', donnees),
  envoyerMessagePrive: (donnees) =>
    ipcRenderer.invoke('envoyer-message-prive', donnees),
  obtenirNonLus: () => ipcRenderer.invoke('messages:non-lus'),
  marquerConversationLue: (donnees) =>
    ipcRenderer.invoke('messages:marquer-lu', donnees),
  obtenirLectures: (donnees) =>
    ipcRenderer.invoke('messages:lectures', donnees),
  rechercherMessages: (donnees) =>
    ipcRenderer.invoke('messages:rechercher', donnees),
  demarrerConversationPrivee: (donnees) =>
    ipcRenderer.invoke('demarrer-conversation-privee', donnees),
  modifierEtatSaisie: (donnees) =>
    ipcRenderer.invoke('modifier-etat-saisie', donnees),
  obtenirEtatsSaisie: (donnees) =>
    ipcRenderer.invoke('obtenir-etats-saisie', donnees),
});
