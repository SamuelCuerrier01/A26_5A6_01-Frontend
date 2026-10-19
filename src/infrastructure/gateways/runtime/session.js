'use strict';

const { DELAI_RECONNEXION_INITIAL_MS } = require('./constantes');

module.exports = {
  mapperUtilisateur(brut) {
    return {
      id: brut.id,
      pseudo: brut.pseudo,
      courriel: brut.courriel,
      role: brut.role,
    };
  },

  ouvrirSession({ utilisateur, jeton }) {
    this.jeton = jeton;
    this.utilisateurConnecte = this.mapperUtilisateur(utilisateur);
    this.enregistrerUtilisateurConnu(this.utilisateurConnecte);
    this.sauvegarderJetonPersiste(jeton);
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
    const reponse = await this.appelHttp('/api/auth/login', {
      methode: 'POST',
      corps: { identifiant, mot_de_passe: motDePasse },
    });
    return this.ouvrirSession(reponse);
  },

  async inscrire({ courriel, motDePasse, pseudo }) {
    const TENTATIVES_MAX = 2;
    let pseudoTente = pseudo;
    for (let tentative = 0; tentative < TENTATIVES_MAX; tentative += 1) {
      try {
        const reponse = await this.appelHttp('/api/auth/register', {
          methode: 'POST',
          corps: { pseudo: pseudoTente, courriel, mot_de_passe: motDePasse },
        });
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
    const jeton = this.chargerJetonPersiste();
    if (!jeton) return null;
    this.jeton = jeton;
    try {
      const utilisateur = await this.appelHttp('/api/auth/me');
      return this.ouvrirSession({ utilisateur, jeton });
    } catch (erreur) {
      this.jeton = null;
      if (
        erreur?.statut === 401 ||
        erreur?.statut === 403 ||
        erreur?.statut === 404
      ) {
        this.sauvegarderJetonPersiste(null);
      }
      return null;
    }
  },

  async deconnexionPartout() {
    this.verifierReseauConnecte();
    await this.appelHttp('/api/auth/logout-all', { methode: 'POST' });
    await this.deconnexion();
  },

  async deconnexionAutres() {
    this.verifierReseauConnecte();
    this.rotationJetonEnCours = true;
    try {
      const reponse = await this.appelHttp('/api/auth/logout-others', {
        methode: 'POST',
      });
      if (typeof reponse?.jeton !== 'string' || !reponse.jeton.trim()) {
        throw new Error('ERR_RECONNEXION_REQUISE');
      }
      this.jeton = reponse.jeton;
      this.sauvegarderJetonPersiste(reponse.jeton);
      this.connecterSocket();
    } finally {
      this.rotationJetonEnCours = false;
    }
  },

  async deconnexion() {
    this.generationSession += 1;
    this.fermetureVoulue = true;
    this.arreterPollPresence();
    this.annulerReconnexionPlanifiee();
    this.arreterBattementCoeur();
    this.fermerSocket();
    this.jeton = null;
    this.utilisateurConnecte = null;
    this.sauvegarderJetonPersiste(null);
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
  },

  async verifierSessionApres401() {
    if (this.verificationSessionEnCours || this.rotationJetonEnCours) return;
    this.verificationSessionEnCours = true;
    const jeton = this.jeton;
    try {
      const reponse = await fetch(`${this.baseUrlHttp}/api/auth/me`, {
        headers: { Authorization: `Bearer ${jeton}` },
      });
      if (reponse.status === 401 && this.jeton === jeton) {
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
    const brut = await this.appelHttp('/api/auth/me');
    const utilisateur = this.mapperUtilisateur(brut);
    this.utilisateurConnecte = utilisateur;
    this.enregistrerUtilisateurConnu(utilisateur);
    return utilisateur;
  },

  async profilModifierPseudo(pseudo) {
    const brut = await this.appelHttp('/api/auth/me', {
      methode: 'PATCH',
      corps: { pseudo },
    });
    const utilisateur = this.mapperUtilisateur(brut);
    this.utilisateurConnecte = utilisateur;
    this.enregistrerUtilisateurConnu(utilisateur);
    this.annoncerProfil();
    return utilisateur;
  },

  async profilModifierCompte({ motDePasse, motDePasseActuel }) {
    const corps = { mot_de_passe_actuel: motDePasseActuel };
    if (motDePasse !== undefined) corps.mot_de_passe = motDePasse;
    this.rotationJetonEnCours = motDePasse !== undefined;
    try {
      const brut = await this.appelHttp('/api/auth/me', {
        methode: 'PATCH',
        corps,
      });
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
      this.rotationJetonEnCours = false;
    }
  },

  async renouvelerJetonApresChangementMotDePasse(identifiant, motDePasse) {
    let reponse;
    try {
      reponse = await this.appelHttp('/api/auth/login', {
        methode: 'POST',
        corps: { identifiant, mot_de_passe: motDePasse },
      });
    } catch {
      throw new Error('ERR_RECONNEXION_REQUISE');
    }
    this.jeton = reponse.jeton;
    this.sauvegarderJetonPersiste(reponse.jeton);
    this.connecterSocket();
  },

  async profilSupprimerCompte(motDePasseActuel) {
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
    await this.deconnexion();
  },
};
