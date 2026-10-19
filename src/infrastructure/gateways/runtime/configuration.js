'use strict';

module.exports = {
  mapperConfig(brut) {
    return {
      alias: brut.alias ?? null,
      theme: brut.theme,
      langue: brut.langue,
      statutPresence:
        brut.statutPresence === 'enLigne' ? 'en-ligne' : 'hors-ligne',
      vuLaDerniereFois: brut.vuLaDerniereFois ?? null,
      modeNotification: brut.modeNotification,
      avatar: brut.avatar ?? null,
    };
  },

  async configObtenir() {
    const generation = this.generationSession;
    const config = this.mapperConfig(
      await this.appelHttp('/api/config-utilisateur')
    );
    this.verifierGenerationSession(generation);
    this.memoriserProfilSoi(config);
    return config;
  },

  async configModifier({ alias, theme, langue, modeNotification, avatar }) {
    const generation = this.generationSession;
    const corps = {};
    if (avatar !== undefined) corps.avatar = avatar ?? '';
    if (alias !== undefined) corps.alias = alias;
    if (theme !== undefined) corps.theme = theme;
    if (langue !== undefined) corps.langue = langue;
    if (modeNotification !== undefined)
      corps.modeNotification = modeNotification;
    const config = this.mapperConfig(
      await this.appelHttp('/api/config-utilisateur', {
        methode: 'PATCH',
        corps,
      })
    );
    this.verifierGenerationSession(generation);
    this.memoriserProfilSoi(config);
    if (alias !== undefined || avatar !== undefined) this.annoncerProfil();
    return config;
  },

  annoncerProfil() {
    if (this.socketPret && this.socket?.connected) {
      this.socket.emit('profil.update');
    }
  },

  async rafraichirProfil(utilisateurId) {
    const generation = this.generationSession;
    const pseudoAvant = this.utilisateursConnus.get(utilisateurId)?.pseudo;
    await Promise.all([
      this.resoudrePseudosInconnus([utilisateurId]),
      this.chargerProfilsPublics([utilisateurId]),
    ]);
    this.verifierGenerationSession(generation);
    const pseudoApres = this.utilisateursConnus.get(utilisateurId)?.pseudo;
    if (pseudoAvant !== undefined && pseudoAvant !== pseudoApres) {
      this.emettre('profils-publics', [utilisateurId]);
    }
  },

  async rafraichirProfilSoi() {
    const generation = this.generationSession;
    const moi = this.utilisateurConnecte?.id;
    if (!moi) return;
    try {
      const config = await this.configObtenir();
      this.verifierGenerationSession(generation);
      if (
        config.vuLaDerniereFois !== null &&
        this.presences[moi] !== config.statutPresence
      ) {
        this.definirPresenceInterne({
          utilisateurId: moi,
          statut: config.statutPresence,
        });
      }
      this.emettre('profil-soi', config);
    } catch {}
  },

  traiterProfilEntrant(evt) {
    const id = evt?.userId;
    if (typeof id !== 'string') return;
    if (id === this.utilisateurConnecte?.id) {
      void this.rafraichirProfilSoi();
      return;
    }
    if (!this.utilisateursConnus.has(id) && !this.profilsPublics.has(id))
      return;
    void this.rafraichirProfil(id);
  },

  traiterServeurEntrant(evt) {
    if (typeof evt?.serveurId !== 'string' || typeof evt.raison !== 'string') {
      return;
    }
    if (
      evt.raison === 'membres' &&
      evt.cibleId !== this.utilisateurConnecte?.id &&
      this.serveurs.get(evt.serveurId)?.parDefaut
    ) {
      return;
    }
    this.emettre('serveur-change', {
      serveurId: evt.serveurId,
      raison: evt.raison,
      cibleId: typeof evt.cibleId === 'string' ? evt.cibleId : null,
    });
  },
};
