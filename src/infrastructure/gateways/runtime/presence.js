'use strict';

const {
  DELAI_ACK_REJOINDRE_SALON_MS,
  DELAI_SUIVI_PRESENCE_MS,
  INTERVALLE_POLL_PRESENCE_MS,
  MAX_PRESENCES_SUIVIES,
} = require('./constantes');

module.exports = {
  suivrePresence() {
    clearTimeout(this.minuteurSuiviPresence);
    this.minuteurSuiviPresence = null;
    const socket = this.socket;
    if (!socket || !this.socketPret) return;
    const moi = this.utilisateurConnecte?.id;
    const ids = [...this.utilisateursConnus.keys()]
      .filter((id) => id !== moi)
      .slice(-MAX_PRESENCES_SUIVIES);
    const cle = ids.join(',');
    if (cle === this.cleSuiviPresence) return;
    this.cleSuiviPresence = cle;
    socket
      .timeout(DELAI_ACK_REJOINDRE_SALON_MS)
      .emit('presence.suivre', { ids }, (erreur, reponse) => {
        if (this.socket !== socket) return;
        if (erreur) {
          this.cleSuiviPresence = null;
          this.planifierSuiviPresence();
          return;
        }
        this.traiterInstantanePresence(reponse, ids);
      });
  },

  planifierSuiviPresence() {
    if (this.minuteurSuiviPresence) return;
    this.minuteurSuiviPresence = setTimeout(
      () => this.suivrePresence(),
      DELAI_SUIVI_PRESENCE_MS
    );
  },

  definirPresenceInterne({ utilisateurId, statut }) {
    this.presences[utilisateurId] = statut;
    const presence = { utilisateurId, statut, vuLaDerniereFois: Date.now() };
    this.emettre('presence', presence);
    return presence;
  },

  async modifierPresence({ statut }) {
    this.verifierReseauConnecte();
    await this.appelHttp('/api/config-utilisateur/presence', {
      methode: 'PUT',
      corps: { statut: statut === 'en-ligne' ? 'enLigne' : 'horsLigne' },
    });
    const presence = this.definirPresenceInterne({
      utilisateurId: this.utilisateurConnecte.id,
      statut,
    });
    this.annoncerPresence();
    this.annoncerProfil();
    return presence;
  },

  annoncerPresence() {
    const statut = this.presences[this.utilisateurConnecte?.id];
    if (!statut || !this.socketPret || !this.socket?.connected) return;
    this.socket.emit('presence.update', { statut });
  },

  traiterInstantanePresence(evt, suivis) {
    if (
      !Array.isArray(evt?.enLigne) ||
      !evt.enLigne.every((id) => typeof id === 'string')
    ) {
      return;
    }
    this.enLigneTempsReel = new Set(evt.enLigne);
    const moi = this.utilisateurConnecte?.id;
    const connus = new Set([
      ...(suivis ?? [
        ...this.utilisateursConnus.keys(),
        ...Object.keys(this.presences),
      ]),
      ...evt.enLigne,
    ]);
    for (const id of connus) {
      if (id === moi) continue;
      const statut = this.enLigneTempsReel.has(id) ? 'en-ligne' : 'hors-ligne';
      if (this.presences[id] !== statut) {
        this.definirPresenceInterne({ utilisateurId: id, statut });
      }
    }
  },

  traiterPresenceEntrante(evt) {
    if (
      typeof evt?.userId !== 'string' ||
      (evt.statut !== 'en-ligne' && evt.statut !== 'hors-ligne')
    ) {
      return;
    }
    if (evt.statut === 'hors-ligne') {
      this.horsLigneTempsReel.set(evt.userId, Date.now());
      this.enLigneTempsReel?.delete(evt.userId);
    } else {
      this.horsLigneTempsReel.delete(evt.userId);
      this.enLigneTempsReel?.add(evt.userId);
    }
    if (this.presences[evt.userId] !== evt.statut) {
      this.definirPresenceInterne({
        utilisateurId: evt.userId,
        statut: evt.statut,
      });
    }
  },

  obtenirPresences() {
    const carte = {};
    for (const id of this.utilisateursConnus.keys()) {
      carte[id] = this.presences[id] ?? 'hors-ligne';
    }
    if (this.utilisateurConnecte) {
      carte[this.utilisateurConnecte.id] =
        this.presences[this.utilisateurConnecte.id] ?? 'en-ligne';
    }
    return carte;
  },

  demarrerPollPresence() {
    this.arreterPollPresence();
    const rafraichir = async () => {
      if (!this.utilisateurConnecte) return;
      try {
        const config = await this.configObtenir();
        const jamaisDefinie = config.vuLaDerniereFois === null;
        const statut = jamaisDefinie ? 'en-ligne' : config.statutPresence;
        if (statut === 'en-ligne') {
          await this.appelHttp('/api/config-utilisateur/presence', {
            methode: 'PUT',
            corps: { statut: 'enLigne' },
          });
        }
        if (this.presences[this.utilisateurConnecte.id] !== statut) {
          this.definirPresenceInterne({
            utilisateurId: this.utilisateurConnecte.id,
            statut,
          });
          this.annoncerPresence();
        }
      } catch {}
      const autres = [...this.utilisateursConnus.keys()];
      const avecAvatars = this.avatarsARafraichir;
      this.avatarsARafraichir = false;
      const tempsReelActif = this.socketPret && this.enLigneTempsReel !== null;
      if (autres.length && (!tempsReelActif || avecAvatars)) {
        await this.chargerProfilsPublics(autres, {
          inclureAvatar: avecAvatars,
        });
      }
    };
    this.minuteurPollPresence = setInterval(
      rafraichir,
      INTERVALLE_POLL_PRESENCE_MS
    );
    void rafraichir();
  },

  arreterPollPresence() {
    if (this.minuteurPollPresence) clearInterval(this.minuteurPollPresence);
    this.minuteurPollPresence = null;
  },
};
