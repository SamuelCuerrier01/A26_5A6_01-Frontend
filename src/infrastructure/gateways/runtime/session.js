'use strict';

const { DELAI_RECONNEXION_INITIAL_MS } = require('./constantes');

module.exports = {
  verifierGenerationSession(generation) {
    if (generation !== this.generationSession)
      throw new Error('ERR_SESSION_FERMEE');
  },
  mapperUtilisateur(brut) {
    return {
      id: brut.id,
      pseudo: brut.pseudo,
      courriel: brut.courriel,
      role: brut.role,
    };
  },

  memoriserJetons({ jeton, refresh_token }) {
    this.jeton = jeton;
    this.refreshToken = refresh_token ?? null;
    this.sauvegarderSessionPersiste({ jeton, refreshToken: this.refreshToken });
  },

  renouvelerSession() {
    if (this.renouvellementEnCours) return this.renouvellementEnCours;
    const generation = this.generationSession;
    const renouvellement = this.appelHttp('/api/auth/refresh', {
      methode: 'POST',
      corps: { refresh_token: this.refreshToken },
    })
      .then((reponse) => {
        if (generation !== this.generationSession)
          throw new Error('ERR_SESSION_FERMEE');
        if (
          typeof reponse?.jeton !== 'string' ||
          !reponse.jeton ||
          typeof reponse.refresh_token !== 'string' ||
          !reponse.refresh_token
        )
          throw new Error('ERR_RECONNEXION_REQUISE');
        this.memoriserJetons(reponse);
        this.connecterSocket();
      })
      .catch(async (erreur) => {
        if (
          generation === this.generationSession &&
          [400, 401, 403].includes(erreur.statut)
        ) {
          await this.deconnexion();
          this.emettre('session-expiree');
        }
        throw erreur;
      })
      .finally(() => {
        if (this.renouvellementEnCours === renouvellement)
          this.renouvellementEnCours = null;
      });
    this.renouvellementEnCours = renouvellement;
    return renouvellement;
  },

  ouvrirSession(reponse) {
    const { utilisateur } = reponse;
    if (
      this.utilisateurConnecte &&
      this.utilisateurConnecte.id !== utilisateur.id
    ) {
      void this.deconnexion();
    }
    this.memoriserJetons(reponse);
    this.utilisateurConnecte = this.mapperUtilisateur(utilisateur);
    this.enregistrerUtilisateurConnu(this.utilisateurConnecte);
    this.fermetureVoulue = false;
    this.annulerReconnexionPlanifiee();
    this.delaiReconnexionActuelMs = DELAI_RECONNEXION_INITIAL_MS;
    this.horsLigneSysteme = false;
    const etatConnexion = this.definirEtatConnexion('connecte');
    this.connecterSocket();
    this.demarrerPollPresence();
    return { utilisateur: this.utilisateurConnecte, etatConnexion };
  },

  async authentifier({ identifiant, motDePasse }) {
    this.generationSession += 1;
    this.renouvellementEnCours = null;
    const generation = this.generationSession;
    const reponse = await this.appelHttp('/api/auth/login', {
      methode: 'POST',
      corps: { identifiant, mot_de_passe: motDePasse },
    });
    this.verifierGenerationSession(generation);
    return this.ouvrirSession(reponse);
  },

  async inscrire({ courriel, motDePasse, pseudo }) {
    this.generationSession += 1;
    this.renouvellementEnCours = null;
    const generation = this.generationSession;
    const TENTATIVES_MAX = 2;
    let pseudoTente = pseudo;
    for (let tentative = 0; tentative < TENTATIVES_MAX; tentative += 1) {
      try {
        const reponse = await this.appelHttp('/api/auth/register', {
          methode: 'POST',
          corps: { pseudo: pseudoTente, courriel, mot_de_passe: motDePasse },
        });
        this.verifierGenerationSession(generation);
        return this.ouvrirSession(reponse);
      } catch (erreur) {
        if (erreur.statut !== 409) throw erreur;
        const suffixe = String(Math.floor(1000 + Math.random() * 9000));
        pseudoTente = `${pseudo}`.slice(0, 20 - suffixe.length) + suffixe;
      }
    }
    const erreur = new Error('ERR_COURRIEL_DEJA_UTILISE');
    erreur.statut = 409;
    throw erreur;
  },

  async restaurerSession() {
    const generation = this.generationSession;
    const session = this.chargerSessionPersiste();
    if (!session) return null;
    this.jeton = session.jeton;
    this.refreshToken = session.refreshToken;
    try {
      const utilisateur = await this.appelHttp('/api/auth/me');
      this.verifierGenerationSession(generation);
      return this.ouvrirSession({
        utilisateur,
        jeton: this.jeton,
        refresh_token: this.refreshToken,
      });
    } catch (erreur) {
      if (generation !== this.generationSession) return null;
      this.jeton = null;
      this.refreshToken = null;
      if (
        erreur?.statut === 401 ||
        erreur?.statut === 403 ||
        erreur?.statut === 404
      ) {
        this.sauvegarderSessionPersiste(null);
      }
      return null;
    }
  },

  async deconnexionPartout() {
    const generation = this.generationSession;
    this.verifierReseauConnecte();
    await this.appelHttp('/api/auth/logout-all', { methode: 'POST' });
    this.verifierGenerationSession(generation);
    await this.deconnexion();
  },

  async deconnexionAutres() {
    const generation = this.generationSession;
    this.verifierReseauConnecte();
    this.rotationJetonEnCours = true;
    try {
      const reponse = await this.appelHttp('/api/auth/logout-others', {
        methode: 'POST',
      });
      this.verifierGenerationSession(generation);
      if (
        typeof reponse?.jeton !== 'string' ||
        !reponse.jeton.trim() ||
        typeof reponse.refresh_token !== 'string' ||
        !reponse.refresh_token.trim()
      ) {
        throw new Error('ERR_RECONNEXION_REQUISE');
      }
      this.memoriserJetons(reponse);
      this.connecterSocket();
    } finally {
      if (generation === this.generationSession)
        this.rotationJetonEnCours = false;
    }
  },

  async deconnexion() {
    const refreshToken = this.refreshToken;
    this.generationSession += 1;
    this.renouvellementEnCours = null;
    this.refreshToken = null;
    this.rotationJetonEnCours = false;
    this.fermetureVoulue = true;
    this.arreterPollPresence();
    this.annulerReconnexionPlanifiee();
    this.arreterBattementCoeur();
    this.fermerSocket();
    this.jeton = null;
    this.utilisateurConnecte = null;
    this.sauvegarderSessionPersiste(null);
    this.utilisateursConnus.clear();
    this.presences = {};
    this.profilsPublics.clear();
    this.avatarsARafraichir = false;
    this.dejaConnecte = false;
    this.horsLigneTempsReel.clear();
    this.enLigneTempsReel = null;
    this.indexMessages.clear();
    this.salonsRejoints.clear();
    this.roomsSocketRejointes.clear();
    this.partenairesDmConnus.clear();
    this.serveurs.clear();
    this.salonVersServeur.clear();
    this.etatsSaisie = [];
    this.definirEtatConnexion('deconnecte');
    if (refreshToken) {
      await this.appelHttp('/api/auth/logout', {
        methode: 'POST',
        corps: { refresh_token: refreshToken },
      }).catch(() => undefined);
    }
  },

  async verifierSessionApres401() {
    if (this.verificationSessionEnCours || this.rotationJetonEnCours) return;
    this.verificationSessionEnCours = true;
    const jeton = this.jeton;
    try {
      const reponse = await fetch(`${this.baseUrlHttp}/api/auth/me`, {
        headers: { Authorization: `Bearer ${jeton}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (reponse.status === 401 && this.jeton === jeton) {
        if (this.refreshToken) {
          await this.renouvelerSession();
          return;
        }
        await this.deconnexion();
        this.emettre('session-expiree');
      }
    } catch {
    } finally {
      this.verificationSessionEnCours = false;
    }
  },

  obtenirUtilisateurConnecte() {
    return this.utilisateurConnecte ? { ...this.utilisateurConnecte } : null;
  },

  async profilObtenir() {
    const generation = this.generationSession;
    const brut = await this.appelHttp('/api/auth/me');
    this.verifierGenerationSession(generation);
    const utilisateur = this.mapperUtilisateur(brut);
    this.utilisateurConnecte = utilisateur;
    this.enregistrerUtilisateurConnu(utilisateur);
    return utilisateur;
  },

  async profilModifierPseudo(pseudo) {
    const generation = this.generationSession;
    const brut = await this.appelHttp('/api/auth/me', {
      methode: 'PATCH',
      corps: { pseudo },
    });
    this.verifierGenerationSession(generation);
    const utilisateur = this.mapperUtilisateur(brut);
    this.utilisateurConnecte = utilisateur;
    this.enregistrerUtilisateurConnu(utilisateur);
    this.annoncerProfil();
    return utilisateur;
  },

  async profilModifierCompte({ motDePasse, motDePasseActuel }) {
    const generation = this.generationSession;
    const corps = { mot_de_passe_actuel: motDePasseActuel };
    if (motDePasse !== undefined) corps.mot_de_passe = motDePasse;
    this.rotationJetonEnCours = motDePasse !== undefined;
    try {
      const brut = await this.appelHttp('/api/auth/me', {
        methode: 'PATCH',
        corps,
      });
      this.verifierGenerationSession(generation);
      const utilisateur = this.mapperUtilisateur(brut);
      this.utilisateurConnecte = utilisateur;
      this.enregistrerUtilisateurConnu(utilisateur);
      if (motDePasse !== undefined) {
        await this.renouvelerJetonApresChangementMotDePasse(
          utilisateur.courriel,
          motDePasse
        );
      }
      return utilisateur;
    } finally {
      if (generation === this.generationSession)
        this.rotationJetonEnCours = false;
    }
  },

  async renouvelerJetonApresChangementMotDePasse(identifiant, motDePasse) {
    const generation = this.generationSession;
    let reponse;
    try {
      reponse = await this.appelHttp('/api/auth/login', {
        methode: 'POST',
        corps: { identifiant, mot_de_passe: motDePasse },
      });
    } catch {
      throw new Error('ERR_RECONNEXION_REQUISE');
    }
    this.verifierGenerationSession(generation);
    this.memoriserJetons(reponse);
    this.connecterSocket();
  },

  async profilSupprimerCompte(motDePasseActuel) {
    const generation = this.generationSession;
    this.arreterPollPresence();
    try {
      await this.appelHttp('/api/auth/me', {
        methode: 'DELETE',
        corps: { mot_de_passe_actuel: motDePasseActuel },
      });
    } catch (erreur) {
      if (this.sessionActive()) this.demarrerPollPresence();
      throw erreur;
    }
    this.verifierGenerationSession(generation);
    await this.deconnexion();
  },
};
