const { Menu } = require('electron');
const { LANGUE_PAR_DEFAUT, LANGUES_SUPPORTEES } = require('../i18n/i18n.js');
const translations = require('../i18n/translations.json');
const {
  etat,
  THEME_PAR_DEFAUT,
  THEMES_SUPPORTEES,
  MODES_NOTIFICATION,
} = require('./contexte');
const { chatGateway } = require('./gateway');
const { exposerCanal } = require('./securite');
const { buildMenu } = require('./menu');
const { couleurFondFenetre } = require('./fenetre');

function preferencesCourantes() {
  return {
    theme: etat.themeActuel,
    langue: etat.langueActuelle,
    modeNotification: etat.modeNotificationActuel,
    alias: etat.aliasActuel,
    avatar: etat.avatarActuel,
  };
}

function diffuserPreferences() {
  if (etat.mainWindow && !etat.mainWindow.isDestroyed()) {
    etat.mainWindow.webContents.send(
      'preferences:change',
      preferencesCourantes()
    );
  }
}

function appliquerPreferencesLocales(donnees) {
  if (THEMES_SUPPORTEES.includes(donnees.theme)) {
    etat.themeActuel = donnees.theme;
    if (etat.mainWindow && !etat.mainWindow.isDestroyed()) {
      etat.mainWindow.setBackgroundColor(couleurFondFenetre());
    }
  }
  if (
    LANGUES_SUPPORTEES.includes(donnees.langue) &&
    donnees.langue !== etat.langueActuelle
  ) {
    etat.langueActuelle = donnees.langue;
    Menu.setApplicationMenu(buildMenu());
  }
  if (MODES_NOTIFICATION.includes(donnees.modeNotification)) {
    etat.modeNotificationActuel = donnees.modeNotification;
  }
  if ('alias' in donnees) etat.aliasActuel = donnees.alias || null;
  if ('avatar' in donnees) etat.avatarActuel = donnees.avatar || null;
  diffuserPreferences();
  return preferencesCourantes();
}

async function synchroniserPreferencesDepuisServeur() {
  try {
    appliquerPreferencesLocales(await chatGateway.configObtenir());
  } catch (erreur) {
    console.error(
      '[preferences] chargement depuis le serveur impossible :',
      erreur
    );
  }
}

async function apresOuvertureSession(resultat) {
  if (resultat) {
    chatGateway.chargerServeurs().catch((erreur) => {
      console.error('[serveurs] inscription au serveur par défaut :', erreur);
    });
    await synchroniserPreferencesDepuisServeur();
  }
  return resultat;
}

function apresOuvertureSessionAvecLangueChoisie(langue) {
  return async (resultat) => {
    await apresOuvertureSession(resultat);
    if (resultat) etat.langueChoisieAvantConnexion = null;
    if (resultat && LANGUES_SUPPORTEES.includes(langue)) {
      try {
        await enregistrerPreferences({ langue });
      } catch (erreur) {
        appliquerPreferencesLocales({ langue });
        console.error('[preferences] enregistrement de la langue :', erreur);
      }
    }
    return resultat;
  };
}

async function enregistrerPreferences(donnees) {
  if (!chatGateway.obtenirUtilisateurConnecte()) {
    return appliquerPreferencesLocales(donnees);
  }
  return appliquerPreferencesLocales(await chatGateway.configModifier(donnees));
}

function persisterPreferenceEnArrierePlan(donnees) {
  if (!chatGateway.obtenirUtilisateurConnecte()) return;
  chatGateway.configModifier(donnees).catch((erreur) => {
    console.error('[preferences] enregistrement impossible :', erreur);
  });
}

chatGateway.on('profil-soi', (config) => {
  appliquerPreferencesLocales({ alias: config.alias, avatar: config.avatar });
});
exposerCanal('config:obtenir', () => chatGateway.configObtenir());
exposerCanal('config:modifier', async (donnees) => {
  const config = await chatGateway.configModifier(donnees);
  appliquerPreferencesLocales(config);
  return config;
});
exposerCanal('preferences:obtenir', () => preferencesCourantes());
exposerCanal('preferences:modifier', (donnees) =>
  enregistrerPreferences(donnees)
);

exposerCanal('langue:obtenir', () => etat.langueActuelle);
exposerCanal('langue:definir', ({ langue }) => {
  if (LANGUES_SUPPORTEES.includes(langue)) {
    if (!chatGateway.obtenirUtilisateurConnecte()) {
      etat.langueChoisieAvantConnexion = langue;
    }
    appliquerPreferencesLocales({ langue });
    persisterPreferenceEnArrierePlan({ langue });
  }
  return etat.langueActuelle;
});
exposerCanal('i18n:dictionnaires', () => translations);
exposerCanal('i18n:langue-par-defaut', () => LANGUE_PAR_DEFAUT);

exposerCanal('theme:obtenir', () => etat.themeActuel);
exposerCanal('theme:definir', ({ theme }) => {
  if (THEMES_SUPPORTEES.includes(theme)) {
    appliquerPreferencesLocales({ theme });
    persisterPreferenceEnArrierePlan({ theme });
  }
  return etat.themeActuel;
});
exposerCanal('theme:par-defaut', () => THEME_PAR_DEFAUT);

module.exports = {
  preferencesCourantes,
  appliquerPreferencesLocales,
  apresOuvertureSession,
  apresOuvertureSessionAvecLangueChoisie,
};
