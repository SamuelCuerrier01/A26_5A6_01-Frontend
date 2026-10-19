'use strict';

const {
  CAUSE_HORS_LIGNE,
  CAUSE_SERVEUR_INJOIGNABLE,
  DELAI_BATTEMENT_COEUR_MS,
  DELAI_RECONNEXION_INITIAL_MS,
  DELAI_RECONNEXION_MAX_MS,
  INTERVALLE_BATTEMENT_COEUR_MS,
} = require('./constantes');

module.exports = {
  sessionActive() {
    return Boolean(this.jeton && this.utilisateurConnecte);
  },

  fermerSocket() {
    const socket = this.socket;
    this.socket = null;
    this.socketPret = false;
    clearTimeout(this.minuteurRepliConnexionPrete);
    this.enLigneTempsReel = null;
    clearTimeout(this.minuteurSuiviPresence);
    this.minuteurSuiviPresence = null;
    this.cleSuiviPresence = null;
    socket?.disconnect();
  },

  annulerReconnexionPlanifiee() {
    if (this.minuteurReconnexion) clearTimeout(this.minuteurReconnexion);
    this.minuteurReconnexion = null;
  },

  planifierReconnexion() {
    if (!this.sessionActive() || this.fermetureVoulue) return;
    this.arreterBattementCoeur();
    if (this.horsLigneSysteme) {
      this.definirEtatConnexion('deconnecte', { cause: CAUSE_HORS_LIGNE });
      return;
    }
    if (this.minuteurReconnexion) return;
    const delai = this.delaiReconnexionActuelMs;
    this.delaiReconnexionActuelMs = Math.min(
      this.delaiReconnexionActuelMs * 2,
      DELAI_RECONNEXION_MAX_MS
    );
    this.definirEtatConnexion('reconnexion', {
      cause: CAUSE_SERVEUR_INJOIGNABLE,
      prochaineTentative: Date.now() + delai,
    });
    this.minuteurReconnexion = setTimeout(() => {
      this.minuteurReconnexion = null;
      if (
        !this.sessionActive() ||
        this.fermetureVoulue ||
        this.horsLigneSysteme
      )
        return;
      this.reconnexions += 1;
      this.definirEtatConnexion('reconnexion', {
        cause: CAUSE_SERVEUR_INJOIGNABLE,
      });
      this.connecterSocket();
    }, delai);
  },

  reconnecterMaintenant() {
    if (!this.sessionActive()) return this.obtenirEtatConnexion();
    this.annulerReconnexionPlanifiee();
    this.delaiReconnexionActuelMs = DELAI_RECONNEXION_INITIAL_MS;
    this.fermetureVoulue = false;
    if (this.horsLigneSysteme) {
      return this.definirEtatConnexion('deconnecte', {
        cause: CAUSE_HORS_LIGNE,
      });
    }
    this.definirEtatConnexion('reconnexion', {
      cause: this.etatConnexion.cause ?? CAUSE_SERVEUR_INJOIGNABLE,
    });
    this.connecterSocket();
    return this.obtenirEtatConnexion();
  },

  signalerReseauSysteme(enLigne) {
    const etaitHorsLigne = this.horsLigneSysteme;
    this.horsLigneSysteme = !enLigne;
    if (!enLigne) {
      if (etaitHorsLigne) return;
      this.annulerReconnexionPlanifiee();
      this.arreterBattementCoeur();
      this.fermerSocket();
      if (this.sessionActive()) {
        this.definirEtatConnexion('deconnecte', { cause: CAUSE_HORS_LIGNE });
      }
      return;
    }
    if (etaitHorsLigne) this.reconnecterMaintenant();
  },

  signalerReveil() {
    if (this.sessionActive() && !this.fermetureVoulue) {
      this.reconnecterMaintenant();
    }
  },

  demarrerBattementCoeur() {
    this.arreterBattementCoeur();
    this.minuteurBattementCoeur = setInterval(async () => {
      if (this.etatConnexion.statut !== 'connecte') return;
      const socket = this.socket;
      try {
        const reponse = await this.fetchAvecDelai(
          `${this.baseUrlHttp}/api/health`,
          DELAI_BATTEMENT_COEUR_MS
        );
        if (!reponse.ok) throw new Error(`ERR_HTTP_${reponse.status}`);
      } catch {
        if (this.socket !== socket || this.etatConnexion.statut !== 'connecte')
          return;
        this.fermerSocket();
        this.planifierReconnexion();
      }
    }, INTERVALLE_BATTEMENT_COEUR_MS);
  },

  arreterBattementCoeur() {
    if (this.minuteurBattementCoeur) clearInterval(this.minuteurBattementCoeur);
    this.minuteurBattementCoeur = null;
  },

  fetchAvecDelai(url, delaiMs) {
    const controleur = new AbortController();
    const minuteur = setTimeout(() => controleur.abort(), delaiMs);
    return fetch(url, { signal: controleur.signal }).finally(() =>
      clearTimeout(minuteur)
    );
  },

  async modifierEtatSaisie({ conversationId, est_saisie }) {
    this.verifierReseauConnecte();
    if (!this.socket || !this.socket.connected) {
      throw new Error('ERR_RESEAU_NON_CONNECTE');
    }
    const estDm = String(conversationId).includes(':');
    const scope = estDm ? 'dm' : 'room';
    const targetId = estDm
      ? this.autreParticipantDm(conversationId)
      : conversationId;
    this.socket.emit('typing', {
      scope,
      targetId,
      isTyping: Boolean(est_saisie),
    });
    return {
      conversationId,
      utilisateurId: this.utilisateurConnecte?.id,
      est_saisie: Boolean(est_saisie),
    };
  },

  obtenirEtatsSaisie(param) {
    const id = typeof param === 'string' ? param : param?.conversationId;
    if (!id) return [];
    return this.etatsSaisie
      .filter((item) => item.conversationId === id)
      .map((item) => ({ ...item }));
  },
};
