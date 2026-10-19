'use strict';

(function (global) {
  let dictionnaires = null;
  let langueActuelle = 'fr';
  let langueParDefaut = 'fr';

  function t(cle, params) {
    const dictionnaire =
      (dictionnaires && dictionnaires[langueActuelle]) ||
      (dictionnaires && dictionnaires[langueParDefaut]) ||
      {};
    const brut = cle
      .split('.')
      .reduce(
        (acc, partie) =>
          acc && typeof acc === 'object' ? acc[partie] : undefined,
        dictionnaire
      );
    let texte = typeof brut === 'string' ? brut : cle;
    if (params) {
      for (const cleParam of Object.keys(params)) {
        texte = texte.split(`{${cleParam}}`).join(String(params[cleParam]));
      }
    }
    return texte;
  }

  function appliquerTraductionsStatiques() {
    global.document.documentElement.lang = langueActuelle;
    global.document.documentElement.classList.remove('i18n-en-attente');
    global.document.querySelectorAll('[data-i18n]').forEach((element) => {
      element.textContent = t(element.dataset.i18n);
    });
    global.document.querySelectorAll('[data-i18n-title]').forEach((element) => {
      element.setAttribute('title', t(element.dataset.i18nTitle));
    });
    global.document
      .querySelectorAll('[data-i18n-aria-label]')
      .forEach((element) => {
        element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel));
      });
    global.document
      .querySelectorAll('[data-i18n-placeholder]')
      .forEach((element) => {
        element.setAttribute('placeholder', t(element.dataset.i18nPlaceholder));
      });
  }

  function messageErreur(erreur) {
    const brutAvecPrefixe =
      erreur instanceof Error ? erreur.message : String(erreur);
    const brut = brutAvecPrefixe.replace(
      /^Error invoking remote method '[^']+': (?:Error: )?/,
      ''
    );

    const [code, ...params] = brut.split('|');
    const cle = `errors.${code}`;
    const brutTraduit = t(cle);

    if (brutTraduit === cle) {
      return brut;
    }
    if (!params.length) return brutTraduit;
    const nomParametre = brutTraduit.match(/\{(\w+)\}/)?.[1];
    return nomParametre ? t(cle, { [nomParametre]: params[0] }) : brutTraduit;
  }

  async function initialiserDepuisElectronAPI(electronAPI) {
    const [resultatDictionnaires, resultatLangue, resultatLangueParDefaut] =
      await Promise.allSettled([
        electronAPI.obtenirDictionnairesI18n(),
        electronAPI.obtenirLangue(),
        electronAPI.obtenirLangueParDefaut(),
      ]);

    if (resultatDictionnaires.status === 'fulfilled') {
      dictionnaires = resultatDictionnaires.value;
    }

    if (resultatLangueParDefaut.status === 'fulfilled') {
      langueParDefaut = resultatLangueParDefaut.value;
    }

    if (resultatLangue.status === 'fulfilled') {
      langueActuelle = resultatLangue.value;
    } else {
      langueActuelle = langueParDefaut;
    }
    return langueActuelle;
  }

  function obtenirLangue() {
    return langueActuelle;
  }

  function definirLangueActuelle(langue) {
    langueActuelle = langue;
  }

  global.I18n = {
    t,
    appliquerTraductionsStatiques,
    messageErreur,
    initialiserDepuisElectronAPI,
    obtenirLangue,
    definirLangueActuelle,
  };
})(window);
