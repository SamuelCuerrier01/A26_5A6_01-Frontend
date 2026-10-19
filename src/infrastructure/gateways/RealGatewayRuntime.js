'use strict';

const { io } = require('socket.io-client');
const {
  CHEMINS_SANS_SESSION,
  DELAI_RECONNEXION_INITIAL_MS,
  creerDmId,
} = require('./runtime/constantes');
const {
  chargerSessionPersiste,
  sauvegarderSessionPersiste,
} = require('./runtime/jeton');
const { obtenirConfiguration } = require('../config/ConfigurationApi.js');

class RealGatewayRuntime {
  constructor(config = obtenirConfiguration(), options = {}) {
    this.baseUrlHttp = config.baseUrlHttp;
    this.baseUrlSocket = config.baseUrlSocket;

    this.jeton = null;
    this.refreshToken = null;
    this.renouvellementEnCours = null;
    this.utilisateurConnecte = null;
    this.etatConnexion = {
      statut: 'deconnecte',
      depuis: Date.now(),
      reconnexions: 0,
    };
    this.reconnexions = 0;
    this.ecouteurs = new Map();
    this.socket = null;
    this.fermetureVoulue = false;
    this.delaiReconnexionActuelMs = DELAI_RECONNEXION_INITIAL_MS;
    this.minuteurReconnexion = null;
    this.minuteurBattementCoeur = null;
    this.horsLigneSysteme = false;

    this.etatsSaisie = [];

    this.presences = {};

    this.profilsPublics = new Map();
    this.avatarsARafraichir = false;
    this.dejaConnecte = false;
    this.horsLigneTempsReel = new Map();
    this.enLigneTempsReel = null;

    this.utilisateursConnus = new Map();

    this.indexMessages = new Map();

    this.salonsRejoints = new Set();
    this.roomsSocketRejointes = new Set();
    this.socketPret = false;
    this.minuteurRepliConnexionPrete = null;
    this.verificationSessionEnCours = false;
    this.rotationJetonEnCours = false;

    this.partenairesDmConnus = new Set();

    this.serveurs = new Map();
    this.generationSession = 0;
    this.salonVersServeur = new Map();

    this.minuteurPollPresence = null;

    this.chargerSessionPersiste =
      options.chargerSessionPersiste ?? chargerSessionPersiste;
    this.sauvegarderSessionPersiste =
      options.sauvegarderSessionPersiste ?? sauvegarderSessionPersiste;
    this.creerSocket = options.creerSocket ?? io;
  }

  on(type, ecouteur) {
    const liste = this.ecouteurs.get(type) ?? [];
    liste.push(ecouteur);
    this.ecouteurs.set(type, liste);
    return () => {
      const courants = this.ecouteurs.get(type) ?? [];
      this.ecouteurs.set(
        type,
        courants.filter((item) => item !== ecouteur)
      );
    };
  }

  emettre(type, donnees) {
    for (const ecouteur of this.ecouteurs.get(type) ?? []) {
      ecouteur(donnees);
    }
  }

  async appelHttp(chemin, { methode = 'GET', corps } = {}, reessayer = true) {
    const generation = this.generationSession;
    const jeton = this.jeton;
    let reponse;
    try {
      reponse = await fetch(`${this.baseUrlHttp}${chemin}`, {
        method: methode,
        headers: {
          'Content-Type': 'application/json',
          ...(this.jeton ? { Authorization: `Bearer ${this.jeton}` } : {}),
        },
        body: corps !== undefined ? JSON.stringify(corps) : undefined,
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new Error('ERR_RESEAU_INDISPONIBLE');
    }
    if (generation !== this.generationSession)
      throw new Error('ERR_SESSION_FERMEE');
    if (
      reponse.status === 401 &&
      jeton &&
      this.refreshToken &&
      !this.rotationJetonEnCours &&
      reessayer &&
      !CHEMINS_SANS_SESSION.includes(chemin)
    ) {
      if (this.jeton === jeton) await this.renouvelerSession();
      return this.appelHttp(chemin, { methode, corps }, false);
    }
    if (!reponse.ok) {
      if (
        reponse.status === 401 &&
        this.utilisateurConnecte &&
        !CHEMINS_SANS_SESSION.includes(chemin)
      ) {
        void this.verifierSessionApres401();
      }
      const corpsErreur = await reponse.json().catch(() => null);
      const erreur = new Error(`ERR_HTTP_${reponse.status}`);
      erreur.statut = reponse.status;
      erreur.detail = corpsErreur?.erreur;
      throw erreur;
    }
    if (reponse.status === 204) return undefined;
    const resultat = await reponse.json();
    if (generation !== this.generationSession)
      throw new Error('ERR_SESSION_FERMEE');
    return resultat;
  }

  definirEtatConnexion(statut, { cause, prochaineTentative } = {}) {
    this.etatConnexion = {
      statut,
      depuis:
        this.etatConnexion?.statut === statut
          ? this.etatConnexion.depuis
          : Date.now(),
      reconnexions: this.reconnexions,
      cause: statut === 'connecte' ? undefined : cause,
      prochaineTentative,
    };
    this.emettre('etat-connexion', this.etatConnexion);
    return { ...this.etatConnexion };
  }

  obtenirEtatConnexion() {
    return { ...this.etatConnexion };
  }

  verifierReseauConnecte() {
    if (this.etatConnexion.statut !== 'connecte') {
      throw new Error('ERR_RESEAU_NON_CONNECTE');
    }
  }
}

Object.assign(
  RealGatewayRuntime.prototype,
  require('./runtime/utilisateurs'),
  require('./runtime/session'),
  require('./runtime/configuration'),
  require('./runtime/temps-reel'),
  require('./runtime/serveurs'),
  require('./runtime/messages'),
  require('./runtime/presence'),
  require('./runtime/reseau')
);

module.exports = {
  RealGatewayRuntime,
  creerDmId,
  chargerSessionPersiste,
  sauvegarderSessionPersiste,
};
