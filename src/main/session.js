const { etat, MODE_NOTIFICATION_PAR_DEFAUT } = require('./contexte');
const { chatGateway } = require('./gateway');
const { exposerCanal } = require('./securite');
const { afficherPageConnexion } = require('./fenetre');
const {
  apresOuvertureSession,
  apresOuvertureSessionAvecLangueChoisie,
} = require('./preferences');

const MOTIFS_VALIDES_RETOUR_CONNEXION = ['session-expiree', 'session-inactive'];

exposerCanal('session:authentifier', ({ identifiant, motDePasse }) =>
  chatGateway
    .authentifier({ identifiant, motDePasse })
    .then(
      apresOuvertureSessionAvecLangueChoisie(etat.langueChoisieAvantConnexion)
    )
);
exposerCanal('session:inscription', ({ courriel, motDePasse, pseudo }) =>
  chatGateway
    .inscrire({ courriel, motDePasse, pseudo })
    .then(
      apresOuvertureSessionAvecLangueChoisie(etat.langueChoisieAvantConnexion)
    )
);
exposerCanal('session:restaurer', () =>
  chatGateway.restaurerSession().then(apresOuvertureSession)
);
function oublierPreferencesDuCompte() {
  etat.modeNotificationActuel = MODE_NOTIFICATION_PAR_DEFAUT;
  etat.aliasActuel = null;
  etat.avatarActuel = null;
}

exposerCanal('session:definir-motif-retour', ({ motif }) => {
  if (
    typeof motif === 'string' &&
    MOTIFS_VALIDES_RETOUR_CONNEXION.includes(motif)
  ) {
    etat.motifRetourConnexion = motif;
    return motif;
  }
  return null;
});

exposerCanal('session:deconnexion', async () => {
  await chatGateway.deconnexion();
  oublierPreferencesDuCompte();
  etat.cibleNavigation = null;
});

exposerCanal('session:deconnexion-partout', async () => {
  await chatGateway.deconnexionPartout();
  oublierPreferencesDuCompte();
  etat.cibleNavigation = null;
});

exposerCanal('session:deconnexion-autres', () =>
  chatGateway.deconnexionAutres()
);

exposerCanal('navigation:motif-retour-connexion', () => {
  const motif = etat.motifRetourConnexion;
  etat.motifRetourConnexion = null;
  return motif;
});

exposerCanal('session:utilisateur-connecte', () =>
  chatGateway.obtenirUtilisateurConnecte()
);

chatGateway.on('session-expiree', () => {
  oublierPreferencesDuCompte();
  etat.cibleNavigation = null;
  etat.motifRetourConnexion = 'session-expiree';
  afficherPageConnexion();
});

chatGateway.on('etat-connexion', (etatConnexion) => {
  if (etat.mainWindow && !etat.mainWindow.isDestroyed()) {
    etat.mainWindow.webContents.send('reseau:etat-change', etatConnexion);
  }
});
chatGateway.on('profils-publics', (ids) => {
  if (etat.mainWindow && !etat.mainWindow.isDestroyed()) {
    etat.mainWindow.webContents.send('utilisateurs:profils-change', ids);
  }
});
chatGateway.on('serveur-change', (evenement) => {
  if (etat.mainWindow && !etat.mainWindow.isDestroyed()) {
    etat.mainWindow.webContents.send('serveurs:change', evenement);
  }
});

chatGateway.on('presence', (presence) => {
  if (etat.mainWindow && !etat.mainWindow.isDestroyed()) {
    etat.mainWindow.webContents.send('presence:change', presence);
  }
});

chatGateway.on('message-modifie', (message) => {
  if (etat.mainWindow && !etat.mainWindow.isDestroyed()) {
    etat.mainWindow.webContents.send('messages:modifie-change', message);
  }
});

chatGateway.on('message-supprime', (message) => {
  if (etat.mainWindow && !etat.mainWindow.isDestroyed()) {
    etat.mainWindow.webContents.send('messages:supprime-change', message);
  }
});
chatGateway.on('message-recu', (payload) => {
  if (etat.mainWindow && !etat.mainWindow.isDestroyed()) {
    etat.mainWindow.webContents.send('messages:nouveau', payload);
  }
});

chatGateway.on('lecture', (lecture) => {
  if (etat.mainWindow && !etat.mainWindow.isDestroyed()) {
    etat.mainWindow.webContents.send('messages:lecture-change', lecture);
  }
});

chatGateway.on('synchronisation-requise', () => {
  if (etat.mainWindow && !etat.mainWindow.isDestroyed()) {
    etat.mainWindow.webContents.send('reseau:synchronisation-requise');
  }
});
