'use strict';

const {
  DELAI_ACK_REJOINDRE_SALON_MS,
  DELAI_RECONNEXION_INITIAL_MS,
  DELAI_REPLI_CONNEXION_PRETE_MS,
  creerDmId,
} = require('./constantes');

module.exports = {
  connecterSocket() {
    this.fermerSocket();
    const socket = this.creerSocket(`${this.baseUrlSocket}/messages`, {
      auth: { token: this.jeton },
      reconnection: false,
      transports: ['websocket'],
    });
    this.socket = socket;
    const ecouter = (evenement, rappel) =>
      socket.on(evenement, (...args) => {
        if (this.socket === socket) rappel(...args);
      });

    ecouter('connect', () => {
      this.annulerReconnexionPlanifiee();
      this.delaiReconnexionActuelMs = DELAI_RECONNEXION_INITIAL_MS;
      this.definirEtatConnexion('connecte');
      this.demarrerBattementCoeur();
      if (this.dejaConnecte) this.avatarsARafraichir = true;
      this.dejaConnecte = true;
      clearTimeout(this.minuteurRepliConnexionPrete);
      this.minuteurRepliConnexionPrete = setTimeout(() => {
        if (this.socket === socket && !this.socketPret) marquerPret();
      }, DELAI_REPLI_CONNEXION_PRETE_MS);
    });

    const marquerPret = () => {
      clearTimeout(this.minuteurRepliConnexionPrete);
      this.socketPret = true;
      this.emettre('synchronisation-requise');
      this.annoncerPresence();
      this.cleSuiviPresence = null;
      this.suivrePresence();
      this.roomsSocketRejointes.clear();
      for (const salonId of this.salonsRejoints) {
        this.rejoindreSocketSalon(salonId);
      }
    };
    ecouter('connexion.prete', () => {
      marquerPret();
    });

    ecouter('private-message.created', (m) => this.traiterMessageDmEntrant(m));
    ecouter('private-message.updated', (m) => this.traiterMessageDmModifie(m));
    ecouter('private-message.delivered', (m) =>
      this.traiterMessageDmModifie(m)
    );
    ecouter('private-message.deleted', (m) => this.traiterMessageDmSupprime(m));
    ecouter('room-message.created', (m) => this.traiterMessageSalonEntrant(m));
    ecouter('room-message.updated', (m) => this.traiterMessageSalonModifie(m));
    ecouter('room-message.deleted', (m) => this.traiterMessageSalonSupprime(m));
    ecouter('typing', (evt) => this.traiterSaisieEntrante(evt));
    ecouter('presence.changed', (evt) => this.traiterPresenceEntrante(evt));
    ecouter('profil.changed', (evt) => this.traiterProfilEntrant(evt));
    ecouter('serveur.change', (evt) => this.traiterServeurEntrant(evt));
    ecouter('read-state.updated', (evt) => {
      void this.traiterLectureEntrante(evt);
    });
    ecouter('room-message.revoked', (evt) => {
      if (typeof evt?.roomId === 'string') {
        this.roomsSocketRejointes.delete(evt.roomId);
      }
    });

    ecouter('session.revoquee', () => {
      void this.verifierSessionApres401();
    });

    ecouter('disconnect', () => {
      this.enLigneTempsReel = null;
      this.planifierReconnexion();
    });

    ecouter('connect_error', () => {
      this.planifierReconnexion();
    });
  },

  rejoindreSocketSalon(salonId) {
    const socket = this.socket;
    if (!socket || !this.socketPret || this.roomsSocketRejointes.has(salonId)) {
      return;
    }
    this.roomsSocketRejointes.add(salonId);
    socket
      .timeout(DELAI_ACK_REJOINDRE_SALON_MS)
      .emit('room-message.join', { roomId: salonId }, (erreur, reponse) => {
        if (this.socket !== socket) return;
        if (erreur || reponse?.joined !== true) {
          this.roomsSocketRejointes.delete(salonId);
        }
      });
  },

  traiterMessageDmEntrant(brut) {
    void this.confirmerLivraisonDm(brut);
    const message = this.mapperMessageDm(brut);
    this.indexMessages.set(message.id, { type: 'dm' });
    this.partenairesDmConnus.add(
      this.autreParticipantDm(message.conversationId)
    );
    this.emettre('message-recu', { conversationType: 'dm', message });
  },

  traiterMessageDmModifie(brut) {
    const message = this.mapperMessageDm(brut);
    this.indexMessages.set(message.id, { type: 'dm' });
    this.emettre('message-modifie', message);
  },

  traiterMessageDmSupprime(brut) {
    this.indexMessages.delete(brut.id);
    this.emettre('message-supprime', { messageId: brut.id });
  },

  traiterMessageSalonEntrant(brut) {
    const message = this.mapperMessageSalon(brut);
    this.indexMessages.set(message.id, { type: 'salon', roomId: brut.roomId });
    this.emettre('message-recu', {
      conversationType: 'salon',
      salonId: brut.roomId,
      serveurId: this.salonVersServeur.get(brut.roomId) ?? null,
      message,
    });
  },

  traiterMessageSalonModifie(brut) {
    const message = this.mapperMessageSalon(brut);
    this.indexMessages.set(message.id, { type: 'salon', roomId: brut.roomId });
    this.emettre('message-modifie', message);
  },

  traiterMessageSalonSupprime(brut) {
    this.indexMessages.delete(brut.id);
    this.emettre('message-supprime', { messageId: brut.id });
  },

  traiterSaisieEntrante(evt) {
    if (!evt || !this.utilisateurConnecte) return;
    const conversationId =
      evt.scope === 'dm'
        ? creerDmId(this.utilisateurConnecte.id, evt.userId)
        : evt.targetId;
    const etat = {
      conversationId,
      utilisateurId: evt.userId,
      est_saisie: Boolean(evt.isTyping),
    };
    const index = this.etatsSaisie.findIndex(
      (item) =>
        item.conversationId === etat.conversationId &&
        item.utilisateurId === etat.utilisateurId
    );
    if (index !== -1) this.etatsSaisie[index] = etat;
    else this.etatsSaisie.push(etat);
    this.emettre('saisie', etat);
  },
};
