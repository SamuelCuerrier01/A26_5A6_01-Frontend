'use strict';

const translations = require('./translations.json');

const LANGUE_PAR_DEFAUT = 'fr';
const LANGUES_SUPPORTEES = ['fr', 'en'];

function t(langue, cle, params) {
  const dictionnaire = translations[langue] || translations[LANGUE_PAR_DEFAUT];
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

module.exports = { t, LANGUE_PAR_DEFAUT, LANGUES_SUPPORTEES };
