'use strict';

const { NOM_FICHIER_SESSION } = require('./constantes');
const path = require('path');
const fs = require('fs');

function cheminFichierSession() {
  const { app } = require('electron');
  return path.join(app.getPath('userData'), NOM_FICHIER_SESSION);
}

function coffreJeton() {
  const { safeStorage } = require('electron');
  if (!safeStorage?.isEncryptionAvailable?.()) return null;
  if (safeStorage.getSelectedStorageBackend?.() === 'basic_text') return null;
  return safeStorage;
}

function chargerJetonPersiste() {
  try {
    const contenu = fs.readFileSync(cheminFichierSession(), 'utf8');
    const donnees = JSON.parse(contenu);
    if (typeof donnees.jetonChiffre === 'string' && donnees.jetonChiffre) {
      const coffre = coffreJeton();
      if (!coffre) return null;
      const jeton = coffre.decryptString(
        Buffer.from(donnees.jetonChiffre, 'base64')
      );
      return jeton || null;
    }
    if (typeof donnees.jeton === 'string' && donnees.jeton) {
      if (!coffreJeton()) {
        sauvegarderJetonPersiste(null);
        return null;
      }
      sauvegarderJetonPersiste(donnees.jeton);
      return donnees.jeton;
    }
    return null;
  } catch {
    return null;
  }
}

function sauvegarderJetonPersiste(jeton) {
  try {
    if (jeton) {
      const coffre = coffreJeton();
      if (!coffre) {
        fs.rmSync(cheminFichierSession(), { force: true });
        return;
      }
      const donnees = { jetonChiffre: coffre.encryptString(jeton).toString('base64') };
      const chemin = cheminFichierSession();
      fs.writeFileSync(chemin, JSON.stringify(donnees), {
        encoding: 'utf8',
        mode: 0o600,
      });
      fs.chmodSync(chemin, 0o600);
    } else {
      fs.rmSync(cheminFichierSession(), { force: true });
    }
  } catch (erreur) {
    console.error(
      '[RealGatewayRuntime] persistance de session impossible :',
      erreur
    );
  }
}

module.exports = {
  chargerJetonPersiste,
  cheminFichierSession,
  coffreJeton,
  sauvegarderJetonPersiste,
};
