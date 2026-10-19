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

function chargerSessionPersiste() {
  try {
    const donnees = JSON.parse(fs.readFileSync(cheminFichierSession(), 'utf8'));
    const coffre = coffreJeton();
    if (!coffre) {
      sauvegarderSessionPersiste(null);
      return null;
    }
    if (
      typeof donnees.sessionChiffree === 'string' &&
      donnees.sessionChiffree
    ) {
      const session = JSON.parse(
        coffre.decryptString(Buffer.from(donnees.sessionChiffree, 'base64'))
      );
      if (
        typeof session?.jeton !== 'string' ||
        !session.jeton ||
        (session.refreshToken !== null &&
          typeof session.refreshToken !== 'string')
      )
        return null;
      return session;
    }
    const jeton =
      typeof donnees.jetonChiffre === 'string' && donnees.jetonChiffre
        ? coffre.decryptString(Buffer.from(donnees.jetonChiffre, 'base64'))
        : donnees.jeton;
    if (typeof jeton !== 'string' || !jeton) return null;
    const session = { jeton, refreshToken: null };
    sauvegarderSessionPersiste(session);
    return session;
  } catch {
    return null;
  }
}

function sauvegarderSessionPersiste(session) {
  try {
    if (session) {
      const coffre = coffreJeton();
      if (!coffre) {
        fs.rmSync(cheminFichierSession(), { force: true });
        return;
      }
      const donnees = {
        sessionChiffree: coffre
          .encryptString(JSON.stringify(session))
          .toString('base64'),
      };
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
  chargerSessionPersiste,
  cheminFichierSession,
  coffreJeton,
  sauvegarderSessionPersiste,
};
